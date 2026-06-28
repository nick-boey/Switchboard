---
depends-on: []
---

<!--
No ordering constraints. This change is self-contained within the worktree-management
capability (apps/server/src/worktrees/git-worktree.ts) and does not depend on any other
active change. The only other active change, `runtime-cli-docker`, touches unrelated
capabilities (api-auth-gate, app-runtime, cli-runtime, container-runtime) — no overlap.
-->
