# Documentation migration — serve-web-spa

| Source | Destination | Action | Status |
| --- | --- | --- | --- |
| `plan.md` Decisions + `proposal.md` (the container now serves the SPA; `--docker` trust default-on; `identityAllowlist` defaults empty; the `/api/*` namespace) | `docs/user/running-switchboard.md` | `merge → docs/user/running-switchboard.md` — update the Docker run + Access-model sections: the container serves the web app (load it on your phone), the `--docker` identity-trust default, the now-empty `identityAllowlist` default + the one step of adding your tailnet login, and the migration note for existing configs. | open |
| `plan.md` (the container serves the UI) | `README.md` | `merge → README.md` — small note in "Running Switchboard" that the Docker image now serves the web UI over the tailnet (not API-only). | open |
| `docs/dev/Architecture/Planned/serve-web-spa.c4` (component `Switchboard.Api.spaStaticHost`, edge `Api -> WebSPA`, view `serve-web-spa-delivery`) | `docs/dev/Architecture/model.c4` (+ `views.c4`) | `merge → docs/dev/Architecture/model.c4` — at archive, strip `#todo`, graduate the component + delivery edge into the permanent model (and the view into `views.c4` if kept), then delete the Planned overlay file. | open |
| `plan.md` (this change's planning record) | — | `discard — superseded by the permanent docs above` — `plan.md`/`design.md` are the durable planning record inside the archived change; no separate Plans page exists to retire. | open |
