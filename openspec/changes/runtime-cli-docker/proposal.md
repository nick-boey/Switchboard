## Why

The feature changes leave a working app, but nothing the user can install and run on the
tailnet. This change ties the deployment story together — the `switchboard` CLI plus a
Docker + Tailscale runtime — and lands the deferred identity-boundary hardening.

## What Changes

- Add the `switchboard` **CLI** (`apps/cli`, TypeScript, npm-distributed): config bootstrap
  into `~/.switchboard`, spawn + supervise the server's `start(ctx)`, and a `--docker` mode.
- Add a **Docker image** that brings up userspace `tailscaled` + `tailscale serve`. `tailscale
  serve` (HTTPS/443) proxies **only** to the server's **dedicated loopback-TCP serve ingress**
  (`http://127.0.0.1:<servePort>`, a port bound inside the container's network namespace with
  **no API port published** to the host); the **direct loopback-TCP path stays bearer-only local
  access** and is never fronted by serve. Config-volume + Claude-credential persistence.
- Land the **dedicated serve ingress** so identity trust rests on a **serve-exclusive ingress**
  — a separate loopback-TCP listener that only `tailscale serve` can reach (no host-published
  port; container network isolation is the exclusivity guarantee), with ingress-scoped identity
  trust set at **bind time** (the deferred hardening of the locked Auth decision).
- Add a **packaged-CLI smoke test** exercising the shipped npm path.
- **BREAKING (runtime shape):** the serve ingress becomes a **dedicated, non-host-published
  loopback-TCP port** distinct from the direct/local loopback ingress, which remains
  **bearer-only** for direct/local access.

## Capabilities

### New Capabilities

- `cli-runtime`: the `switchboard` CLI — config bootstrap, server supervision, `--docker`
  mode, npm packaging + smoke test.
- `container-runtime`: the Docker image and Tailscale bring-up (`tailscaled` + `serve`),
  config-volume and credential persistence.

### Modified Capabilities

<!-- Confirmed at full planning; copy the FULL existing requirement blocks when modifying. -->
- `api-auth-gate`: harden "Identity trust requires a serve-exclusive ingress" with a
  **dedicated, non-host-published loopback-TCP serve ingress** and ingress-scoped, bind-time
  identity trust (the deferred hardening).
- `app-runtime`: extend "Configuration loading and validation" / "Server lifecycle via
  RuntimeContext" with CLI-driven config bootstrap and supervised lifecycle.

## Impact

- `apps/cli`: new CLI package (lifecycle, Docker, Tailscale), npm packaging.
- `apps/server`: dedicated serve-ingress port (non-host-published loopback TCP) on the
  bind/auth path, with an ingress-scoped identity-trust flag.
- `packages/shared`: any config schema additions for the CLI bootstrap.
- Architecture: `docs/dev/Architecture/Planned/runtime-cli-docker.c4` (authored at full
  planning); activates `Switchboard.Cli` orchestration and the Tailscale serve ingress.
- Ops: Dockerfile, Tailscale config, container secret mounts.
