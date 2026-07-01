## ADDED Requirements

### Requirement: The runtime image bundles the built web SPA

The container image SHALL include the built web SPA bundle (`apps/web/dist`) and configure
the server's web bundle root to it, so the server serves the application over the serve
ingress with no separate web host. The bundle SHALL be a build artifact copied into the
image — never a runtime download.

#### Scenario: The image contains the web bundle

- **WHEN** the runtime image is built
- **THEN** it contains the built web SPA bundle and the server is configured (via its web
  bundle root) to serve it

#### Scenario: The server serves the SPA in the container

- **WHEN** the container is up and a browser requests `GET /` over the serve ingress
- **THEN** the server responds `200` with the SPA `index.html`
