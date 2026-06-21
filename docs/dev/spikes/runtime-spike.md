# Spike: Switchboard runtime (Tailscale-in-Docker, identity auth, tmux supervision)

> **Status:** ✅ complete (run on a macOS host, Docker Desktop). Verdict: **GO**.
> **Harness:** [`spikes/runtime/`](../../../spikes/runtime/) (throwaway — safe to delete).
> **Why:** de-risk the runtime assumptions `foundations` depends on, per the
> [Switchboard MVP plan](../../plans/switchboard/mvp.md) (spike 0).

## Questions & verdicts

### Q1 — Tailscale runs in the container and authenticates — ✅

Connected and authenticated to the tailnet via **userspace networking** (no
`--cap-add=NET_ADMIN` / `/dev/net/tun`). Identity is GitHub-SSO-backed.

### Q2 — `tailscale serve` injects identity headers to the loopback app — ✅

The served JSON received, via `serve`:

```
tailscale-user-login:       nick-boey@github
tailscale-user-name:        nick-boey
tailscale-user-profile-pic: https://avatars.githubusercontent.com/u/...
tailscale-headers-info:     https://tailscale.com/s/serve-headers
x-forwarded-for:            100.112.71.80   (tailnet IP)
x-forwarded-proto:          https
```

- **Decision impact:** the **passwordless identity auth path is viable**. Allowlist seed
  value = `nick-boey@github`. Bearer-token fallback still ships for local/direct access.
- **Security note for `foundations`:** the app must trust `tailscale-user-*` headers
  **only on the `serve` path** — bind to loopback, and treat any direct-to-loopback
  request as bearer-only (a process that can reach the loopback port could otherwise set
  those headers). `serve` markers present to key off: `tailscale-headers-info` and the
  CGNAT `x-forwarded-for` (100.64.0.0/10).

### Q3 — Config + tailscale state persist across restart — ✅

Restart → reconnected **without re-auth** (tailscale state volume persists).
`switchboardConfigPresent: true` (the `/root/.switchboard` named volume mounts; writes to
it would persist). (Aside: `docker exec ... ls -la ~/.switchboard` misleads — the host
shell expands `~` to `/Users/...` before docker sees it; use `sh -c 'ls ~/.switchboard'`.)

### Q4 — Claude credentials are usable in the container — ❌ (on macOS host)

`claudeCredentialsPresent: false`; `ls ~/.claude` → *Permission denied*. macOS Claude Code
stores OAuth in the **Keychain**, not `~/.claude/.credentials.json`, and Docker Desktop
file-sharing denied the read regardless. Mounting the host `~/.claude` does **not** carry a
working login into a Linux container.

- **Decision impact (`runtime-cli-docker`, not `foundations`):** authenticate `claude`
  **inside** the container once and persist a `~/.claude` named volume, or run the
  container on a Linux host where `~/.claude/.credentials.json` exists. Document this in
  the runtime setup.

### Q5 — Detached tmux sessions can be launched and supervised — ✅

`tmuxSessions: "sb-demo: 1 windows (created …)"` — launched detached, visible via the app
and `docker exec ... tmux ls`.

## Go / no-go for `foundations`

**🟢 GO.** The core runtime model is proven: userspace Tailscale + `tailscale serve`
(HTTPS/443) → loopback-bound app, with **serve-injected identity** and tmux supervision.

Confirmed inputs to `foundations`:

- **Auth gate:** identity path works → ship **both** the Tailscale-identity allowlist
  (`nick-boey@github`) *and* the bearer fallback; trust identity headers only on the serve
  path; loopback bind.
- **Bind/serve model:** loopback bind + `tailscale serve` is the ingress. HTTPS on 443
  works (MagicDNS/HTTPS certs enabled on the tailnet).
- **Run flags:** userspace networking suffices (no NET_ADMIN/TUN); named volumes for
  tailscale state and `~/.switchboard`.

Deferred to `runtime-cli-docker`:

- **Claude credential strategy** on macOS hosts (in-container login + `~/.claude` volume,
  or Linux host).
- Pin the exact `tailscale serve` CLI invocation + version, and the config-volume
  write/persist path.
