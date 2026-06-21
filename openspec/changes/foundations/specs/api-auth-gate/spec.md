## ADDED Requirements

### Requirement: Reject unauthenticated requests by default

The API SHALL reject any request that presents neither a valid bearer credential nor a
trusted Tailscale serve identity.

#### Scenario: No credentials

- **WHEN** a request arrives with no valid bearer token and no trusted serve identity
- **THEN** the API responds `401`

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

The API SHALL authenticate requests arriving via `tailscale serve` by trusting
`tailscale-user-login` against the configured allowlist.

#### Scenario: Allowlisted identity is admitted without a bearer token

- **WHEN** a request carries the serve markers and `tailscale-user-login` is in the
  allowlist
- **THEN** the request is allowed without requiring a bearer token

#### Scenario: Non-allowlisted identity is forbidden

- **WHEN** a request carries the serve markers but `tailscale-user-login` is not in the
  allowlist
- **THEN** the API responds `403`

### Requirement: Identity-header spoofing protection

The API SHALL NOT trust `tailscale-user-*` headers that arrive without the `tailscale serve`
markers.

#### Scenario: Spoofed identity headers are ignored

- **WHEN** a direct (non-serve) request sets `tailscale-user-login` but lacks the serve
  markers
- **THEN** those headers are stripped/ignored and the request is treated as unauthenticated
  unless it carries a valid bearer token

### Requirement: Strict same-origin CORS

The API SHALL apply a strict CORS policy that does not grant access to disallowed origins.

#### Scenario: Disallowed cross-origin request

- **WHEN** a browser request originates from an origin that is not same-origin/allowlisted
- **THEN** the response does not return permissive CORS headers and the preflight is denied
