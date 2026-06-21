---
depends-on: []
---

`prototype-storybook-harness` has no active-change dependencies. It builds directly on
`foundations` (archived — specs merged into `openspec/specs/`), which stood up Storybook, the
production `.storybook/` config, the prototype-quarantine *exclusion*, and the `_sample`
prototype. This change completes the deferred half: the dedicated config that *renders*
prototypes. An archived change is a satisfied dependency, so `foundations` is not relisted, and
this change is immediately implementable.

`ui-prototypes-mvp` depends on this change (recorded in its `dependencies.md`): the prototyping
stage needs this harness before any sketch can be viewed. That edge points the other way.

**Capability overlap:** `prototype-workbench` is new and not carried by any other active change.
The programme page ([mvp.md](../../../docs/plans/switchboard/mvp.md), roadmap row 1b) is the
shared arbiter and lists every active change in its `openspec-changes` frontmatter.
