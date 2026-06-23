# Plan: ui-prototypes-mvp

> Stage-1 planning record for the upfront UI prototypes that establish Switchboard's design
> language and confirm the MVP user stories **before** any backend work. This is the hybrid
> strategy's single lightweight upfront prototype change; feature changes 3–5 later refine
> their own slice of these prototypes.

> **Superseded in part by the confirmation gate (2026-06-22) — `design.md` is authoritative.**
> This file is kept as the historical statement of intent. Where it differs from `design.md` /
> `prototypes.md`: the three-equal-screens framing became a single **worktrees hub** (repos →
> worktrees with a per-worktree plug); the standalone **session-list screen and the
> launch→Claude-app handoff toast were dropped** (the plug is the session affordance); the
> git/PR status lamps are **display-only** for the MVP; and the design-language portion
> **promotes production theme + primitives** inside `apps/web` (it is not prototype-only). See
> Decisions 1 and 7 below, annotated.

## Problem

The MVP user story is a single flow done from a phone: **browse GitHub repos → clone one →
create a worktree → launch `claude --remote-control` → hand off to the official Claude mobile
app**. Before committing backend work to that flow, we need to (a) establish the '50s retro
switchboard **design language** as a real, applied visual treatment (today only theme tokens
exist), and (b) sketch the **core screens** so the user stories can be confirmed at a gate.
Getting the screens wrong after the backend is built is expensive; prototypes make the flow
tangible and cheap to change.

## Architecture summary

The **screen sketches** live in the **`Switchboard.WebSPA`** container as **quarantined
Storybook prototypes** under `apps/web/src/prototypes/ui-prototypes-mvp/` — excluded from the
production build, visual-snapshot run, unit run, autodocs, package exports, and app imports
(foundations Decision 7). The **design-language portion**, however, **promotes production
theme tokens + primitives** inside `apps/web` (re-treating `theme.ts` and the
`AppShell`/`EmbossedPanel`/`JackButton` primitives from embossed to flat — see `design.md`).
Nothing here touches `Switchboard.Api`, `packages/shared`, or the LikeC4 model, so there is
**no backend / shared / architecture (LikeC4) impact** — but there *is* production
`apps/web` design-system code.

The prototypes build on the existing retro theme (`src/theme/theme.ts`: bakelite/patina/brass/
signal palettes, emboss + jack tokens, geometric type) and primitives (`AppShell`,
`EmbossedPanel`, `JackButton`, `Placeholder`), maturing them into a full visual treatment.
They are organised as:

- A **design-language gallery** (tokens → primitives → component states) that this change owns
  as the living definition of the visual treatment.
- Three **core flow screens**, each mobile-first with a desktop variant, and each rendering its
  **empty / in-progress (operation-ledger) / error** states as separate stories:
  1. **Repo browser / clone** → confirms `repo-clone-browse`.
  2. **Worktree list / create** (branch new vs. existing) → confirms `worktree-management`.
  3. **Session list / launch** (`claude --remote-control`, then hand off to mobile) → confirms
     `claude-session-launch`.
- A **connected happy-path click-through** linking the three screens, so the end-to-end story
  can be walked at the gate.

```
   ┌───────────────┐  clone  ┌───────────────┐ create ┌────────────────────┐
   │ 1 REPO BROWSER│ ──────▶ │ 2 WORKTREES   │ ─────▶ │ 3 SESSIONS         │
   │ GitHub repos  │         │ list + create │        │ list + launch      │
   │ + cloned list │         │ branch new/   │        │ claude --remote-   │
   │               │         │ existing      │        │ control → hand off │
   └───────────────┘         └───────────────┘        └────────────────────┘
     per screen: empty · in-progress (ledger) · error    ·    mobile + desktop
              + DESIGN-LANGUAGE gallery (tokens → primitives → states)
```

> _Gate note:_ the three equal screens above were re-centred on a **worktrees hub** and screen 3
> (Sessions) was retired into the per-worktree **plug**. The screens that shipped are
> `worktrees`, `new-repository`, and `settings` (see `prototypes.md`). The diagram is retained
> as the original framing.

## Plan page

