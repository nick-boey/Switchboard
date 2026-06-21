# Prototypes — ui-prototypes-mvp

Quarantined Storybook sketches under `apps/web/src/prototypes/ui-prototypes-mvp/`. One row per
`*.stories.tsx` file. Disposition (`promote` / `delete` / `open`) is decided during implementation
or at archive — new sketches start `open`. Non-story helpers (`kit.tsx`) carry no row.

| Story file                  | Explores                                                                                                                                                                | Disposition | Status |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ |
| design-language.stories.tsx | Applied '50s switchboard visual system (flat language): palette, flat outlined cards + corner screws, type ramp, plugs/status-dots/inset-labels/buttons, device framing | open        | open   |
| repo-browser.stories.tsx    | Screen 1 (repo-clone-browse): browse GitHub + clone, mobile & desktop, across empty / cloning (ledger+lock) / error states                                              | open        | open   |
| worktrees.stories.tsx       | Screen 2 (worktree-management): list worktrees + create (new/existing branch), mobile & desktop, empty / creating (ledger+lock) / error                                 | open        | open   |
| sessions.stories.tsx        | Screen 3 (claude-session-launch): list sessions + launch `claude --remote-control`, mobile & desktop, empty / launching / handoff toast / error                         | open        | open   |
