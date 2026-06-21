# Runtime spike (throwaway)

A self-contained Docker experiment to de-risk Switchboard's runtime **before**
`foundations` bakes the server/bind/config/auth shape in. This directory is
**throwaway** — once findings are recorded in
[`docs/dev/spikes/runtime-spike.md`](../../docs/dev/spikes/runtime-spike.md), it can be
deleted.

## Questions this answers

1. **Tailscale-in-Docker** — does `tailscaled` run in a container (userspace networking,
   no `NET_ADMIN`/`/dev/net/tun`) and authenticate from an auth key?
2. **Identity-header auth** — does `tailscale serve` inject `Tailscale-User-Login` (and
   friends) into requests reaching the loopback-bound app? This is the auth gate's
   passwordless path.
3. **Config persistence** — does a mounted volume for `~/.switchboard` (and tailscale
   state) survive a container restart without re-auth?
4. **Claude credential persistence** — is the host's `claude` login visible inside the
   container (so `claude --remote-control` would "just work")?
5. **Process/tmux supervision** — can we launch and list a detached `tmux` session?

## Prerequisites

- Docker ✅ (installed)
- A **Tailscale auth key** ⛔ (not yet — get one at
  <https://login.tailscale.com/admin/settings/keys>)
- For question 2 over HTTPS: **MagicDNS + HTTPS certificates** enabled on your tailnet
  (Admin console → DNS). Without it, `tailscale serve` falls back to a form noted by the
  entrypoint; capture whatever works.

## Run

```sh
cp .env.example .env      # then set TS_AUTHKEY
./run.sh
```

Then, from any device on your tailnet, open
`https://switchboard-spike.<your-tailnet>.ts.net/` and read the JSON:

- `tailscaleIdentity.login` populated → **Q2 ✓** (identity headers work behind serve)
- `checks.claudeCredentialsPresent: true` → **Q4 ✓**
- `checks.tmuxSessions` shows `sb-demo` → **Q5 ✓**

Inspect supervision directly:

```sh
docker exec -it switchboard-runtime-spike tmux ls
```

Test persistence (Q3): `Ctrl-C`, then `./run.sh` again — tailscale should not re-auth and
`~/.switchboard` contents should remain (named volumes `switchboard-spike-tsstate` /
`switchboard-spike-config`).

## Record findings

Fill in [`docs/dev/spikes/runtime-spike.md`](../../docs/dev/spikes/runtime-spike.md) with
the verdict + evidence for each question and the overall go/no-go. That doc — not this
directory — is the durable output that feeds `foundations` design.

## Cleanup

```sh
docker volume rm switchboard-spike-tsstate switchboard-spike-config
# and delete this spikes/runtime/ directory once findings are recorded.
```
