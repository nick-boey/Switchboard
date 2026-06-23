## Context

This is the hybrid strategy's single **upfront** prototype change: mature the '50s retro
switchboard **design language** into a production visual system and confirm the MVP user
stories at a gate, before the feature changes (`repo-clone-browse`, `worktree-management`,
`claude-session-launch`) commit backend work.

Current state going in:

- **`foundations`** shipped a deliberately small, **embossed/skeuomorphic** token layer —
  `theme/theme.ts` (`SwitchboardTokens`: `embossSurface`, `embossInset`, `jack*`,
  `wordmarkTracking`; raised bakelite shadow stack) — plus two embossed primitives,
  `components/EmbossedPanel.tsx` and `components/JackButton.tsx`, both consumed by the
  mobile-first `components/AppShell.tsx`. It shipped **no UI/design capability spec**, so
  `ui-design-language` is a brand-new capability.
- **`prototype-storybook-harness`** stood up the dedicated prototype workbench on `:6007`
  (`definePrototypeMeta`, location-based indexer, `prefers-color-scheme` via the
  `AppProviders` `colorScheme="auto"` decorator).
- The prototypes under `src/prototypes/ui-prototypes-mvp/` explored the applied system and
  the core screens. They went through a **skeuomorphic pass and then pivoted to a flat
  language**, re-centred on a worktrees hub (`design-language`, `worktrees`,
  `new-repository`, `settings` stories; shared `kit.tsx` / `hub.tsx`).

The **confirmation gate** (run 2026-06-22, recorded in `prototypes.md`) locked four
decisions: the per-worktree plug replaces the session-list screen; the launch→Claude-app
handoff toast is dropped; status lamps are display-only for the MVP; and the worktrees-hub
information architecture supersedes the proposal's three-equal-screens framing.

Constraints: Mantine + TanStack Query + Hono RPC and the retro theme are **cross-cutting
decisions owned by the plan page** (`docs/plans/switchboard/mvp.md`), not re-litigated here;
dark mode is `prefers-color-scheme`-only; the prototype quarantine boundary (app code must
not import `src/prototypes/**`) holds. The `ui-design-language` spec defines **WHAT** the
system provides; this document records **HOW** it is matured into production.

## Goals / Non-Goals

**Goals:**

- Re-treat the production design tokens and primitives from **embossed → flat** while keeping
  the four palettes, the geometric type, and the plug/lamp metaphors, so the system reads
  well mobile-first, at small sizes, and in dark mode.
- Promote the prototype `kit.tsx` components into **production primitives** (theme tokens +
  reusable components) with production Storybook stories and UI tests, covering: flat
  surfaces (raised card + pressed well), the session plug (5 states), status lamps (git/PR),
  the four button intents, segmented toggle, fixed-list + autocomplete selectors, text input,
  icon button, and the typography/label styles.
- Record the **worktrees-hub IA** and the **plug-as-session** model as the decisions the
  downstream feature changes refine their slice of.

**Non-Goals:**

- No `apps/server` or `packages/shared` work; prototypes use static/fake data.
- No production **screen wiring** — `repo-clone-browse` / `worktree-management` /
  `claude-session-launch` own their screens; this change ships the _system_ they compose from.
- No **interactive git/PR lamp helpers** (deferred — logged in the plan page's Future
  features) and no standalone session-list surface (folded into the plug).
- No setup/auth UI (PAT + bearer are written to `~/.switchboard` out-of-band by the CLI).
- **Worktree deletion behaviour** is not decided here — the system provides the destructive
  button + delete icon-button; whether/when a screen wires deletion is `worktree-management`'s
  call (see Risks: the hub sketches a delete affordance that the plan page still lists as a
  future feature — reconcile in `worktree-management`).

## Decisions

### Decision 1 — Flat treatment replaces the embossed treatment

The matured `theme.ts` **replaces** the embossed token set (`embossSurface`, `embossInset`,
`jack*` shadows) with the flat token set the prototype `kit.tsx` proved (`flat()` scheme,
`FLAT_DIVIDER`, `PANEL_RADIUS`, the corner-screw motif), and the embossed primitives
`EmbossedPanel` / `JackButton` are superseded by flat equivalents. The **four palette ramps
carry over unchanged** (the prototype `flat()` already draws from them), and the lamp set
adds two named scheme-aware **indicator status colours** — cobalt (PR `open`) and violet
(PR `merged`) — as theme tokens, since the four hardware ramps can't express those
GitHub-convention hues (see Decision 4).

- _Rationale:_ the gate and the prototype iteration converged on flat — the heavy emboss
  didn't scale down to mobile or hold up in dark mode; flat outlined surfaces with the screw
  motif keep the '50s identity while staying legible.
- _Alternative considered:_ keep/extend the embossed treatment — rejected; it was the thing
  the redesign deliberately moved away from.
- _Informed by:_ `design-language` stories (Surfaces, Palette, Type, Controls).

### Decision 2 — Worktrees-hub IA supersedes the three-screen framing

