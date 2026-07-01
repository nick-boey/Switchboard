# api-auth-gate Specification

## Purpose
TBD - created by archiving change foundations. Update Purpose after archive.
## Requirements
### Requirement: Reject unauthenticated requests by default

The API SHALL reject any request to a protected route that presents neither a valid bearer
credential nor a trusted Tailscale serve identity. Protected routes are exactly the
application API under the reserved **`/api/*`** namespace; the gate applies
reject-by-default **within** `/api` (including unknown `/api` paths, which are rejected as
API rather than served the SPA). The `GET /health` liveness endpoint AND all non-`/api`
paths — the public web SPA static assets and the `index.html` history fallback — SHALL be
exempt (unauthenticated), as they carry no secrets.

#### Scenario: No credentials on a protected route

- **WHEN** a request to a protected `/api/*` route arrives with no valid bearer token and
  no trusted serve identity
- **THEN** the API responds `401`

#### Scenario: An unknown API path is gated, not served the SPA

- **WHEN** an unauthenticated request arrives for an unknown `/api/*` path
- **THEN** the API rejects it (`401`) and does not return the SPA shell

#### Scenario: Health endpoint is exempt

- **WHEN** `GET /health` is requested with no credentials
- **THEN** the API responds `200`

#### Scenario: Non-API paths are public

- **WHEN** a `GET` request for a non-`/api` path (e.g. `/` or a clean SPA path) arrives
  with no credentials
- **THEN** the API does not reject it for auth; it serves the public SPA (per
  `web-app-serving`)

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
in configuration (`trustServeIdentity`) AND the request arrived on the **dedicated serve
ingress** — the serve-exclusive loopback-TCP listener that `tailscale serve` proxies to,
bound only inside the container's network namespace and not published to the host; a trusted,
allowlisted identity is admitted to the protected **`/api/*`** routes without a bearer token.
This is the **served SPA's authorisation path**: the same-origin, tokenless `/api` calls the
served SPA makes (per `web-app-serving`) are admitted by serve identity, not by any secret in
the browser — so a working phone session is not just the SPA shell loading but its `/api`
calls actually succeeding under identity alone. Admission SHALL depend ONLY on the identity-eligible
serve ingress (a **bind-time** property, not a header inference) plus an allowlisted
`tailscale-user-login` — the sole identity header `tailscale serve` injects. The identity path
SHALL NOT require any `tailscale-headers-info` header (`tailscale serve` does not emit one) nor a
CGNAT `x-forwarded-for`; those values, when present, MAY be checked opportunistically as
defence-in-depth but SHALL NEVER be a precondition for admission, so their absence SHALL NOT cause
a fallthrough to `401`.

The **bearer path remains available on every ingress, including this one** (the bearer-token
requirement is unchanged by serve identity): a request presenting a valid bearer token SHALL always
be admitted. Serve-identity denial takes effect only in the absence of a valid bearer token — a
present-but-non-allowlisted `tailscale-user-login` SHALL yield `403` ONLY when the request carries
no valid bearer token; a request with no `tailscale-user-login` and no valid bearer SHALL yield
`401`. A request arriving on the direct loopback-TCP ingress SHALL never be admitted by this
identity path, regardless of the headers it carries.

#### Scenario: Allowlisted serve identity reaches a real /api route without a bearer token

- **WHEN** `trustServeIdentity` is enabled AND a request to a **real** protected `/api/*`
  route arrives on the dedicated serve ingress carrying an allowlisted `tailscale-user-login`,
  with **no** `Authorization` header
- **THEN** the request is admitted and handled by that `/api` route (not rejected `401`/`403`),
  so the served SPA's tokenless calls succeed

#### Scenario: A realistic serve request with only tailscale-user-login is admitted (regression)

- **WHEN** `trustServeIdentity` is enabled AND a request to an `/api/*` route arrives on the
  dedicated serve ingress carrying ONLY an allowlisted `tailscale-user-login` — with **no**
  `tailscale-headers-info` header and **no** CGNAT `x-forwarded-for` (the shape a real
  `tailscale serve` produces) — and **no** `Authorization` header
- **THEN** the request is admitted and handled (not `401`) — reproducing the served-SPA defect
  where the identity path previously required the non-existent `tailscale-headers-info` marker and
  so rejected every tokenless call with `401`

#### Scenario: A valid bearer token is admitted on the serve ingress regardless of the login (regression)

- **WHEN** a request to an `/api/*` route arrives on the dedicated serve ingress carrying a valid
  `Authorization: Bearer` token, whether the `tailscale-user-login` header is absent, allowlisted,
  or **present but not allowlisted**
- **THEN** the request is admitted via the bearer path (`200`, `source: bearer`) — the bearer path
  is unchanged by serve identity, so a non-allowlisted login SHALL NOT shadow a valid bearer token

#### Scenario: Non-allowlisted serve identity without a bearer token is forbidden on /api

- **WHEN** `trustServeIdentity` is enabled AND a request to an `/api/*` route arrives on the
  dedicated serve ingress presenting a `tailscale-user-login` that is not in the allowlist
  (e.g. the default empty allowlist) AND carrying **no** valid bearer token
- **THEN** the API responds `403` and does not handle the route

