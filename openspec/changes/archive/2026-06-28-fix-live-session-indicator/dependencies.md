---
depends-on: []
---

No ordering constraints. This fix wires the existing web header indicator to the existing
per-repo `session-list` liveness data; it touches no capability owned by another active change
(`runtime-cli-docker` covers the runtime/docker/auth capabilities only) and needs no server or
shared-schema change.
