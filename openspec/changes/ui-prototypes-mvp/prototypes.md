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

| Story file                  | Explores                                                                                                                                                                                                                                                                                                                                                                                                                     | Disposition | Status |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ |
| design-language.stories.tsx | Applied '50s switchboard visual system (flat language): palette, flat outlined cards + corner screws, type ramp, plugs/status-dots/inset-labels/buttons, device framing                                                                                                                                                                                                                                                      | open        | open   |
| worktrees.stories.tsx       | Worktrees hub (centre): flat neutral language; cloned-repos drawer (rail/overlay) with New repository + Settings; on-background search + active/inactive filters; one card per repo with the org/repo heading on the background; worktrees as full-width divided sections (branch + dirty/delete, then plug + git/PR lamps); add-worktree / stop-session / create-worktree / indicator-action modals; on-screen click legend | open        | open   |
| new-repository.stories.tsx  | New repository page (was repo-browser): clone from GitHub list or by URL into `~/.switchboard/repos/<org>/<repo>`; browse / cloning (ledger+lock) / error                                                                                                                                                                                                                                                                    | open        | open   |
| settings.stories.tsx        | Settings stub reached from the drawer: read-only GitHub / storage (clone location) / remote-access status; mobile + desktop                                                                                                                                                                                                                                                                                                  | open        | open   |