`proposal.md` described three equal flow screens (repo browser/clone, worktree list/create,
session list/launch). The product is instead a single **worktrees hub**: repos grouped by org,
each worktree a row carrying branch + plug + git/PR lamps + delete, with a **repo drawer**
(mobile overlay / desktop persistent rail) from which **New repository** and **Settings** are
reached. This document records the hub IA as the decision; `proposal.md` remains as the
historical record of intent. This is the IA feature changes 3–5 refine their slice of.

- _Informed by:_ `worktrees` stories (Desktop, Mobile, MobileDrawer, MobileEmpty,
  MobileFiltered).

### Decision 3 — Sessions are the per-worktree plug; no session-list surface

The **plug** (5 states: running / working / error / idle / off) is the canonical session
affordance. Launching is "Create worktree and run" or activating an `off` plug; stopping is
activating a live plug → the **Stop session** modal ("ends the `--remote-control` session and
exits the worktree process; conversation history stays in the Claude app"). There is **no
launch→Claude-app handoff toast** (dropped at the gate). This is the UI contract
`claude-session-launch` consumes. Because the plug replaces the session-list surface, this
change specs the plug's **affordance contract** — it is an actionable control (unlike the
display-only lamps), with `off`→launch / live→stop activation, `working` guarded, and
accessible state/action labelling; the concrete launch/stop **wiring** (session API +
Stop-session modal) is `claude-session-launch`'s.

- _Informed by:_ `worktrees` stories (MobileCreateWorktree, MobileStopSession).

### Decision 4 — Status lamps are display-only in the MVP

The git lamp (up-to-date / behind / ahead / diverged) and PR lamp (none / open / ready /
checks-failing / conflicts / conflicts-failing / merged) render status only; the sketched
indicator-action modal is **deferred**. Interactive git + GitHub helpers are roadmapped
(plan page → Future features).

The lamps draw every colour from theme tokens: green / amber / red reuse Patina / Brass /
Signal, while PR `open` and `merged` use the two named indicator tokens (cobalt / violet)
added to `theme.ts` — the prototype's local `COBALT` / `VIOLET` constants graduate into the
theme as the single, scheme-aware source, with no ad-hoc hex left in components.

- _Informed by:_ `worktrees` story MobileIndicatorAction (kept as a deferred sketch).

### Decision 5 — Promote the prototype kit into production primitives (no prototype imports)

`kit.tsx` is the design source for the matured primitives, but promotion is **moving/rewriting
the code into the application slice**, never importing from `src/prototypes/**` (the
quarantine boundary, ESLint-enforced). Mapping:

| Prototype (kit.tsx)                                | Production primitive (flat)                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| `Panel` (+ pressed variant)                        | flat raised card + pressed well                                            |
| `Plug`                                             | session plug (5 states)                                                    |
| `StatusLight`, `IndicatorLight`, `IndicatorSymbol` | git/PR status lamps (display-only) — `StatusLight` is the shared lamp bulb |
| buttons / `IconButton`                             | button (4 intents) + icon button                                           |
| `SegmentedToggle`                                  | segmented toggle (disabled-option support)                                 |
| selectors / inputs                                 | fixed-list selector, autocomplete selector, text input                     |
| `EmbossedLabel`, `SectionTitle`                    | flat tracked micro-label + section title                                   |
| `AppFrame`, `DeviceFrame`                          | app shell header (DeviceFrame stays a prototype-only framing helper)       |

`EmbossedPanel` / `JackButton` and `theme.stories.tsx` are re-treated or replaced in lockstep.
The **`flat()` scheme helper folds into the Mantine theme + CSS variables** (recommended) so
primitives read scheme-aware tokens from one source and dark mode flows through Mantine's
colour scheme, rather than each primitive calling a runtime function (Open Question).

### Decision 6 — One mobile-first composition adapts to desktop

A single composition adapts by viewport: mobile single-column with a slide-in drawer; desktop
multi-column with a persistent rail (the prototype `Hub` already takes a `desktop` prop and
the drawer↔rail switch is the house convention). No separate mobile-only component set.

- _Informed by:_ `worktrees` Desktop vs Mobile/MobileDrawer.

## Testing strategy

This is a **UI-only** change; the test surface is component-level, not backend/E2E.

- **Unit / UI:** each matured primitive ships a production story (`:6006`). Structural smoke runs
  in the existing **node + SSR Vitest** suite, and the **Storybook test-runner** (Playwright-based,
  task 1.1) executes the stories' `play` functions in a real browser to assert states/variants —
  plug renders all five states, git/PR lamps render each named status, the four button intents are
  distinct (destructive uses Signal), the segmented toggle disables an option.
- **Colour scheme:** reuse the `prefers-color-scheme` **emulation** pattern from
  `prototype-workbench` to assert tokens resolve in dark as well as light.
- **Responsive:** render a composed screen at a narrow and a wide width and assert the
  drawer-vs-rail layout and no horizontal overflow.
