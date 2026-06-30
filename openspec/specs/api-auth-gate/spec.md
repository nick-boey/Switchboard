# api-auth-gate Specification

## Purpose
TBD - created by archiving change foundations. Update Purpose after archive.
## Requirements
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

The API SHALL trust the `tailscale-user-login` identity only when identity trust is enabled in
configuration (`trustServeIdentity`) AND the request arrived on the **dedicated serve ingress** — the
serve-exclusive loopback-TCP listener that `tailscale serve` proxies to, bound only inside the
container's network namespace and not published to the host; a trusted, allowlisted identity is
admitted without a bearer token. The Tailscale serve markers (`tailscale-headers-info` + a CGNAT
`x-forwarded-for` + `tailscale-user-login`) remain a defence-in-depth check on that ingress but are no
longer the basis of trust — the ingress is, and which ingress admitted a request is a **bind-time**
property, not a header inference. A request arriving on the direct loopback-TCP ingress SHALL never be
admitted by this identity path, regardless of the headers it carries.

#### Scenario: Allowlisted identity over the serve ingress admitted without a bearer token

- **WHEN** `trustServeIdentity` is enabled AND a request arrives on the dedicated serve ingress
  carrying the serve markers AND `tailscale-user-login` is in the allowlist
- **THEN** the request is allowed without requiring a bearer token

#### Scenario: Non-allowlisted identity over the serve ingress is forbidden

- **WHEN** `trustServeIdentity` is enabled AND a request arrives on the dedicated serve ingress with
  the serve markers present BUT `tailscale-user-login` is not in the allowlist
- **THEN** the API responds `403`

#### Scenario: Identity headers on the direct loopback ingress are never trusted

- **WHEN** a request carrying the full serve markers and an allowlisted `tailscale-user-login` arrives
  on the direct loopback-TCP ingress rather than the dedicated serve ingress
- **THEN** the identity path does not admit it; it is rejected unless it carries a valid bearer token

### Requirement: Identity trust requires a serve-exclusive ingress

The system SHALL treat serve identity as trustworthy only on a **dedicated serve ingress** that
`tailscale serve` proxies to and that is the exclusive ingress for serve traffic — a loopback-TCP
listener on its own port, bound only inside the container's network namespace and NOT published to the
host, with `tailscale serve` as its only configured proxy. Its trust rests on **container network
isolation** (no host-published API port + serve being the sole proxy to it), applied as an
ingress-scoped flag at **bind time**, NOT on request headers. A serve listener SHALL be
identity-eligible ONLY when the runtime asserts it is not published to the host (the container/
`--docker` runtime, per `container-runtime`); a serve listener that is host-reachable SHALL be
bearer-only and never identity-eligible, so enabling `trustServeIdentity` cannot make a host-reachable
serve port admit a forged identity. A configuration that pairs serve-identity trust with a serve
ingress outside that container-isolated runtime is rejected at config/bootstrap validation (see
`app-runtime`), so an identity-eligible serve listener is, by construction, always container-isolated.
Identity trust SHALL default to
disabled, and when disabled the API SHALL ignore `tailscale-user-*` headers on every ingress. The
direct loopback-TCP ingress SHALL be bearer-only: it SHALL ignore `tailscale-user-*` headers
unconditionally, so a process that can reach the direct loopback port can no longer present a trusted
identity — the residual single-tenant spoofing risk accepted under the prior header-marker model is
hereby closed for the direct loopback path.

#### Scenario: Default mode ignores identity headers on every ingress

- **WHEN** `trustServeIdentity` is disabled (the default) AND a request presents the full serve
  markers and an allowlisted `tailscale-user-login` on any ingress
- **THEN** those headers are ignored and the request is rejected unless it carries a valid bearer
  token

#### Scenario: The direct loopback ingress is bearer-only even with trust enabled

- **WHEN** `trustServeIdentity` is enabled AND a request presenting the full serve markers and an
  allowlisted identity arrives on the direct loopback-TCP ingress rather than the dedicated serve
  ingress
- **THEN** the identity is not trusted on that ingress and the request is rejected unless it carries a
  valid bearer token

#### Scenario: Identity headers never reach handlers as trusted unless admitted

- **WHEN** any request presents `tailscale-user-*` headers
- **THEN** they are not exposed to route handlers as a trusted identity unless admitted by the rules
  above (on the dedicated serve ingress, with trust enabled and an allowlisted login)

#### Scenario: A host-reachable serve ingress is never identity-eligible

- **WHEN** a serve ingress is bound outside the container-isolated runtime (host-reachable, no
  no-host-publication assertion) AND a request arrives on it carrying the full serve markers and an
  allowlisted `tailscale-user-login`
- **THEN** the identity path does not admit it — those forged markers grant nothing on a host-reachable
  serve port — and the request is rejected unless it carries a valid bearer token

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

