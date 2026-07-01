---
depends-on: []
---

No ordering dependencies. This fix touches the `api-auth-gate` and `repo-clone`
capabilities; at creation time `openspec list` reports no other active changes, so there is
no capability overlap to arbitrate and nothing must complete first.
