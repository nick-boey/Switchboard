# cli-runtime Specification

## Purpose
TBD - created by archiving change runtime-cli-docker. Update Purpose after archive.
## Requirements
### Requirement: The CLI bootstraps configuration and serves a supervised runtime

The `switchboard` CLI SHALL, on `start`, bootstrap configuration (provision `~/.switchboard` and run
`loadConfig()`), build a `RuntimeContext`, and run the server via the imported `start(ctx)` under
supervision; it SHALL print the bound loopback URL as its single machine-readable stdout line and
send all logs to stderr. The CLI SHALL NOT reimplement the server — it imports the server's exported
`start(ctx)`. On a host `start` (no `--docker`) the CLI SHALL NOT assert container isolation: any
serve ingress it binds is host-reachable and therefore bearer-only, and a configuration that pairs
serve-identity trust with a serve ingress SHALL be rejected at bootstrap (per the `app-runtime` config
validation) rather than binding a host-reachable, identity-eligible port.

#### Scenario: Local start bootstraps config and serves

- **WHEN** `switchboard start` is run with no `~/.switchboard` present
- **THEN** the config is bootstrapped with secure defaults, the server starts on the loopback-TCP
  ingress, and the bound URL is printed to stdout

#### Scenario: Host start refuses serve-identity trust on a serve ingress

- **WHEN** `switchboard start` (no `--docker`) bootstraps a config that enables `trustServeIdentity`
  together with a serve ingress
- **THEN** bootstrap fails fast with a clear error and the server does not begin listening (a
  host-reachable serve port is never made identity-eligible)

#### Scenario: The CLI imports the server rather than reimplementing it

- **WHEN** the CLI serves
- **THEN** it runs the server's exported `start(ctx)` (the same shipped entrypoint), not a private
  copy of the server

### Requirement: Supervised server lifecycle (graceful shutdown + bounded restart)

The CLI SHALL supervise the server it starts: a SIGINT/SIGTERM SHALL trigger a graceful
`handle.close()` (releasing every ingress listener) and then exit **without
restarting**, while an **unexpected** server failure (a rejected `start(ctx)` or a handle that closes
without a signal) SHALL be restarted with **bounded exponential backoff** up to a give-up ceiling,
after which the CLI exits non-zero so the fault is surfaced rather than crash-looping silently. On
that unexpected-failure path the supervisor SHALL `close()` the crashed handle (releasing EVERY
ingress listener) BEFORE backing off and rebinding — because a handle is a dual-listener handle whose
crash signal can fire when only ONE listener has closed, a restart must begin from a fully released
listener set so the surviving listener cannot leak (and the rebind cannot fail `EADDRINUSE`). A
close() error on this path SHALL be swallowed/logged so it cannot wedge the restart loop.

#### Scenario: Signal-driven shutdown does not restart

- **WHEN** the supervised server receives SIGINT or SIGTERM
- **THEN** the handle is closed gracefully and the process exits without starting a new server

#### Scenario: Unexpected crash is restarted with bounded backoff

- **WHEN** the server fails unexpectedly (not via a signal)
- **THEN** the supervisor restarts it after a bounded backoff delay, up to the give-up ceiling

#### Scenario: A single-listener crash releases every listener before rebinding

- **WHEN** a dual-listener handle's crash signal fires because ONE listener closed while the OTHER is
  still bound
- **THEN** the supervisor closes the crashed handle (releasing EVERY listener) before the next start
  rebinds, so the surviving listener does not leak and the rebind does not fail `EADDRINUSE`

#### Scenario: Repeated rapid failures give up non-zero

- **WHEN** the server fails unexpectedly more times than the give-up ceiling within the backoff
  window
- **THEN** the supervisor stops restarting and the CLI exits with a non-zero status

### Requirement: `--docker` mode brings up and supervises the container runtime

