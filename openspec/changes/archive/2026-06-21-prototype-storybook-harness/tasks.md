## 1. Test infrastructure

<!-- Required: design.md's gap assessment found that the Vitest prototype exclude
     (`src/prototypes/**`) would swallow the harness's own helper test. Narrow it first so the
     red steps below can actually run, without un-quarantining sketches. -->

- [x] 1.1 Reconcile `apps/web/vitest.config.ts`: narrow the prototype exclude from
      `src/prototypes/**` to `src/prototypes/*/**` (quarantine per-change sketch folders), keeping
      `**/*.stories.*` excluded — so shared prototype-harness modules at the `src/prototypes/`
      root are collected while sketch stories are not. (Also mirrored in the root `vitest.config.ts`,
      which carries the same exclude and governs `just test`.)
- [x] 1.2 Add a guard test asserting a co-located `*.test.tsx` under a `src/prototypes/<change>/`
      sketch folder is excluded from the unit run (the real over-narrowing risk: a `.test.tsx` in a
      sketch folder must stay quarantined even though the shared root helper test is collected).

## 2. Shared story-list resolution (production exclusion preserved)

- [x] 2.1 Write failing Vitest in `src/storybook/`: `resolveStories(srcDir, 'production')` returns
      no path under `src/prototypes/`; `resolveStories(srcDir, 'prototypes')` returns only paths
      under `src/prototypes/` (red)
- [x] 2.2 Implement `src/storybook/resolve-stories.ts`; refactor the production `.storybook/main.ts`
      to consume `resolveStories(srcDir, 'production')`; production behaviour unchanged (green)

## 3. Title derivation + shared tags

- [x] 3.1 Write failing Vitest for `derivePrototypeTitle`: maps
      `src/prototypes/<change>/<name>.stories.tsx` → `Prototypes/<change>/<name>`, with a
      **deeper-nested** path preserving the sub-dir (`<change>/<sub>/x.stories.tsx` →
      `Prototypes/<change>/<sub>/x`) and a file with **multiple named exports** (one derived title,
      exports nested beneath), returning the shared `PROTOTYPE_TAGS` (`['prototype', '!autodocs']`) (red)
- [x] 3.2 Implement `src/storybook/derive-prototype-title.ts` and the shared `PROTOTYPE_TAGS`
      constant (green)

## 4. definePrototypeMeta helper

- [x] 4.1 Write failing Vitest: `{ ...definePrototypeMeta({ component }) }` carries `PROTOTYPE_TAGS`,
      preserves caller `component`/`parameters`, and sets no `title` (red)
- [x] 4.2 Implement `src/prototypes/define-prototype-meta.ts` (tags from `PROTOTYPE_TAGS`); convert
      `_sample/Sample.stories.tsx` to use it and drop its explicit `title` (green)

## 5. AppProviders color-scheme support (enables dark preview)

- [x] 5.1 Write failing test: `AppProviders` renders with `defaultColorScheme="light"` by default
      (unchanged) and honours an optional `colorScheme="auto"` prop (red)
- [x] 5.2 Add the optional `colorScheme` prop to `AppProviders` (default `"light"`); confirm no
      production caller passes it (green)

## 6. Prototype Storybook config + preview + scripts

- [x] 6.1 Write failing test: the prototype config's resolved story list includes `_sample` and
      excludes production stories (red)
- [x] 6.2 Add `.storybook-prototypes/main.ts` (uses `resolveStories(srcDir, 'prototypes')` and
      wires `derivePrototypeTitle` into `experimental_indexers`) and a separate
      `.storybook-prototypes/preview.tsx` that supplies its **own** `AppProviders colorScheme="auto"`
      decorator (not the production light decorator) and reuses only the production `parameters`;
      add the `storybook:prototypes` (dev, port 6007) and `storybook:prototypes:build` scripts (green)

## 7. Integration smokes

- [x] 7.1 Write failing build smoke: building the prototype Storybook indexes `_sample` with title
      `Prototypes/_sample/Sample` and the `prototype` + `!autodocs` tags; a fixture story carrying a
      hand-written `title` is still indexed under its location-derived title (override); building the
      production Storybook indexes none of `src/prototypes/**` (red). Note: `!autodocs` is a tag
      negation Storybook consumes (not stored literally), so the smoke asserts its effect — no
      autodocs/`docs` entry — plus the `prototype` tag.
- [x] 7.2 Make the build smoke pass (green)
- [x] 7.3 Write failing Playwright render smoke (port 6007): the `_sample` story mounts the themed
      root in light, and with `emulateMedia({ colorScheme: 'dark' })` the resolved Mantine color
      scheme is dark (red)
- [x] 7.4 Make the render smoke pass (green)

## 8. Documentation

- [x] 8.1 Update `apps/web/src/prototypes/README.md`: viewing prototypes (`storybook:prototypes`,
      port 6007, light/dark via OS scheme) and authoring with `definePrototypeMeta` (docs-migration)
- [x] 8.2 Update `apps/web/CLAUDE.md`: add the `storybook:prototypes` / `storybook:prototypes:build`
      scripts and the prototype-viewing note (docs-migration)
- [x] 8.3 Update `.claude/skills/switch-ui-prototype/SKILL.md`: Step 3 (`definePrototypeMeta`
      without a `change-name` arg; indexer in `.storybook-prototypes/`) and Step 5 (launch
      `storybook:prototypes` on port 6007) so the consumer skill matches this harness (docs-migration; C1)
