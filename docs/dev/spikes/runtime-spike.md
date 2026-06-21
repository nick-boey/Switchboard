# Spike: Switchboard runtime (Tailscale-in-Docker, identity auth, tmux supervision)

> **Status:** ⏳ not yet run (awaiting a Tailscale auth key).
> **Harness:** [`spikes/runtime/`](../../../spikes/runtime/) (throwaway).
> **Why:** de-risk the runtime assumptions `foundations` depends on, per the
> [Switchboard MVP plan](../../plans/switchboard/mvp.md) (spike 0). Recorded findings
> here feed `foundations` design; the `spikes/runtime/` directory is deleted afterward.

## Questions & verdicts

Fill `Verdict` with ✅ / ⚠️ / ❌ and paste the evidence (server JSON, CLI output, exact
commands/versions).

### Q1 — Tailscale runs in the container and authenticates

- **Verdict:** _TBD_
- **Evidence:** _`tailscale status` output; did userspace networking suffice, or was
  `--cap-add=NET_ADMIN --device=/dev/net/tun` required?_

### Q2 — `tailscale serve` injects identity headers to the loopback app

- **Verdict:** _TBD_
- **Evidence:** _`tailscaleIdentity.login` from the served JSON; the exact working
  `tailscale serve` invocation + version; whether HTTPS/MagicDNS was required._
- **Decision impact:** _If ✅, the passwordless identity path is viable (bearer fallback
  remains for local/direct). If ❌, the gate ships bearer-token-only for MVP._

### Q3 — Config + tailscale state persist across restart

- **Verdict:** _TBD_
- **Evidence:** _Did re-running avoid re-auth? Did `~/.switchboard` contents survive?_

### Q4 — Claude credentials are usable in the container

- **Verdict:** _TBD_
- **Evidence:** _`checks.claudeCredentialsPath`; would a mounted `~/.claude` let
  `claude --remote-control` run? Read-only mount OK, or does claude need write?_

### Q5 — Detached tmux sessions can be launched and supervised

- **Verdict:** _TBD_
- **Evidence:** _`tmux ls` showing `sb-demo`; behaviour on container restart (sessions
  are expected to be ephemeral)._

## Go / no-go for `foundations`

- **Overall:** _TBD_
- **Auth gate:** _identity-header path confirmed? or bearer-only for now?_
- **Bind/serve model:** _loopback bind + serve confirmed as the ingress?_
- **Required run flags:** _userspace vs NET_ADMIN/TUN; volumes; mounts._
- **Open follow-ups for `runtime-cli-docker`:** _…_
