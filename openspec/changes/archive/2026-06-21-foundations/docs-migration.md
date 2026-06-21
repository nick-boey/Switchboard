# Documentation migration: foundations

Ledger of where this change's planning documentation graduates to and what permanent
documentation the change must author. Every row MUST reach `resolved` before archive;
every Plans page linked in plan.md MUST have a row.

| Source | Destination | Action | Status |
| --- | --- | --- | --- |
| plan.md (Architecture summary) + the LikeC4 base model | `docs/dev/Architecture/` (`*.c4`) | author → `docs/dev/Architecture/` | resolved |
| — | `README.md` | author → `README.md` | resolved |
| — | `docs/dev/Contributing/development-workflow.md` | author → `docs/dev/Contributing/development-workflow.md` | resolved |
| — | `docs/dev/Contributing/testing.md` | author → `docs/dev/Contributing/testing.md` | resolved |
| `docs/plans/switchboard/mvp.md` | — | retire — trim foundations' content at archive (other changes still list it) | resolved |

Notes:

- `development-workflow.md` is referenced by `openspec/config.yaml` but does not yet
  exist; `foundations` authors it to document the workflow already in use.
- `README.md` covers install/build/run locally; `testing.md` documents the
  Vitest/Playwright/Storybook harness conventions (temp-git fixture, prototype quarantine).
- The runtime spike findings (`docs/dev/spikes/runtime-spike.md`) are **not** a foundations
  migration row: the spike is a separate prerequisite, its durable conclusions are captured
  in `design.md`, and its open Claude-credential follow-up is carried by `runtime-cli-docker`
  (which retires the spike doc when it consumes it).
