## MODIFIED Requirements

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
