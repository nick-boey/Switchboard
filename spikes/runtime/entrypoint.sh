#!/usr/bin/env sh
# Throwaway runtime spike entrypoint.
# Brings up tailscaled (userspace networking — no NET_ADMIN / /dev/net/tun needed),
# authenticates, serves the loopback app over the tailnet, and launches a demo
# tmux session so supervision can be inspected.
set -eu

: "${TS_AUTHKEY:?Set TS_AUTHKEY in .env (get one at https://login.tailscale.com/admin/settings/keys)}"
TS_HOSTNAME="${TS_HOSTNAME:-switchboard-spike}"
APP_PORT="${PORT:-8080}"

mkdir -p /var/run/tailscale /var/lib/tailscale

echo "[spike] starting tailscaled (userspace networking)…"
tailscaled \
  --tun=userspace-networking \
  --state=/var/lib/tailscale/tailscaled.state \
  --socket=/var/run/tailscale/tailscaled.sock &
TAILSCALED_PID=$!

# Wait for the control socket.
i=0
while [ ! -S /var/run/tailscale/tailscaled.sock ] && [ "$i" -lt 30 ]; do
  sleep 0.5
  i=$((i + 1))
done

echo "[spike] tailscale up as '${TS_HOSTNAME}'…"
tailscale up --authkey="${TS_AUTHKEY}" --hostname="${TS_HOSTNAME}"

echo "[spike] starting app on 127.0.0.1:${APP_PORT}…"
PORT="${APP_PORT}" node /app/server.mjs &

sleep 1

# `tailscale serve` syntax has drifted across versions — try the modern form, then
# fall back. Pinning the exact working invocation is part of this spike's job.
echo "[spike] exposing the app via tailscale serve…"
if tailscale serve --bg --https=443 "http://127.0.0.1:${APP_PORT}" 2>/dev/null; then
  echo "[spike] served (https/443 → 127.0.0.1:${APP_PORT})"
elif tailscale serve --bg "${APP_PORT}" 2>/dev/null; then
  echo "[spike] served (default https → ${APP_PORT})"
else
  echo "[spike] !! tailscale serve failed — note the exact CLI/version in the findings doc."
  echo "[spike]    (HTTPS serve needs MagicDNS + HTTPS certs enabled on the tailnet.)"
fi

echo "[spike] launching demo tmux session 'sb-demo' for supervision check…"
tmux new-session -d -s sb-demo "while true; do date; sleep 5; done" \
  && echo "[spike] tmux session 'sb-demo' launched" \
  || echo "[spike] !! tmux launch failed"

echo ""
echo "[spike] READY."
echo "[spike]  • From a tailnet device, open: https://${TS_HOSTNAME}.<your-tailnet>.ts.net/"
echo "[spike]    and check the JSON for tailscaleIdentity + checks."
echo "[spike]  • Inspect supervision:  docker exec -it <container> tmux ls"
echo "[spike]  • Restart the container to confirm tailscale state + ~/.switchboard persist."
echo ""

# Keep the container alive on tailscaled.
wait "${TAILSCALED_PID}"
