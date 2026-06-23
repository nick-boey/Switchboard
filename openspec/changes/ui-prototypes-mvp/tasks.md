# Tasks: ui-prototypes-mvp

Red-green applies to the **feature/primitive groups (2–8)**: each failing-test task precedes its
implement-to-green task. **Group 1 is enabling setup** — test-infrastructure and structural
decisions that precede red-green (no production behaviour to test-first). Every primitive
render/story test in groups 3–7 asserts its states in **both** colour schemes via the group-1.2
helper, satisfying the dark-scheme requirement per primitive. "Port" tasks move prototype
`kit.tsx` patterns into production locations (never imported from `src/prototypes/**`). Prototype
`prototypes.md` dispositions **and the `docs-migration.md` ledger / programme-page trim** are
resolved at archive (the `switch-openspec-archive` workflow), not here.

## 1. Test infrastructure

- [x] 1.1 Resolve the component-render test path (design.md gap): confirm whether
      `foundations`' Vitest has a DOM/browser mode adequate for computed-style and responsive
      assertions, or wire the Storybook test-runner; document the chosen path. → **Storybook
      test-runner** chosen (current Vitest is `environment: node` + SSR markup, no browser);
      recorded in `design.md` Open Questions + Testing strategy.
- [x] 1.2 Provide a reusable `prefers-color-scheme` emulation helper for production stories
      (reuse the `prototype-workbench` pattern) and a viewport/responsive test helper, with a
      smoke test proving both drive a sample production story. → `src/storybook/scheme-test.ts`
      (`schemeTest`/`resolvedScheme`/`VIEWPORTS`) + `.storybook/test-runner.ts` hook + preview
      `auto` wiring; `scheme-test.stories.tsx` play-test PASSES under the test-runner; node unit
      test covers the pure helpers.
- [x] 1.3 Settle the structural Open Questions from design.md so later groups have a home:
      the production primitive directory layout (recommend `src/ui/<name>`) and folding the
      prototype `flat()` scheme into the Mantine theme + CSS variables (single token source). →
      both resolved in `design.md` Open Questions (primitives under `src/ui/<name>`, shell stays
      in `components/`; `flat()` folds into the theme + scheme-aware CSS variables in group 2).

## 2. Flat design tokens (theme.ts re-treatment)

- [x] 2.1 Write the failing token test: the four palettes (bakelite/patina/brass/signal) are
      retained with `patina` primary; the two named **indicator status tokens** (cobalt = PR
      `open`, violet = PR `merged`) exist as theme tokens and resolve in both light and dark; the
      flat surface/divider/corner-screw + panel-radius tokens exist and resolve in both light and
      dark; the embossed tokens (`embossSurface`/`embossInset`/`jack*`) are gone. → `theme.test.ts`
      (token contract + `cssVariablesResolver` light/dark resolution).
- [x] 2.2 Re-treat `theme/theme.ts`: replace the embossed token set with the flat token set,
      keep the palettes/type, add the cobalt/violet indicator status tokens (graduating the
      prototype's local `COBALT`/`VIOLET` constants into the theme), expose scheme-aware tokens
      (per 1.3); update `theme.stories.tsx`. → flat `SwitchboardTokens` + `switchboardCssVariables
Resolver` (`--sb-*`), wired into `AppProviders`; embossed tokens removed; `EmbossedPanel`/
      `JackButton` bridged to flat (superseded fully in groups 3/6); flat-token gallery story.

## 3. Flat surface primitives (raised card + pressed well)

- [x] 3.1 Write the failing story + render test: a raised card (outline + four-corner-screw
      motif + optional inset section title) and a pressed well (recessed, no screws/title) are
      visually distinct, and a well nests inside a card. → `Surface.test.tsx` (node structure) +
      `Surface.stories.tsx` play-tests (distinct computed surfaces + dark resolution, PASS).
- [x] 3.2 Port `kit.tsx` `Panel` → production raised-card + pressed-well primitives with
      production stories; supersede `components/EmbossedPanel.tsx` (replacing/removing
      `EmbossedPanel.stories.tsx` in lockstep) and update its consumers. → `src/ui/surface`
      (`Card`/`Well`, `--sb-*` driven); `EmbossedPanel.tsx` + `.stories.tsx` removed; `AppShell`
      now uses `Card`.

## 4. Session plug

- [x] 4.1 Write the failing render test: the plug renders all five session states
      (`running` / `working` / `error` / `idle` / `off`) as distinguishable, with `error`
      drawing from the Signal ramp.
- [x] 4.2 Port `kit.tsx` `Plug` → a production session-plug primitive with stories (`StatusLight`
      is the lamp bulb, ported with the lamps in 5.2 — it is not part of the plug).
- [x] 4.3 Write the failing test: the plug is actionable — activating an `off` plug fires a
      launch request and activating a live (non-`off`) plug fires a stop request; a `working`
      plug guards/disables activation; the accessible label exposes the current state and the
      available action.
- [x] 4.4 Implement the plug's action affordance + accessibility on the production primitive (an
      activate callback + state/action labelling); the concrete launch/stop wiring (session API,
      Stop-session confirmation) is deferred to `claude-session-launch`.