#### Scenario: A forbidden serve identity is logged observably

- **WHEN** a serve request on the dedicated serve ingress is refused `403` because its
  `tailscale-user-login` is not in `identityAllowlist` (and it carried no valid bearer token)
- **THEN** the server emits a warning-level log identifying the rejected login (so an operator can
  see they must add it to `identityAllowlist`), and that log carries no bearer token or other
  redacted secret

#### Scenario: Identity headers on the direct loopback ingress are never trusted on /api

- **WHEN** a request to an `/api/*` route carrying an allowlisted `tailscale-user-login` (and any
  serve headers) arrives on the direct loopback-TCP ingress rather than the dedicated serve ingress
- **THEN** the identity path does not admit it; it is rejected unless it carries a valid bearer
  token

### Requirement: Identity trust requires a serve-exclusive ingress

The system SHALL treat serve identity as trustworthy only on a **dedicated serve ingress**
that `tailscale serve` proxies to and that is the exclusive ingress for serve traffic — a
loopback-TCP listener on its own port, bound only inside the container's network namespace
and NOT published to the host, with `tailscale serve` as its only configured proxy. Its
trust rests on **container network isolation** (no host-published API port + serve being
the sole proxy to it), applied as an ingress-scoped flag at **bind time**, NOT on request
headers. A serve listener SHALL be identity-eligible ONLY when the runtime asserts it is
not published to the host (the container/`--docker` runtime, per `container-runtime`); a
serve listener that is host-reachable SHALL be bearer-only and never identity-eligible, so
enabling `trustServeIdentity` cannot make a host-reachable serve port admit a forged
identity. A configuration that pairs serve-identity trust with a serve ingress outside that
container-isolated runtime is rejected at config/bootstrap validation (see `app-runtime`),
so an identity-eligible serve listener is, by construction, always container-isolated.
Identity trust SHALL default to disabled in the **mode-agnostic** configuration schema; the
container (`--docker`) runtime — the only runtime that asserts no host publication — SHALL
enable it **by default only at first-run config creation** (written into the newly created
configuration), SHALL respect a persisted value when loading an existing configuration, and
SHALL NOT flip trust on for an already-provisioned container whose configuration does not
carry the field. The serve-identity **allowlist SHALL default to empty**, so even with trust
enabled no identity is admitted (`403`) until an operator adds one — the allowlist, not the
trust flag, is the effective gate; the empty default applies to newly created configurations
and SHALL NOT rewrite an existing persisted allowlist. When trust is disabled the API SHALL
ignore `tailscale-user-*` headers on every ingress. The direct loopback-TCP ingress SHALL be
bearer-only: it SHALL ignore `tailscale-user-*` headers unconditionally, so a process that
can reach the direct loopback port can no longer present a trusted identity.

#### Scenario: A fresh container creates a config with trust on and a closed allowlist

- **WHEN** a `--docker` runtime bootstraps for the **first time** (no existing config) and
  creates `config.json`
- **THEN** the created config has `trustServeIdentity` enabled AND `identityAllowlist`
  empty, so the serve ingress admits no identity (`403`) until an operator adds a login

#### Scenario: An existing container is not silently upgraded to trust

- **WHEN** a `--docker` runtime loads an **existing** `config.json` that does not set
  `trustServeIdentity` (e.g. one provisioned before this change, possibly carrying a
  non-empty persisted `identityAllowlist`)
- **THEN** identity trust remains disabled (the first-run default applies only to newly
  created configs) and the persisted allowlist is left untouched, so no identity is admitted
  until the operator explicitly enables trust

#### Scenario: An explicit trust setting is not overridden in the container

- **WHEN** a `--docker` runtime loads a configuration with `trustServeIdentity` explicitly
  set to `false`
- **THEN** trust stays disabled (the first-run default never overrides a persisted value)

#### Scenario: Non-container runtimes still default trust disabled

- **WHEN** a non-`--docker` runtime starts with no explicit `trustServeIdentity`
- **THEN** identity trust is disabled and `tailscale-user-*` headers are ignored on every
  ingress

#### Scenario: The direct loopback ingress is bearer-only even with trust enabled

- **WHEN** `trustServeIdentity` is enabled AND a request presenting the full serve markers
  and an allowlisted identity arrives on the direct loopback-TCP ingress rather than the
  dedicated serve ingress
- **THEN** the identity is not trusted on that ingress and the request is rejected unless
  it carries a valid bearer token

#### Scenario: Identity headers never reach handlers as trusted unless admitted

- **WHEN** any request presents `tailscale-user-*` headers
- **THEN** they are not exposed to route handlers as a trusted identity unless admitted by
  the rules above (on the dedicated serve ingress, with trust enabled and an allowlisted
  login)

#### Scenario: A host-reachable serve ingress is never identity-eligible

- **WHEN** a serve ingress is bound outside the container-isolated runtime (host-reachable,
  no no-host-publication assertion) AND a request arrives on it carrying the full serve
  markers and an allowlisted `tailscale-user-login`
- **THEN** the identity path does not admit it — those forged markers grant nothing on a
  host-reachable serve port — and the request is rejected unless it carries a valid bearer
  token

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

