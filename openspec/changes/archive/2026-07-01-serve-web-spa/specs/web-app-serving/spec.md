## ADDED Requirements

### Requirement: Serve the built web SPA over the serve ingress

The API server SHALL serve the built web SPA — static assets by path, plus `index.html`
as a **history fallback** for unknown non-`/api` GET/HEAD requests — when a web bundle
root is configured, so a browser reaching the server over the Tailscale serve ingress
loads the application. The bundle SHALL be served **publicly** (ahead of and outside the
auth gate) because it carries no secrets.

#### Scenario: Root path serves the SPA shell

- **WHEN** a browser requests `GET /` with no credentials and a web bundle is configured
- **THEN** the server responds `200` with the SPA `index.html`

#### Scenario: A built asset is served by path without authentication

- **WHEN** a browser requests an existing static asset (e.g. `GET /assets/<file>`)
- **THEN** the server responds `200` with that asset and requires no authentication

#### Scenario: A clean deep-link path falls back to index.html on load/reload

- **WHEN** a browser requests or reloads a clean SPA path that is not a file and not under
  `/api` (e.g. `GET /<owner>/<repo>` or `GET /new-repo`)
- **THEN** the server responds `200` with `index.html` (the history fallback), so the
  client router can render the deep-linked page

#### Scenario: Non-GET requests outside the API namespace are not served the SPA

- **WHEN** a non-GET/HEAD request arrives for a non-`/api` path
- **THEN** the server does not return the SPA shell (it responds `404`)

### Requirement: The served SPA reaches its API same-origin without a token

The served SPA SHALL call the API at its own origin under the `/api` namespace and SHALL
NOT embed or send a bearer token; authorisation on the serve ingress is by Tailscale
identity. Local development served by Vite MAY inject an explicit server URL and bearer
token, which SHALL take precedence.

#### Scenario: SPA derives a same-origin API base

- **WHEN** the SPA loads with no injected server URL
- **THEN** it issues API requests to its own origin under `/api/*` with no `Authorization`
  header

#### Scenario: Injected dev config takes precedence

- **WHEN** the SPA loads with an injected server URL and bearer token (the `just run` dev
  path)
- **THEN** it uses that URL and sends the bearer token

### Requirement: SPA serving is opt-in by a configured bundle root

The server SHALL serve the SPA only when a web bundle root is configured; with none
configured it SHALL remain API-only (unchanged behaviour). When a bundle root is
configured but the bundle is missing, non-`/api` SPA requests SHALL fail with a clear
error and the `/api` surface SHALL be unaffected.

#### Scenario: No bundle configured → API-only

- **WHEN** the server starts with no web bundle root configured
- **THEN** it serves only the API and `/health`; non-`/api` paths are not served a SPA

#### Scenario: Bundle root configured but the bundle is missing

- **WHEN** a web bundle root is configured but `index.html` is absent
- **THEN** non-`/api` SPA requests return a clear error (e.g. `503`) and `/api` requests
  are unaffected
