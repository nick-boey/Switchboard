## Why

The feature changes leave a working app, but nothing the user can install and run on the
tailnet. This change ties the deployment story together — the `switchboard` CLI plus a
Docker + Tailscale runtime — and lands the deferred identity-boundary hardening.

## What Changes

- Add the `switchboard` **CLI** (`apps/cli`, TypeScript, npm-distributed): config bootstrap
  into `~/.switchboard`, spawn + supervise the server's `start(ctx)`, and a `--docker` mode.
- Add a **Docker image** that brings up `tailscaled` + `tailscale serve` in front of the
  loopback-bound API, with config-volume + Claude-credential persistence.
- Land the **Unix-domain-socket serve ingress** so identity trust rests on serve-exclusive
  ingress (the deferred hardening of the locked Auth decision).
- Add a **packaged-CLI smoke test** exercising the shipped npm path.
- **BREAKING (runtime shape):** the serve ingress moves to a UDS; the loopback-TCP path
  remains bearer-only for direct/local access.

## Capabilities

### New Capabilities

- `cli-runtime`: the `switchboard` CLI — config bootstrap, server supervision, `--docker`
  mode, npm packaging + smoke test.
- `container-runtime`: the Docker image and Tailscale bring-up (`tailscaled` + `serve`),
  config-volume and credential persistence.

### Modified Capabilities

<!-- Confirmed at full planning; copy the FULL existing requirement blocks when modifying. -->
- `api-auth-gate`: harden "Identity trust requires a serve-exclusive ingress" with the
  **Unix-domain-socket serve ingress** (the deferred hardening).
- `app-runtime`: extend "Configuration loading and validation" / "Server lifecycle via
  RuntimeContext" with CLI-driven config bootstrap and supervised lifecycle.

## Impact

- `apps/cli`: new CLI package (lifecycle, Docker, Tailscale), npm packaging.
- `apps/server`: UDS serve ingress option on the bind/auth path.
- `packages/shared`: any config schema additions for the CLI bootstrap.
- Architecture: `docs/dev/Architecture/Planned/runtime-cli-docker.c4` (authored at full
  planning); activates `Switchboard.Cli` orchestration and the Tailscale serve ingress.
- Ops: Dockerfile, Tailscale config, container secret mounts.