The CLI SHALL, in `--docker` mode (as the container entrypoint), bring up the container runtime in
order — start `tailscaled` (userspace networking), `tailscale up` reading the mounted auth-key secret
BY FILE REFERENCE (`--auth-key=file:<path>`, so the key value never enters argv or logs), start the
server on the dedicated serve ingress, then expose it with the **pinned** `tailscale serve`
invocation `tailscale serve --bg --https=443 http://127.0.0.1:<servePort>` after asserting the
installed Tailscale is at least **v1.50.0** — and SHALL supervise both `tailscaled` and the server
CONCURRENTLY for the container's lifetime, forwarding shutdown signals to `tailscaled`. A non-zero
`tailscale serve` exit SHALL fail the bring-up (the runtime is not healthy without its only external
HTTPS ingress), and an unexpected `tailscaled` exit SHALL close the server and exit non-zero (never
report a healthy runtime behind a dead Tailscale ingress). The bring-up steps and their argv SHALL go
through an injectable runner so the wiring is testable without a real Tailscale daemon or Docker.
Because `--docker` mode publishes **no** API port to the host (per `container-runtime`), it is the
runtime that asserts the serve ingress is not host-reachable; it is therefore the ONLY mode in which
the serve ingress is identity-eligible (per the auth gate) and in which `trustServeIdentity` may be
paired with a serve ingress.

#### Scenario: Docker-mode bring-up runs in order

- **WHEN** the CLI is started in `--docker` mode
- **THEN** it invokes, in order, `tailscaled` (userspace), `tailscale up` reading the mounted auth key
  by file reference (`--auth-key=file:<path>`, never the raw key in argv), `start(ctx)` on the
  dedicated serve ingress, and `tailscale serve --bg --https=443 http://127.0.0.1:<servePort>`
  pointed at that port

#### Scenario: The pinned serve invocation and minimum version are asserted

- **WHEN** `--docker` mode brings up `tailscale serve`
- **THEN** it asserts the installed Tailscale version is at least v1.50.0 and runs exactly `tailscale
  serve --bg --https=443 http://127.0.0.1:<servePort>` (the pinned argv), not a best-effort fallback
  chain

#### Scenario: A rotated env auth key overrides a stale persisted secret file

- **WHEN** `--docker` mode resolves the Tailscale auth key and a raw env key (`TS_AUTHKEY` /
  `TAILSCALE_AUTHKEY`) is set while a default secret file from an earlier (rotated-out) key persists
  on the mounted `/root/.switchboard` volume
- **THEN** the CLI materialises the CURRENT env value to the default secret file by an atomic,
  mode-`600` rewrite and `tailscale up` reads that current value by file reference — so a rotated key
  recovers across restarts rather than the runtime re-using the revoked persisted key (an explicit
  `TS_AUTHKEY_FILE` path still takes precedence and is used as-is; the raw key never enters argv)

#### Scenario: Shutdown signals are forwarded to tailscaled

- **WHEN** the container receives a shutdown signal in `--docker` mode
- **THEN** the CLI gracefully closes the server and forwards the signal to `tailscaled`

#### Scenario: A failed `tailscale serve` fails the bring-up

- **WHEN** `tailscale serve` exits non-zero after the server has started
- **THEN** the CLI closes the server and the bring-up exits non-zero — it does NOT report a healthy
  runtime, because the only external HTTPS ingress was never configured

#### Scenario: An unexpected tailscaled exit is not reported as healthy

- **WHEN** `tailscaled` exits unexpectedly (not via a shutdown signal) while the server is running
- **THEN** the CLI closes the server and exits non-zero, rather than continuing to report a healthy
  runtime with no Tailscale ingress

### Requirement: npm-distributed packaged CLI with a smoke test

The `switchboard` CLI SHALL be distributed via npm (`npx switchboard` / `npm i -g`) as a built bin,
and a packaged-CLI **smoke test** SHALL exercise the **built** artifact (not a workspace import),
asserting that `--version` prints the version, that `start` boots a loopback server whose
unauthenticated `/health` responds `200`, and that `/health` is reachable on the dedicated serve
ingress's port.

#### Scenario: The built bin reports its version

- **WHEN** the built `switchboard --version` is run
- **THEN** it prints the package version and exits `0`

#### Scenario: The built bin serves health over both ingresses

- **WHEN** the built bin is started with a listen specification including the dedicated serve ingress
- **THEN** `GET /health` responds `200` on the direct loopback-TCP ingress and on the dedicated serve
  ingress's port

