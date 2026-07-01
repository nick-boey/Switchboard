# app-runtime Specification

## Purpose
TBD - created by archiving change foundations. Update Purpose after archive.
## Requirements
### Requirement: Server lifecycle via RuntimeContext

The server SHALL start from a `RuntimeContext` and a listen specification that MAY include a direct
loopback-TCP ingress, a dedicated loopback-TCP serve ingress (on its own port), or both; it SHALL
expose the health endpoint on every configured ingress and shut down gracefully via the returned
handle, releasing every listener. Both ingresses SHALL bind loopback only. When binding multiple
ingresses, a bind failure on any listener SHALL close every listener already opened in that
`start(ctx)` call before the error propagates — a partial bind SHALL NOT leak an un-closable
listener (which would otherwise wedge the supervisor's restart loop). `close()` SHALL release every
listener and resolve even when a listener has ALREADY closed itself (e.g. a single-listener crash on
the supervisor's restart path), so the surviving listeners are still torn down and the teardown does
not reject. The dedicated serve ingress
SHALL be a separate listener whose identity-trust eligibility is fixed at bind time (per the auth
gate) and which is intended to be reached only via `tailscale serve` and not published to the host. The
serve ingress SHALL be identity-eligible only when the runtime asserts it is not host-published (the
container runtime); otherwise it SHALL be bound bearer-only.

#### Scenario: Boots and reports health

- **WHEN** `start(ctx)` is called with a valid `RuntimeContext` and a listen specification
- **THEN** the server listens on each configured ingress and `GET /health` (the unauthenticated
  liveness endpoint) responds `200` on each

#### Scenario: Loopback bind only

- **WHEN** the server is running with any configured ingress
- **THEN** each ingress is reachable on `127.0.0.1` and is not bound to any non-loopback interface

#### Scenario: Dedicated serve ingress is a separate loopback listener

- **WHEN** the server is started with a dedicated serve ingress in the listen specification
- **THEN** it listens on the serve ingress's own loopback-TCP port (distinct from the direct ingress),
  binds loopback only, and `GET /health` on that port responds `200`

#### Scenario: Graceful shutdown

- **WHEN** `close()` is called on the returned handle
- **THEN** the server stops accepting connections on every ingress and releases every listener's port

#### Scenario: close() tolerates an already-released listener

- **WHEN** `close()` is called on a multi-ingress handle in which one listener has already closed
  itself (a single-listener crash on the supervisor's restart path)
- **THEN** `close()` releases the surviving listener(s) and resolves successfully rather than
  rejecting on the already-closed listener — every listener ends up released

#### Scenario: A partial multi-ingress bind leaks no listener

- **WHEN** the server has bound one ingress and a later ingress fails to bind (e.g. its port is in use)
- **THEN** the already-opened listener is closed (its port released) before `start(ctx)` rejects, so
  no listener is leaked and a supervised retry can rebind cleanly

### Requirement: Configuration loading and validation

The system SHALL provide a `loadConfig()` step that reads `~/.switchboard/config.json` and validates
it against the shared Zod schema — including the runtime **listen specification** (the direct
loopback-TCP ingress and the optional dedicated serve ingress) — and it is invoked before
`start(ctx)`, which receives
the already-parsed config on its `RuntimeContext`. The CLI's config **bootstrap** SHALL be the
provisioning front door: it SHALL provision `~/.switchboard` (the config file and the secrets/run
directories) with secure permissions and SHALL be idempotent — leaving an existing valid
configuration intact and creating only what is missing. Startup SHALL refuse to proceed on invalid
configuration. A configuration that enables serve-identity trust (`trustServeIdentity`) **together
with** a serve ingress SHALL be rejected as invalid UNLESS the runtime asserts the serve ingress is
not published to the host (the container/`--docker` runtime); config/bootstrap validation SHALL fail
fast with a clear, field-named error outside that runtime, because it would otherwise bind a
host-reachable, identity-eligible port that any local process could reach with forged markers. A serve
ingress **without** serve-identity trust is permitted for local host use and is bearer-only. A listen
specification that pins the direct and serve ingresses to the **same fixed (non-ephemeral) port**
SHALL be rejected as invalid (the two listeners could never both bind); two ephemeral ports (`0`) are
permitted because the OS assigns each a distinct port.

#### Scenario: First run creates secure defaults

- **WHEN** `loadConfig()` runs and no config file exists
- **THEN** one is created with secure defaults (a generated bearer token, identity trust disabled, the
  default listen specification) at file mode `600`

#### Scenario: Bootstrap is idempotent over an existing config

- **WHEN** the CLI config bootstrap runs against an already-provisioned, valid `~/.switchboard`
- **THEN** the existing configuration (including the bearer token) is left intact, only missing pieces
  are created, and the directory/file permissions remain restrictive (`700` directory, `600` file)

#### Scenario: Invalid config refuses to start

- **WHEN** `loadConfig()` finds the config file fails schema validation (including an invalid listen
  specification)
- **THEN** it throws a clear error naming the offending field and startup does not proceed (the server
  does not begin listening)

#### Scenario: Duplicate fixed listen ports are rejected

- **WHEN** the listen specification pins the direct ingress and the serve ingress to the same fixed
  (non-ephemeral) port
- **THEN** validation fails fast with a clear, field-named error (`listen.serve.port`) and startup does
  not proceed — the impossible dual bind is never attempted

#### Scenario: Parsed config is exposed on the context

- **WHEN** `loadConfig()` succeeds and `start(ctx)` is called with the result
- **THEN** `RuntimeContext.config` exposes the parsed, typed values (including the listen
  specification)

#### Scenario: Serve-identity trust on a host-reachable serve ingress is rejected

- **WHEN** config/bootstrap validation runs outside the container runtime (no no-host-publication
  assertion) with `trustServeIdentity` enabled AND the listen specification includes a serve ingress
- **THEN** it fails fast with a clear, field-named error and startup does not proceed — the
  host-reachable, identity-eligible port is never bound

### Requirement: Validated typed API contract

The API SHALL validate request inputs with Zod and expose a typed client that mirrors the
server routes.

#### Scenario: Invalid input is rejected before the handler

- **WHEN** a request body fails Zod validation
- **THEN** the API responds `422` and the route handler is not invoked

#### Scenario: Client/server contract drift fails the build

- **WHEN** the typed client is type-checked against the server `AppType`
- **THEN** any route/schema mismatch fails the contract test

