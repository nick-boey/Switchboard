# container-runtime Specification

## Purpose
TBD - created by archiving change runtime-cli-docker. Update Purpose after archive.
## Requirements
### Requirement: Userspace Tailscale bring-up without elevated capabilities

The container image SHALL run `tailscaled` in **userspace-networking** mode so it needs neither
`NET_ADMIN` nor `/dev/net/tun`, and SHALL authenticate to the tailnet using a **mounted auth-key
secret** read by **file reference** (`tailscale up --auth-key=file:<path>`) so the key value stays
file-resident and never appears in process arguments, logs, or image layers — never an auth key
baked into the image. Kernel TUN (`NET_ADMIN` + `/dev/net/tun`) MAY be used as a documented fallback
if userspace networking proves unreliable.

#### Scenario: Tailscale comes up in userspace mode

- **WHEN** the container starts
- **THEN** `tailscaled` runs with userspace networking and the container requires no `NET_ADMIN`
  capability or `/dev/net/tun` device

#### Scenario: Authentication uses a mounted secret

- **WHEN** `tailscale up` runs
- **THEN** it reads the auth key from the mounted secret BY FILE REFERENCE (`--auth-key=file:<path>`),
  the raw key never appears in process arguments or logs, and no auth key is present in the image
  layers

### Requirement: `tailscale serve` is the exclusive ingress to the serve port

The container SHALL expose the API **only** through `tailscale serve` (HTTPS) proxied to the server's
**dedicated loopback-TCP serve ingress** (`http://127.0.0.1:<servePort>`), and SHALL NOT publish any
API port to the host network — so serve is the exclusive ingress (enforced by container network
isolation) and identity trust rests on that ingress (per the auth gate). By publishing no API port to
the host, the container runtime is what **asserts** the serve ingress is not host-reachable; this
assertion is the precondition that makes the serve ingress identity-eligible (per the auth gate), and
the container runtime is therefore the ONLY runtime in which serve-identity trust is permitted — in
any runtime that does not assert it, the serve ingress is bearer-only. The `tailscale serve`
invocation SHALL be pinned to `tailscale serve --bg --https=443 http://127.0.0.1:<servePort>`, and the
minimum Tailscale version SHALL be pinned to **v1.50.0** (the release that introduced the `--bg` flag
and the positional `<target>` reverse-proxy form) and asserted at bring-up — not left to a best-effort
fallback chain. A Unix-domain-socket target is **not** used because `tailscale serve` proxies only to
`http://127.0.0.1`.

#### Scenario: Serve proxies to the serve port and no port is published

- **WHEN** the container runtime is up
- **THEN** `tailscale serve` proxies HTTPS to the server's dedicated loopback-TCP serve ingress
  (`http://127.0.0.1:<servePort>`), and no API port is published to the host network

#### Scenario: The serve invocation and minimum version are pinned

- **WHEN** the runtime brings up `tailscale serve`
- **THEN** it runs `tailscale serve --bg --https=443 http://127.0.0.1:<servePort>` after asserting the
  installed Tailscale is at least v1.50.0, not a best-effort fallback chain

#### Scenario: Container isolation is the precondition for serve-identity eligibility

- **WHEN** the container runtime is up with no API port published to the host
- **THEN** the serve ingress is identity-eligible (serve-identity trust is permitted here, per the auth
  gate); a runtime that does not assert no-host-publication does not make the serve ingress
  identity-eligible

### Requirement: State and configuration persist across container restart

The container runtime SHALL persist the Tailscale state and `~/.switchboard` (config, secrets, and
run directory as appropriate) on **named volumes**, so a restart reconnects to the tailnet **without
re-authenticating** and the configuration — including the generated bearer token — survives.

#### Scenario: Restart reconnects without re-auth

- **WHEN** the container is restarted with its named volumes attached
- **THEN** Tailscale reconnects without re-authenticating and the persisted `~/.switchboard` config
  is intact

### Requirement: The runtime image includes the Claude CLI

The runtime image SHALL install the `claude` CLI (`@anthropic-ai/claude-code`) onto `PATH` as a
**build-time install baked into the image** — never a runtime download — so that the in-container
`claude` login can be performed and the session orchestrator's `claude --session-id <uuid>
--remote-control` launches (spawned by **bare command name**, `apps/server/src/sessions/orchestrator.ts`)
resolve inside the container. The install SHALL permit the package's lifecycle (postinstall) scripts so
the published install completes (the runtime's npm skips dependency scripts by default). This image-
contents requirement is the precondition that makes the credential-persistence strategy below
meaningful: persisting `~/.claude` only helps if a runnable `claude` exists to consume it.

#### Scenario: The image provides a runnable claude CLI

- **WHEN** the runtime image is built and a shell runs `claude --version` inside it
- **THEN** the `claude` binary resolves on `PATH` and reports its version (a "not found" or non-zero
  exit fails the image smoke)

#### Scenario: The orchestrator's bare `claude` launch resolves in the container

- **WHEN** the session orchestrator spawns `claude --session-id <uuid> --remote-control=<name> --name
  <name>` by bare command name inside the container
- **THEN** the `claude` executable is found on `PATH`, so the launch fails (if at all) only on a missing
  login — a separate, typed launch error — never on executable-not-found

#### Scenario: The pinned CLI does not self-update at runtime

- **WHEN** the container runs `claude` and is later restarted (its `~/.claude` volume persisting)
- **THEN** the image's pinned `claude` is not mutated or migrated by an auto-update (the auto-updater is
  disabled in the image), so `claude` resolves consistently on every run — the install is fixed at build
  time, not a runtime download

### Requirement: Claude credential and secret persistence strategy

The runtime SHALL make the host's `claude` login usable inside the container by persisting `~/.claude`
on a **named volume populated by an in-container `claude` login** — because mounting a macOS host's
`~/.claude` does not carry a working login into a Linux container (the credential lives in the
Keychain, not `~/.claude/.credentials.json`) — or alternatively by running on a Linux host where
`~/.claude/.credentials.json` exists; and it SHALL supply the GitHub PAT and the Tailscale auth key as
**mounted secrets** that are never baked into the image and never logged.

#### Scenario: Claude credentials persist via a named volume

- **WHEN** `claude` is authenticated once inside the container and `~/.claude` is a named volume
- **THEN** subsequent container restarts retain the working `claude` login, so `claude
  --remote-control` can launch

#### Scenario: Secrets are mounted, never baked or logged

- **WHEN** the runtime needs the GitHub PAT or the Tailscale auth key
- **THEN** they are read from mounted secrets, are absent from the image layers, and are never written
  to logs, telemetry, or process arguments (the Tailscale auth key is passed to `tailscale up` by
  file reference, not inlined)