## 5. Status indicator lamps (display-only)

- [x] 5.1 Write the failing render test: the git lamp renders `up-to-date` / `behind` /
      `ahead` / `diverged` and the PR lamp renders `none` / `open` / `ready` / `checks-failing`
      / `conflicts` / `conflicts-failing` / `merged`, each labelled to its column; activating a
      lamp triggers no action (inert in the MVP).
- [x] 5.2 Port `kit.tsx` `StatusLight` (the shared lamp bulb) + `IndicatorLight` +
      `IndicatorSymbol` → production lamp primitives with stories, drawing PR `open`/`merged` from
      the cobalt/violet theme tokens (no ad-hoc hex); display-only, no action handler.

## 6. Action & form controls

- [x] 6.1 Write the failing render test: four button intents (`primary` / `secondary` /
      `destructive` / `subtle`) are distinct (destructive uses Signal); a segmented toggle can
      mark an option disabled (e.g. "Local") so it is unselectable; the fixed-list selector,
      autocomplete selector, text input, and icon button each render resting + disabled states;
      the autocomplete selector and text input additionally render an **invalid (error)** state
      (validity affordance + error message) for a value they reject.
- [x] 6.2 Port `kit.tsx` buttons / `IconButton` / `SegmentedToggle` / selectors / input →
      production control primitives with stories, including the autocomplete/text-input invalid
      (error) state; the (delete) icon button ports resting + disabled only — its `lit`
      (armed / safe-to-delete) state is deferred with deletion behaviour to `worktree-management`.
      Supersede `components/JackButton.tsx` (replacing/removing `JackButton.stories.tsx` in
      lockstep) and update its consumers.

## 7. Typography & labels

- [x] 7.1 Write the failing test: machine identifiers (branch names, commit hashes, commands,
      paths) render in the monospace family; section/field labels use the uppercase, tracked
      micro-label style; headings/body follow the geometric ramp.
- [x] 7.2 Port `kit.tsx` `EmbossedLabel` (→ flat tracked label) + `SectionTitle` and wire the
      type ramp into the theme/components with stories.

## 8. Production colour scheme, app shell re-treatment, responsive conventions & quarantine

- [x] 8.1 Write the failing test: the production colour scheme follows the OS
      `prefers-color-scheme` with no in-app toggle — under emulated `dark` the app entry and a
      production story resolve to the dark scheme.
- [x] 8.2 Set the production scheme to `auto`: change the `AppProviders` default from `light`
      to `auto` (and/or the app entry `main.tsx` and the production Storybook
      `.storybook/preview.tsx`), so light/dark is driven only by `prefers-color-scheme`.
- [x] 8.3 Write the failing test: `AppShell` renders the flat header (wordmark, live-session
      count, burger → drawer) using the matured primitives and **consumes** the resolved scheme
      (it does not set it).
- [x] 8.4 Re-treat `components/AppShell.tsx` to the flat header, removing all embossed-token and
      `EmbossedPanel`/`JackButton` usage.
- [x] 8.5 Write the failing responsive test: a screen composed from the primitives renders the
      single-column + slide-in-drawer layout at a mobile width and the multi-column + persistent
      rail layout at a desktop width, with no horizontal overflow at either width.
- [x] 8.6 Encode the breakpoint + drawer↔rail switch as the house responsive convention so the
      composition adapts without a separate mobile-only component set.
- [x] 8.7 Add a guard test confirming the prototype quarantine holds: app code under `src/`
      (outside `src/prototypes/**`) importing a prototype fails ESLint `no-restricted-imports`,
      and the matured primitives are imported from their production paths.

## 9. Verify

- [ ] 9.1 Run `just lint`, `just typecheck`, `just test`, and the production Storybook
      visual-snapshot run; confirm the matured primitives appear as production (non-prototype)
      stories and all new tests pass.
