## Context

`foundations` set up Storybook (`@storybook/react-vite` 10.4.6) with a single
`.storybook/main.ts` whose stories list is computed with `globSync` and then **filtered to drop
any path containing `prototypes`** — because Storybook 10 ignores `!` glob negations in the
`stories` array. That exclusion is correct (prototypes must stay out of the production build,
snapshots, autodocs, exports, bundles) but leaves prototypes **unviewable**. Every story renders
through `AppProviders`, which hard-codes `defaultColorScheme="light"`
(`src/providers/AppProviders.tsx:26`) — so even once prototypes render, the skill's dark-mode
lever (`emulateMedia({ colorScheme: 'dark' })`) has no effect. The web unit run excludes
`src/prototypes/**` and `**/*.stories.*` (`vitest.config.ts:21,23`), and only collects
`src/**/*.test.*`. There is no `definePrototypeMeta`, no indexer, and no second config. This
change adds the viewing half — light **and** dark — without weakening the exclusion, and makes
its own logic testable under the existing runner.

## Goals / Non-Goals

**Goals:**

- Render `src/prototypes/**` in a dedicated, dev-only Storybook, in light **and** dark.
- Preserve the production exclusion and make it **regression-tested**, not incidental.
- Provide `definePrototypeMeta` and automatic `Prototypes/<change-name>` grouping + tags.
- Keep the harness's own modules testable under foundations' Vitest.
- Be reusable, unchanged, by every later UI change's prototyping stage, and keep the
  `switch-ui-prototype` skill's instructions accurate.

**Non-Goals:**

- Visual-regression snapshots for prototypes (they stay snapshot-free / quarantined).
- Promoting or porting any prototype into production (each consuming change's work).
- Changing production **story rendering**. The only production-source touches are (a) an
  *optional* `colorScheme` prop on `AppProviders` that **defaults to `"light"`** (existing
  behaviour preserved) and (b) narrowing the Vitest prototype exclude — both behaviour-preserving
  by default.
- `apps/server`, `packages/shared`, or architecture changes.

## Decisions

- **Two configs, not an env toggle.** A separate `.storybook-prototypes/main.ts` globs only
  `src/prototypes/**`; the production `.storybook/main.ts` keeps globbing the rest. Production
  *cannot* include prototypes regardless of environment.
- **Shared modules live under `src/storybook/`.** `resolveStories(srcDir, mode)` and
  `derivePrototypeTitle(filePath)` plus the shared `PROTOTYPE_TAGS` constant live under
  `src/storybook/` — ordinary source, collected by the `src/**/*.test.*` include — and are
  imported by **both** `.storybook` configs and by the unit tests. One tested source of truth for
  the exclusion guarantee and the title/tag derivation.
- **Prototype preview drives the color scheme.** `.storybook-prototypes/preview.tsx` is a
  *separate* preview (the prototype config does not load the production preview). It supplies its
  **own** decorator wrapping stories in `AppProviders` with `colorScheme="auto"` — **not** the
  production `AppProviders` (light) decorator, so there is no nested-provider double-wrap — and
  reuses only the production `parameters` (e.g. the controls matchers). `colorScheme="auto"` lets
  `prefers-color-scheme` emulation switch light/dark. This requires `AppProviders` to accept an
  optional `colorScheme` prop (forwarded to Mantine's `defaultColorScheme`, default `"light"`);
  production callers pass nothing and are unaffected.
- **Helper at `src/prototypes/define-prototype-meta.ts`, tags only.** Matches the skill's
  `../define-prototype-meta` import. It sets `tags: PROTOTYPE_TAGS` and is spread into the meta
  literal (Storybook's static indexer rejects `export default definePrototypeMeta(...)`). It takes
  **no `change-name` argument and sets no title** — the indexer owns titles from file location, so
  a title arg would be unused.
- **Location-based indexer via a pure function.** `derivePrototypeTitle` →
  `Prototypes/<change-name>/<name>` plus `PROTOTYPE_TAGS`; wired into the prototype config's
  `experimental_indexers`. Pure derivation is unit-tested independent of Storybook's API; the
  indexer is a thin adapter, covered by the build smoke.
- **Vitest reconciliation.** Narrow the prototype exclude from `src/prototypes/**` to
  `src/prototypes/*/**` so per-change sketch folders stay quarantined (and `**/*.stories.*` keeps
  all stories out), while the shared helper `src/prototypes/define-prototype-meta.ts` and its
  co-located test ARE collected. This is the leading test-infrastructure task.
- **Distinct port 6007 + a build script.** `storybook:prototypes` serves on 6007 (alongside
  production's 6006); `storybook:prototypes:build` runs `storybook build -c .storybook-prototypes`
  for the build smoke.
- **Regression guard is the point.** The headline tests assert the production list excludes
  `src/prototypes/**` and the prototype list includes only them — a future edit can't silently
  leak prototypes or break viewing.

## Testing strategy

A **small leading "Test infrastructure" group is required**: the Vitest prototype exclude must be
narrowed (above) so the helper's co-located test is collected. After that, foundations' Vitest
(unit) and Playwright (E2E) suffice — config helpers live under `src/storybook/` and are collected
by default.

- **Vitest (unit):**
  - `resolveStories('production')` excludes every `src/prototypes/**` path; `resolveStories('prototypes')`
    includes only those (the production-exclusion regression guard).
  - `derivePrototypeTitle` maps `src/prototypes/<change>/<name>.stories.tsx` →
    `Prototypes/<change>/<name>`, preserving intermediate directories for **deeper nesting**
    (`<change>/<sub>/x.stories.tsx` → `Prototypes/<change>/<sub>/x`); files with **multiple named
    exports** keep one derived title with each export nested beneath it. Returns `PROTOTYPE_TAGS`.
  - `definePrototypeMeta({ component })` returns a meta carrying `PROTOTYPE_TAGS`, preserving
    caller props, and setting no title.
  - `AppProviders` defaults to `defaultColorScheme="light"` and honours `colorScheme="auto"`.
  - A guard test confirms a `*.stories.tsx` under a `src/prototypes/<change>/` folder is NOT
    collected by the unit run (quarantine preserved after the exclude change).
- **Storybook build smoke:** building the prototype config indexes `_sample` with title
  `Prototypes/_sample/Sample` and the `prototype` + `!autodocs` tags; building the production
  config indexes none of `src/prototypes/**`.
- **Playwright render smoke (port 6007):** the `_sample` story mounts the themed root in light;
  with `emulateMedia({ colorScheme: 'dark' })` the resolved Mantine color scheme is dark.

## Risks / Trade-offs

- **[Risk] A prototype leaks into the production build.** → Mitigation: separate config dirs
  (production never globs the folder) + the `resolveStories('production')` unit test + the
  production-build smoke asserting zero prototype stories.
- **[Risk] The `AppProviders` prop change alters production rendering.** → Mitigation: the prop
  defaults to `"light"` (current behaviour); a unit test pins the default, and no production caller
  passes the prop.
- **[Risk] The Vitest exclude change accidentally un-quarantines sketch stories.** → Mitigation:
  `**/*.stories.*` stays excluded, and a guard test asserts a sketch story is not collected.
- **[Risk] Storybook 10's `experimental_indexers` API shifts or drops tags.** → Mitigation:
  title/tag logic is pure and unit-tested; the build smoke asserts the title **and** the
  `!autodocs` tag on the indexed entry, catching adapter breakage. Storybook version is pinned.
- **[Trade-off] Two configs + a prototype preview duplicate a little boilerplate.** → Accepted:
  shared `resolveStories`/decorators keep duplication to the config shell, and a structurally
  separate production config is worth it.
