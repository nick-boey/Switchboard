---
depends-on: []
---

<!--
No ordering constraints. This change modifies the already-archived `session-launch`
capability's launch argv. The active changes were scanned for overlap:
- `runtime-cli-docker` depends-on `session-launch` (archived) but never modifies the
  launch argv — it only requires that `claude --remote-control` can launch inside the
  container. No shared delta capability, so no edge in either direction.
- `page-routing` touches `web-navigation` only — unrelated.
-->
