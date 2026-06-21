## Why

The `switch-ui-prototype` workflow cannot run: there is no Storybook configuration that
*renders* stories under `src/prototypes/**`, no `definePrototypeMeta` helper, no light/dark
preview path, and no quarantine-preserving way to view a sketch. `foundations` shipped only the
exclusion and deferred the viewing config to "the `switch-ui-prototype` workflow." This change
builds that harness so the prototyping stage works — for `ui-prototypes-mvp` and every later UI
change.

## What Changes

- Add a **dedicated prototype Storybook config** (`.storybook-prototypes/`) whose `main.ts`
  globs **only** `src/prototypes/**/*.stories.@(ts|tsx)`, and a **prototype-specific
  `preview.tsx`** that supplies its **own** `AppProviders` decorator with **`colorScheme="auto"`**
  (not the production light decorator) so the OS `prefers-color-scheme` (the skill's dark-mode
  lever) drives light/dark.
- Add an optional **`colorScheme` prop to `AppProviders`** (default `"light"`, so production
  rendering is unchanged) that the prototype preview sets to `"auto"`.
- Add **`storybook:prototypes`** (dev, port 6007) and **`storybook:prototypes:build`** scripts.
- Add a typed **`definePrototypeMeta`** helper at `src/prototypes/define-prototype-meta.ts`
  that pre-fills the quarantine tags (`prototype`, `!autodocs`) from a shared constant; it sets
  **no title** (the indexer derives it from file location).
- Add a **location-based indexer** in the prototype config that derives
  `Prototypes/<change-name>/<Story>` titles from the file path and applies the quarantine tags.
- **Extract shared `resolveStories` + `derivePrototypeTitle` modules under `src/storybook/`**
  (so both configs and Vitest consume one source of truth and the tests are collected), and add
  **regression tests** asserting the production list excludes `src/prototypes/**` while the
  prototype list includes only them.
- **Reconcile `apps/web/vitest.config.ts`** so the shared prototype-harness module tests are
  collected while per-change sketch folders + stories stay quarantined.
- **Update the `switch-ui-prototype` skill** (`SKILL.md`) so its launch command, port, helper
  signature, and indexer location match this harness.
- Leave production *story rendering* behaviour unchanged (the production config is refactored to
  consume `resolveStories`, but still excludes prototypes).

## Capabilities

### New Capabilities

- `prototype-workbench`: a dev-only Storybook that renders quarantined prototypes under
  `src/prototypes/**` with the real theme in light and dark, groups/tags them automatically, and
  provides the `definePrototypeMeta` helper — while the production Storybook, snapshot run,
  autodocs, and bundles keep prototypes excluded.

### Modified Capabilities

- (none — there is no existing spec for the Storybook config; the production quarantine
  behaviour is preserved and now codified as regression-tested requirements of
  `prototype-workbench`.)

## Impact

- `apps/web`: new `.storybook-prototypes/{main,preview}.ts(x)`, `src/prototypes/define-prototype-meta.ts`,
  shared `src/storybook/{resolve-stories,derive-prototype-title}.ts`, a refactor of
  `.storybook/main.ts`, an optional `colorScheme` prop on `AppProviders`, `package.json`
  scripts, a `vitest.config.ts` exclude reconciliation, and Vitest + Storybook-build + Playwright
  tests.
- `.claude/skills/switch-ui-prototype/SKILL.md`: launch/port/helper/indexer references updated.
- No `apps/server`, `packages/shared`, or LikeC4 (architecture) impact.
- Consumed by `ui-prototypes-mvp` (which depends on this change) and every later UI change.
