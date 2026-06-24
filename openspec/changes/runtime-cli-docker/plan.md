# Plan: runtime-cli-docker

> **Roadmap scaffold.** Records the agreed shape from the programme page so the dependency
> edges are visible. The full planning interview (`/switch-plan`) runs when this change is
> routed to. The decisions below are inherited from the programme page and from the runtime
> spike (spike 0) findings.

## Problem

Ship Switchboard as something the user can actually run: a `switchboard` CLI that bootstraps
config and supervises the server locally, plus a Docker image that brings up Tailscale and
serves the SPA on the tailnet. This **productionizes the spike-0 findings**
(`docs/dev/spikes/runtime-spike.md`): Tailscale-in-Docker, the serve identity path,
config-volume persistence, Claude credential persistence, and process/tmux supervision.

## Architecture summary

Fills out the `Switchboard.Cli` container: it owns lifecycle/orchestration — config
bootstrap into `~/.switchboard`, spawn + supervise the server's programmatic `start(ctx)`,
and a `--docker` mode — distributed via **npm** (`npx switchboard` / `npm i -g`). It is not
the server; it imports `start(ctx)`. The Docker path brings up `tailscaled` + `tailscale
serve`, which proxies **only** to a dedicated, non-host-published loopback-TCP serve ingress
(no API port published to the host). This change also lands the **deferred identity
hardening**: a **dedicated serve ingress** so identity trust rests on a serve-exclusive ingress
(set at bind time; container network isolation) rather than on header markers (per the locked
Auth decision — see `design.md` Decision 3 for why the literal UDS wording is realised as a
loopback-TCP serve port). A packaged-CLI smoke test exercises the shipped path, not just dev
imports.

## Plan page

[docs/plans/switchboard/mvp.md](../../../docs/plans/switchboard/mvp.md) — drives this change
(listed in its `openspec-changes` frontmatter); arbiter for cross-change decisions.

## Planned architecture

**Architectural impact: yes.** Activates `Switchboard.Cli`'s orchestration role and the
`Tailscale -> Switchboard.Api` serve ingress as a deployable reality (Docker + `tailscale serve`
→ a dedicated loopback serve port).
The LikeC4 overlay `docs/dev/Architecture/Planned/runtime-cli-docker.c4` (extending
`Switchboard.Cli` and the Tailscale ingress, view ids prefixed `runtime-cli-docker-*`) is
**authored during this change's full planning stage** — deferred here as a roadmap scaffold.
The Architecture review checkpoint fires when that overlay lands.

## Decisions

Inherited from the programme page and spike 0: **TypeScript** CLI, thin `apps/cli` package,
**npm** distribution, imports server `start(ctx)`; **single-user MVP, container-per-user**
deferred; a **dedicated serve ingress** (non-host-published loopback-TCP port) as the
identity-boundary hardening; config in `~/.switchboard`
with `600` perms; container secret mounting for the PAT and Claude credentials.

## Open questions

Deferred to the full planning interview — e.g. supervision/restart policy for the detached
server + tmux, Docker base image + capability set (`/dev/net/tun` + `NET_ADMIN` vs userspace),
and the exact config-volume / credential-mount layout. Settled against the spike-0 findings.
