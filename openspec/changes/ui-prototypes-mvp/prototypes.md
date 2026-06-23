# Prototypes — ui-prototypes-mvp

Quarantined Storybook sketches under `apps/web/src/prototypes/ui-prototypes-mvp/`. One row per
`*.stories.tsx` file. Disposition (`promote` / `delete` / `open`) is decided during implementation
or at archive — new sketches start `open`. Non-story helpers (`kit.tsx`, `hub.tsx`) carry no row.

**Redesign note (worktrees-centred hub).** The original three equal flow screens were re-centred on
the worktrees page: `worktrees.stories.tsx` became the hub (repo drawer + org→repo cards with
per-worktree plug + status lamps); `repo-browser.stories.tsx` was repurposed and renamed to
`new-repository.stories.tsx` (reached from the drawer); the standalone `sessions.stories.tsx` was
**retired** — its job (Claude Code on/off) is now the per-worktree plug on the hub. `settings.stories.tsx`
was added as the drawer's Settings stub.

**Confirmation gate (run 2026-06-22 — decisions locked).** The rendered prototypes were walked with
the user; the agreed user-story decisions (carried in full into `design.md` and the downstream
feature specs) are:

1. **Sessions = the per-worktree plug** — the plug fully replaces the proposal's standalone
   session-list / launch screen for the MVP.
2. **No launch handoff** — the proposal's "toast instructing the user to open the Claude mobile
   app" after launching a session is **dropped** (no longer a user story).
3. **Indicator lamps are display-only** — the git/PR lamps render status only; their (sketched)
   "indicator action" modal is **deferred**. Interactive git + GitHub helpers are logged as a
   future task in `docs/plans/switchboard/mvp.md` → Future features.
4. **Hub-centred IA supersedes the three-screen framing** — `design.md` records the worktrees-hub
   information architecture as the decision that supersedes `proposal.md`'s three-equal-screens
   description (the proposal is left as the historical record of intent). The proposal's per-screen
   **empty / in-progress / error state matrix** and the **connected happy-path click-through** were
   prototype-stage deliverables that served this walkthrough; they are **not** carried into the
   production scope of this change — each screen-owning feature change specifies its own screen
   states. This change ships the design-language **system** those screens compose from.

**Deferred (not a gate decision, flagged for a sibling change):** the hub sketches a per-worktree
**delete** square. This change ships only the _control_ (the destructive icon-button); the
**deletion behaviour and the safe-to-delete criteria** (idle + PR merged) are an open question
for **`worktree-management`**, where "delete worktrees/branches" already sits on the plan page's
Future-features list.

| Story file                  | Explores                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Disposition | Status |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ |
| design-language.stories.tsx | Applied '50s switchboard visual system (flat language): palette, flat outlined cards + corner screws, type ramp, and a controls catalogue — plugs, indicator lights (lamp + symbol), icon buttons, toggle buttons, dropdown selectors, inputs, buttons; device framing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | open        | open   |
| worktrees.stories.tsx       | Worktrees hub (centre): flat neutral language; cloned-repos drawer (rail/overlay) with New repository + Settings; on-background search + active/inactive filters; one card per repo with the org/repo heading on the background; worktrees as full-width divided sections (branch on its own line, then plug + git/PR lamps with the delete square right-aligned in the same control row — the delete square is a **visual affordance only**; its safe-to-delete styling sketch (bright red when the worktree is idle and its PR is merged) and any deletion behaviour are **deferred to `worktree-management`**); hover lights the add-worktree row; add-worktree / stop-session / create-worktree / indicator-action modals; on-screen click legend | open        | open   |
| new-repository.stories.tsx  | New repository page (was repo-browser): guided clone/create flow — GitHub vs Local source (Local deferred/disabled), then Select repository (validated editable org + repo dropdowns) or From URL (validated); clicking Clone lands on the repository page in a saga-driven "getting ready" state; mobile + desktop                                                                                                                                                                                                                                                                                                                                                                                                                                   | open        | open   |
| settings.stories.tsx        | Settings reached from the drawer: back-button header (no breadcrumb), read-only GitHub / storage (clone location) / remote-access status in pressed panels (no top rule); mobile + desktop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | open        | open   |
