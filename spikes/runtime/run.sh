#!/usr/bin/env sh
# Build + run the throwaway runtime spike.
#   1. cp .env.example .env  and set TS_AUTHKEY
#   2. ./run.sh
# Named volumes persist tailscale state + ~/.switchboard across restarts (a spike
# question). The host's ~/.claude is mounted read-only to test credential visibility.
set -eu
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "No .env found. Run:  cp .env.example .env  then set TS_AUTHKEY."
  exit 1
fi

IMAGE=switchboard-runtime-spike
docker build -t "$IMAGE" .

docker run --rm -it \
  --name switchboard-runtime-spike \
  --env-file .env \
  -v switchboard-spike-tsstate:/var/lib/tailscale \
  -v switchboard-spike-config:/root/.switchboard \
  -v "${HOME}/.claude:/root/.claude:ro" \
  "$IMAGE"

# Notes:
#  • Userspace networking (in entrypoint.sh) needs no special caps. If it proves
#    unreliable, swap to kernel TUN by adding:
#       --cap-add=NET_ADMIN --device=/dev/net/tun
#    and removing --tun=userspace-networking from entrypoint.sh.
#  • To test persistence: Ctrl-C, re-run ./run.sh — tailscale should NOT re-auth
#    and ~/.switchboard contents should remain.
