---
depends-on: []
---

`foundations` is the root change of the Switchboard MVP programme — every other change
depends on it, and it depends on none.

**Prerequisite (not a `depends-on` entry):** the runtime spike (spike 0,
`spikes/runtime/`) runs before `foundations` *design* and its findings
(`docs/dev/spikes/runtime-spike.md`) settle the auth/bind/config shape. It is a throwaway
investigation, not an OpenSpec change, so it cannot be listed here — the ordering is
recorded on the [programme page](../../../docs/plans/switchboard/mvp.md#change-roadmap).

No capability overlap with other active changes (none exist yet).
