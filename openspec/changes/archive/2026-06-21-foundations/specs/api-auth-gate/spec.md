## ADDED Requirements

### Requirement: Reject unauthenticated requests by default

The API SHALL reject any request to a protected route that presents neither a valid bearer
credential nor a trusted Tailscale serve identity. The `GET /health` liveness endpoint
SHALL be exempt (unauthenticated).

#### Scenario: No credentials on a protected route

- **WHEN** a request to a protected route arrives with no valid bearer token and no trusted
  serve identity
- **THEN** the API responds `401`

#### Scenario: Health endpoint is exempt

- **WHEN** `GET /health` is requested with no credentials
- **THEN** the API responds `200`

### Requirement: Bearer-token authentication

The API SHALL accept requests presenting a bearer token that matches the token in
`~/.switchboard`.

#### Scenario: Valid bearer token

- **WHEN** a request carries `Authorization: Bearer <token>` matching the configured token
- **THEN** the request is allowed

#### Scenario: Invalid bearer token

- **WHEN** the presented bearer token does not match the configured token
- **THEN** the API responds `401`

### Requirement: Tailscale identity authentication on the serve path

The API SHALL trust the `tailscale-user-login` identity only when identity trust is enabled
in configuration (`trustServeIdentity`) AND the request carries the Tailscale serve markers;
a trusted, allowlisted identity is admitted without a bearer token.

#### Scenario: Allowlisted identity admitted without a bearer token

- **WHEN** `trustServeIdentity` is enabled AND a request carries the serve markers AND
  `tailscale-user-login` is in the allowlist
- **THEN** the request is allowed without requiring a bearer token

#### Scenario: Non-allowlisted identity is forbidden

- **WHEN** `trustServeIdentity` is enabled AND the serve markers are present BUT
  `tailscale-user-login` is not in the allowlist
- **THEN** the API responds `403`

### Requirement: Identity trust requires a serve-exclusive ingress

The system SHALL treat serve identity as trustworthy only under a deployment that guarantees
`tailscale serve` is the exclusive ingress to the API. Identity trust SHALL default to
disabled, and when disabled the API SHALL ignore `tailscale-user-*` headers regardless of
the markers (the markers select a path; they are not proof of identity). The residual
single-tenant spoofing risk under trust-enabled mode is accepted and mitigated by network
isolation (see design; a Unix-domain-socket serve ingress is the deferred hardening).

#### Scenario: Default mode ignores forged identity headers

- **WHEN** `trustServeIdentity` is disabled (the default) AND a request presents the full
  serve markers and an allowlisted `tailscale-user-login`
- **THEN** those headers are ignored and the request is rejected unless it carries a valid
  bearer token

#### Scenario: Identity headers never reach handlers as trusted unless admitted

- **WHEN** any request presents `tailscale-user-*` headers
- **THEN** they are not exposed to route handlers as a trusted identity unless admitted by
  the rules above

### Requirement: Strict CORS

The API SHALL apply a strict CORS policy that grants access only to same-origin or
explicitly configured origins, and SHALL NOT block non-browser requests that carry no
`Origin` header.

#### Scenario: Disallowed cross-origin request

- **WHEN** a browser request originates from an origin that is not same-origin/allowlisted
- **THEN** the response does not return permissive CORS headers and the preflight is denied

#### Scenario: Allowed origin

- **WHEN** a browser request originates from the app's own origin (or a configured allowed
  origin)
- **THEN** the appropriate CORS headers are returned

#### Scenario: Non-browser request without an Origin

- **WHEN** a request arrives with no `Origin` header (e.g. a direct API client)
- **THEN** CORS does not block it (the auth rules above still apply)
