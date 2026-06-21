## ADDED Requirements

### Requirement: Server lifecycle via RuntimeContext

The server SHALL start from a `RuntimeContext`, bind to loopback only, expose a health
endpoint, and shut down gracefully via the returned handle.

#### Scenario: Boots and reports health

- **WHEN** `start(ctx)` is called with a valid `RuntimeContext`
- **THEN** the server listens on `127.0.0.1` and `GET /health` responds `200`

#### Scenario: Loopback bind only

- **WHEN** the server is running
- **THEN** it is reachable on `127.0.0.1` and is not bound to any non-loopback interface

#### Scenario: Graceful shutdown

- **WHEN** `close()` is called on the returned handle
- **THEN** the server stops accepting connections and releases the port

### Requirement: Configuration loading and validation

The system SHALL load `~/.switchboard/config.json`, validate it against the shared Zod
schema, and refuse to start on invalid configuration.

#### Scenario: First run creates secure defaults

- **WHEN** no config file exists at startup
- **THEN** one is created with secure defaults (including a generated bearer token) and
  file mode `600`

#### Scenario: Invalid config refuses to start

- **WHEN** the config file fails schema validation
- **THEN** `start(ctx)` fails with a clear error naming the offending field and the server
  does not begin listening

#### Scenario: Valid config is exposed on the context

- **WHEN** the config file is valid
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
