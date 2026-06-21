# Documentation migration: prototype-storybook-harness

Ledger of where this change's planning documentation graduates to and what permanent
documentation the change must author. Every row MUST reach `resolved` before archive; every
Plans page linked in plan.md MUST have a row.

| Source | Destination | Action | Status |
| --- | --- | --- | --- |
| `docs/plans/switchboard/mvp.md` (roadmap row 1b) | — | retire — marked row 1b `✅ archived` (kept for the historical roadmap, matching `foundations`) and dropped `prototype-storybook-harness` from the `openspec-changes` frontmatter; sibling MVP changes remain | resolved |
| `apps/web/src/prototypes/README.md` | `apps/web/src/prototypes/README.md` | merge → document how to view prototypes (`storybook:prototypes`, port 6007, light/dark via OS scheme) and author them with `definePrototypeMeta` | resolved |
| `apps/web/CLAUDE.md` | `apps/web/CLAUDE.md` | merge → add the `storybook:prototypes` / `storybook:prototypes:build` scripts and the prototype-viewing note | resolved |
| `.claude/skills/switch-ui-prototype/SKILL.md` | `.claude/skills/switch-ui-prototype/SKILL.md` | merge → update Step 3 (`definePrototypeMeta` signature without a `change-name` arg; indexer lives in `.storybook-prototypes/`) and Step 5 (launch `storybook:prototypes` on port 6007, not `pnpm storybook` on 6006) so the consumer skill matches this harness | resolved |