- **Visual regression:** the production Storybook visual-snapshot run covers the primitives
  (prototypes remain excluded).
- **Quarantine:** the existing ESLint `no-restricted-imports` rule (from `foundations`)
  already fails app code that imports `src/prototypes/**`; a test asserts primitives are
  imported from production paths.

**Test-harness gap assessment.** Most of the harness exists: production Storybook + visual
snapshots (`foundations`), the prototype workbench and the `prefers-color-scheme` emulation
helper (`prototype-storybook-harness`), and Vitest. The one **gap** is the component-render
test path for the new production primitives: confirm whether `foundations`' Vitest is
configured with a DOM/browser mode adequate for **computed-style and responsive** assertions
(jsdom limits computed colour/layout checks) or whether the Storybook **test-runner** is the
intended path. Resolving this — and wiring the reusable colour-scheme + responsive test
helpers for production stories — is the **leading "Test infrastructure" task group** in
`tasks.md`. No new server/E2E harness is needed (the temp-git Playwright fixture is not
exercised here).

## Risks / Trade-offs

- **[Risk] Re-treating `theme.ts` breaks current consumers.** `AppShell`, `EmbossedPanel`,
  `JackButton`, and `theme.stories.tsx` read the embossed `SwitchboardTokens`; renaming
  `emboss*`/`jack*` → flat tokens breaks them. → _Mitigation:_ migrate tokens + these
  consumers in lockstep within `apps/web`; the blast radius is fully enumerated (no production
  primitive outside this list consumed the tokens), and UI tests + visual snapshots catch
  regressions.
- **[Risk] Promoting many primitives at once drifts from the agreed look.** → _Mitigation:_
  promote primitive-by-primitive red-green (story + UI test each); the prototype stays the
  visual reference until each promotion lands, then its `prototypes.md` row is resolved at
  archive.
- **[Risk] Flat loses the '50s character emboss gave.** → _Mitigation:_ identity is retained
  through palette + corner-screw motif + geometric type + plug/lamp metaphors; the gate
  confirmed the flat treatment.
- **[Trade-off] Speculative primitives.** Spec'ing the system ahead of its screens risks
  over-building. → _Mitigation:_ scope to exactly what the MVP screens compose from (the kit
  is already that minimal set); feature changes 3–5 extend their own slice rather than this
  change pre-building.
- **[Risk] Delete affordance vs roadmap.** The hub sketches a delete control, but the plan
  page lists "delete worktrees/branches" as a future feature. → _Mitigation:_ this change ships
  only the _controls_ (destructive button, delete icon-button); the **screen behaviour** is
  `worktree-management`'s decision — flagged for reconciliation there, not resolved here. Only
  the icon button's **resting + disabled** states ship now; the delete square's `lit`
  (armed / safe-to-delete) visual state ships with the deletion behaviour in `worktree-management`.

## Migration Plan

- **Tokens & primitives (within `apps/web`):** introduce the flat token set in `theme.ts`,
  remove/replace the embossed tokens, and re-treat/replace `EmbossedPanel`, `JackButton`,
  `AppShell`, and `theme.stories.tsx` in the same change so the shell never renders a
  half-migrated mix. The existing embossed component stories
  (`EmbossedPanel.stories.tsx`, `JackButton.stories.tsx`) are replaced/removed in lockstep so
  no production story documents the superseded treatment.
- **Production colour scheme:** the OS-driven scheme is set where the default actually lives —
  the `AppProviders` `defaultColorScheme` (currently `light`), the app entry, and the
  production Storybook preview — flipped to `auto`; `AppShell` only _consumes_ the resolved
  scheme.
- **Prototype dispositions:** resolved at implementation/archive per the prototype workflow —
  not now. Expectation: the `design-language` pieces are **promoted**; the screen sketches stay
  `open` for the feature changes to consume/refine (or `delete` if a feature change supersedes
  them). `prototypes.md` is the ledger reconciled at archive.

## Open Questions (resolved by the Test-infrastructure task group)

- **Production home for primitives.** _Resolved (task 1.3):_ matured primitives live under a new
  `src/ui/<name>` catalogue; the app shell stays under `components/`. (The `switch-ui-prototype`
  catalogue referenced `ui/<name>` + `layout`; production previously had only `components/*` +
  `theme/`.)
- **`flat()` helper.** _Resolved (task 1.3):_ the prototype `flat()` scheme folds into the Mantine
  theme + scheme-aware CSS variables — primitives read tokens from one source and dark mode flows
  through Mantine's colour scheme, rather than each primitive calling a runtime function.
- **Component-render test runner.** _Resolved (task 1.1):_ the **Storybook test-runner**
  (Playwright-based) runs each production primitive's story in a real browser, with computed-style
  / `prefers-color-scheme` / responsive assertions in story `play` functions; the existing node +
  SSR Vitest is retained for structural smoke. (Vitest browser mode was the alternative, declined
  to reuse the per-primitive stories the spec already mandates as the test surface.)
