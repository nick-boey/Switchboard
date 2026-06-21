---
depends-on:
  - prototype-storybook-harness
---

`ui-prototypes-mvp` depends on `prototype-storybook-harness`: the prototyping stage
(`switch-ui-prototype`) needs a Storybook configuration that **renders** stories under
`src/prototypes/**`, plus the `definePrototypeMeta` helper and the location-based indexer.
`foundations` shipped only the quarantine *exclusion* (the production Storybook filters
`src/prototypes/**` out) and explicitly deferred the dedicated viewing config to "the
`switch-ui-prototype` workflow." That harness must exist before any prototype here can be
sketched and reviewed, so it is a hard prerequisite (programme page,
[Change roadmap](../../../docs/plans/switchboard/mvp.md#change-roadmap)).

`foundations` (archived) is a satisfied dependency and is not relisted.

This change is also the **confirmation gate** that `repo-clone-browse` hard-depends on
(recorded in that change's `dependencies.md`): that edge points the other way.

**Capability overlap:** `ui-design-language` is new and not carried by any other active
change; `prototype-storybook-harness` carries the distinct `prototype-workbench` capability
(the viewing config), which this change consumes but does not modify. The programme page
([mvp.md](../../../docs/plans/switchboard/mvp.md)) is the shared arbiter and lists every active
change in its `openspec-changes` frontmatter.