[docs/plans/switchboard/mvp.md](../../../docs/plans/switchboard/mvp.md) — the programme page
drives this change (listed in its `openspec-changes` frontmatter) and arbitrates the hybrid
prototyping strategy across all MVP changes. No separate plans page is warranted: this
`plan.md` plus the programme page are the complete plan.

## Planned architecture

**None — no architectural impact.** The work is confined to the `Switchboard.WebSPA`
container: quarantined Storybook screen sketches plus the production `apps/web` design-system
re-treatment (theme tokens + primitives). It introduces no new architectural elements or
relationships and touches no backend (`Switchboard.Api`), shared, or LikeC4 surface, so there
is no `docs/dev/Architecture/Planned/ui-prototypes-mvp.c4` overlay and the Architecture review
checkpoint does not apply to this change.

## Decisions

1. **Scope = 3 core flow screens + a design-language gallery.** The repo-browser/clone,
   worktree list/create, and session list/launch screens are the confirmation gate. The
   design-language gallery is a deliberate output because `theme.ts` reserves the "full visual
   treatment" for this change.
   _[Superseded by the gate — see top note]:_ the screens were re-centred on a single
   **worktrees hub** and the session-list screen was folded into the per-worktree plug; the
   design-language gallery shipped as the `design-language` story and is matured into production.
2. **Setup / auth is NOT prototyped.** The GitHub PAT and bearer token are written to
   `~/.switchboard` out-of-band by the CLI (`runtime-cli-docker`); an in-app settings/onboarding
   surface is out of scope for the MVP gate (see Open questions).
3. **Fidelity = connected click-through + key states.** A linked happy-path across the three
   screens, plus each screen's empty / in-progress (operation-ledger) / error states as separate
   quarantined stories. The alternate states are deliberate: the long-running-operation UX
   (clone/worktree/launch through the ledger + lock) is central and informs the feature changes.
4. **Breakpoints = mobile-primary + a desktop variant per screen.** Mobile is the design target
   (per brief); every screen also gets a desktop variant, matching the brief's "desktop + mobile"
   and the future VS-Code-on-desktop direction.
5. **Confirmation gate is explicit.** The rendered prototypes are walked through with the user;
   the agreed user-story decisions become the input to each feature change's specs.
   `repo-clone-browse` hard-depends on this change precisely so backend work cannot start before
   the gate is passed.
6. **Prototype hygiene.** Stories live only under `src/prototypes/ui-prototypes-mvp/`, stay
   quarantined, and every `*.stories.tsx` file gets a row in `prototypes.md` (promotion is the
   default disposition). Porting prototype code into the real slice is implementation work owned
   by the feature changes, not this one.
7. **Mobile-app handoff = toast instruction.** After a session launches, the Sessions screen
   shows a transient toast/notification telling the user to open the official Claude mobile app
   to drive the conversation — no deep link and no copyable session reference in the MVP. Keeps
   the screen simple and matches "conversation management stays in the mobile app."
   _[Superseded by the gate — see top note]:_ this **launch handoff toast was dropped**. There is
   no standalone Sessions screen; the per-worktree plug is the session affordance, and "history
   stays in the Claude app" is conveyed on the Stop-session modal instead.
8. **Documentation.** The design language is documented as the **living Storybook gallery**
   (gallery stories + `theme.ts`), not a separate docs page. The programme page's prototyping
   sections are trimmed (not deleted) at archive while sibling changes remain active. These seed
   the `docs-migration.md` ledger after design.

## Open questions

- **In-app onboarding** — is out-of-band PAT/bearer setup acceptable for the MVP, or does the
  user expect at least a read-only "connection status / which account" surface? Deferred; revisit
  if the gate walkthrough surfaces a need (would be a future feature, not this change).
- **Prototype meta convention** — `config.yaml` / `apps/web/CLAUDE.md` reference a
  `definePrototypeMeta` helper, but the `_sample` prototype uses a plain `Meta` with a
  `Prototypes/…` title. Confirm the intended convention when sketching (a `switch-ui-prototype`
  concern, not a planning blocker).
- **Design-gallery ambition** — how far to push novel switchboard components (plug/patch-cable
  metaphors, lamps, embossed labels) versus composing the existing primitives. Settle during
  sketching against what the screens actually need.
