## ADDED Requirements

### Requirement: Server lifecycle via RuntimeContext

The server SHALL start from a `RuntimeContext`, bind to loopback only, expose a health
endpoint, and shut down gracefully via the returned handle.

#### Scenario: Boots and reports health

- **WHEN** `start(ctx)` is called with a valid `RuntimeContext`
- **THEN** the server listens on `127.0.0.1` and `GET /health` (the unauthenticated
  liveness endpoint) responds `200`

#### Scenario: Loopback bind only

- **WHEN** the server is running
- **THEN** it is reachable on `127.0.0.1` and is not bound to any non-loopback interface

#### Scenario: Graceful shutdown

- **WHEN** `close()` is called on the returned handle
- **THEN** the server stops accepting connections and releases the port

### Requirement: Configuration loading and validation

The system SHALL provide a `loadConfig()` step that reads `~/.switchboard/config.json` and
validates it against the shared Zod schema; it is invoked before `start(ctx)`, which
receives the already-parsed config on its `RuntimeContext`. Startup SHALL refuse to proceed
on invalid configuration.

#### Scenario: First run creates secure defaults

- **WHEN** `loadConfig()` runs and no config file exists
- **THEN** one is created with secure defaults (a generated bearer token, identity trust
  disabled) at file mode `600`

#### Scenario: Invalid config refuses to start

- **WHEN** `loadConfig()` finds the config file fails schema validation
- **THEN** it throws a clear error naming the offending field and startup does not proceed
  (the server does not begin listening)

#### Scenario: Parsed config is exposed on the context

- **WHEN** `loadConfig()` succeeds and `start(ctx)` is called with the result
- **THEN** `RuntimeContext.config` exposes the parsed, typed values

### Requirement: Validated typed API contract

The API SHALL validate request inputs with Zod and expose a typed client that mirrors the
server routes.

#### Scenario: Invalid input is rejected before the handler

- **WHEN** a request body fails Zod validation
- **THEN** the API responds `422` and the route handler is not invoked

#### Scenario: Client/server contract drift fails the build

- **WHEN** the typed client is type-checked against the server `AppType`
- **THEN** any route/schema mismatch fails the contract test
