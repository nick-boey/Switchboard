> **Superseded in part by the confirmation gate (2026-06-22) — `design.md` is authoritative.**
> Kept as the original statement of intent. The "three core flow screens" + "toast handoff"
> below became a single **worktrees hub** with a per-worktree **plug** as the session affordance;
> the standalone session-list screen and the **launch handoff toast were dropped**; the git/PR
> status lamps are **display-only** in the MVP. See `prototypes.md` (gate note) and `design.md`.
> The per-screen **empty / in-progress / error state matrix** and the **connected happy-path
> click-through** below were **prototype-stage deliverables for the gate walkthrough** (now run);
> they are **not production scope** here — production state handling belongs to the screen-owning
> feature changes (`repo-clone-browse`, `worktree-management`, `claude-session-launch`).

## Why

Before committing backend work to the MVP flow (browse → clone → worktree → launch → hand
off), we need the '50s retro switchboard **design language** matured into an applied visual
system, and the **core screens** sketched so the user stories can be confirmed at a gate.
This is the hybrid strategy's single upfront prototype change; feature changes 3–5 then
refine their own slice of these prototypes.

## What Changes

- **Mature the design language** into a durable system: extend `theme.ts` and the
  primitives (`EmbossedPanel`, `JackButton`, plus any new switchboard components the screens
  need) into the full visual treatment, with mobile-first responsive conventions. Explored in
  a **design-language gallery** prototype, then promoted to real Storybook stories with UI
  tests.
- **Sketch three core flow screens** as quarantined prototypes under
  `src/prototypes/ui-prototypes-mvp/`, each mobile-first with a desktop variant and each
  rendering its **empty / in-progress (operation-ledger) / error** states:
  1. Repo browser / clone, 2. Worktree list / create (branch new vs. existing),
  2. Session list / launch (with a **toast handoff** instructing the user to open the Claude
     mobile app).
- **A connected happy-path click-through** linking the three screens for the gate walkthrough.
- **Run the confirmation gate**: walk the rendered prototypes with the user; the agreed
  user-story decisions become the input to each feature change's specs.
- **Out of scope (explicit):** no `apps/server` or `packages/shared` work (prototypes use
  static/fake data); no real screen wiring (feature changes own that); no setup/auth UI (PAT +
  bearer are written to `~/.switchboard` out-of-band by the CLI).

## Capabilities

### New Capabilities

- `ui-design-language`: the '50s retro switchboard design system — theme tokens, primitive
  components and their states, and mobile-first responsive conventions — that this change
  matures into production and that every feature-change screen consumes. (The three screen
  sketches are tracked as prototypes in `prototypes.md`, not as spec capabilities; their
  production screens are specified by the feature changes that own them.)

### Modified Capabilities

- (none — there is no existing UI/design capability spec; `foundations` shipped tokens and
  primitives without a spec.)

## Impact

- `apps/web/src/prototypes/ui-prototypes-mvp/`: quarantined gallery + screen stories
  (gallery, 3 screens × {mobile, desktop} × {empty, in-progress, error}, click-through).
- `apps/web` design system (production): matured `src/theme/theme.ts` and primitives, plus any
  new switchboard components, with promoted Storybook stories + UI tests.
- `openspec/changes/ui-prototypes-mvp/prototypes.md`: one row per prototype story.
- No backend (`apps/server`), shared (`packages/shared`), or architecture (LikeC4) impact.
