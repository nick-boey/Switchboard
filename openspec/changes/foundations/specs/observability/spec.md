## ADDED Requirements

### Requirement: Request telemetry

The server SHALL emit OpenTelemetry spans following semantic conventions for handled HTTP
requests.

#### Scenario: A span is recorded per request

- **WHEN** the server handles an HTTP request
- **THEN** an OpenTelemetry span is recorded with semconv HTTP attributes

### Requirement: Sensitive-data redaction

Telemetry SHALL NOT contain secrets or sensitive repository/host data.

#### Scenario: Blocklisted attributes are scrubbed before export

- **WHEN** a span would otherwise include a blocklisted attribute (authorization header,
  bearer token or PAT, clone URL, absolute filesystem path, command arguments, or a GitHub
  error body)
- **THEN** that attribute is removed or masked before the span is exported

### Requirement: Configurable exporter

The system SHALL select the telemetry exporter from configuration, defaulting to no
external export.

#### Scenario: Default emits nothing externally

- **WHEN** no exporter is configured
- **THEN** no telemetry is exported outside the process

#### Scenario: OTLP export when enabled

- **WHEN** the exporter is configured as `otlp` with an endpoint
- **THEN** spans are exported via OTLP to that endpoint
