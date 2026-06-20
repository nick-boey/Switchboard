---
name: switch-openspec-archive
description: Close out an OpenSpec change end to end — verify, sync, reconcile the prototype ledger, migrate planning docs, then archive. Use when a change's tasks are complete, or when abandoning an exploration whose artifacts must be retired.
---

Close out an OpenSpec change in five steps, in order:

**verify → sync → reconcile prototypes → docs migration → archive**

Every step is idempotent — if completion is interrupted, re-run from step 1. Do not
proceed past a failing step.

**Input**: the change name. If omitted, infer from context or ask.

## 1. Verify

Run the verify step (the `openspec-verify-change` skill, or `openspec validate <change>`)
and additionally check:

- **Scale retro-check** (`switch-fix` changes only): if the delta specs read like new
  functionality rather than a correction, flag as critical — the change should have
  been escalated to `switch-feature(-ui)`; resolve before archiving.
- **Dependency gate**: every change named in `dependencies.md` `depends-on` must be
  archived (a folder under `openspec/changes/archive/`). Block otherwise. This is
  deliberately stricter than the implementation gate (which accepts all-tasks-complete):
  archive order is sync order, and a dependency's delta specs must reach the main
  specs before this change's do.

Resolve any critical issues before continuing.

## 2. Sync (delta → main)

Apply the change's delta specs to the main specs (the `openspec-sync-specs` skill — an
intelligent delta merge, not a wholesale move):

1. For each capability with a delta at `openspec/changes/<name>/specs/<capability>/spec.md`,
   apply its `## ADDED` / `## MODIFIED` / `## REMOVED` / `## RENAMED` sections to
   `openspec/specs/<capability>/spec.md`, preserving content the delta does not mention. A
   capability whose delta removes every requirement is deleted (`openspec/specs/<capability>/`
   removed).
2. The delta under the change's `specs/` is the authoritative record of the change and stays
   in the change folder (it travels to the archive). There is no projected-spec tree and no
   feature regeneration.

   (If the programme's specs were already applied to main during implementation — the
   self-hosting bootstrap case — sync is a no-op; archive with `openspec archive --skip-specs`
   so the CLI's own delta-merge does not double-apply.)

## 3. Reconcile prototypes (only if the change has prototypes)

```bash
ls openspec/changes/<change-name>/prototypes.md 2>/dev/null
ls src/prototypes/<change-name>/ 2>/dev/null
```

- **No ledger and no folder** → skip.
- Otherwise reconcile disk against the ledger:

1. **Glob the folder** for every `*.stories.tsx` (and prototype-only component files).
2. **Parse the ledger** rows (`Story file | Explores | Disposition | Status`).
3. **Block** — list exactly what must be resolved — if any row is `open`, any file on
   disk is unlisted, any row points at a missing file, or any disposition is neither
   `promote → <path>` nor `delete — <reason>`. Promotion is the default expectation;
   most prototypes graduate into real stories with UI tests, and `delete` is for
   genuinely throwaway sketches.
4. **Execute dispositions mechanically only**, one row at a time:
   - `delete — <reason>`: `git rm <file>`.
   - `promote → <target path>`: `git mv <file> <target>`, then replace the
     `...definePrototypeMeta("<change>", { … })` spread with a plain
     `const meta = { … } satisfies Meta<…>` whose `title` is the PascalCase path
     projection of the target (the story-title check enforces this), and drop the
     unused import.
   - **Refuse** any disposition needing more than the move + title/meta swap — that
     port belongs in the change's `tasks.md`, not in an archive disposition.
5. **Remove the emptied folder**, then re-run the story-title check.

## 4. Docs migration

Graduate the planning artifacts, driven by the change's `docs-migration.md` ledger
(feature-schema changes; `switch-fix` changes have no ledger — their doc updates are
ordinary tasks):

1. **Parse the ledger** (`Source | Destination | Action | Status` rows, or the explicit
   `No documentation impact — <reason>.` statement). **Block** — list exactly what must
   be resolved — if the ledger is missing, any row is `open`, any action is not one of
   `author →` / `merge →` / `retire —` / `discard —`, or a Plans page linked in the
   change's `plan.md` has no row.
2. **Verify authored and merged content**: every `author → <path>` destination must
   exist (it was implementation work — a missing page means unfinished tasks, not an
   archive action); every `merge → <path>` destination must exist and contain the
   migrated content.
3. **Execute `retire` rows**: delete the Plans page, or trim it when its
   `openspec-changes` frontmatter lists other still-active changes (remove this change
   from the list, migrate only its content). A retired page's emptied folder is
   removed. `discard` rows need no action beyond their recorded reason.
4. **Planned architecture**: if `docs/dev/Architecture/Planned/<change-name>.c4`
   exists, move its content into the permanent model files, strip the `#todo` tags
   from elements now built, delete the emptied Planned file, and validate:
   ```bash
   pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture
   ```
5. **Block the archive** while any ledger row is `open`, an `author`/`merge`
   destination is missing, the Planned file still exists, or a linked Plans page still
   lists this change as pending.

## 5. Archive

Archive the change (the `openspec-archive-change` skill, or
`openspec archive <change-name>`), moving it to
`openspec/changes/archive/YYYY-MM-DD-<change-name>/`.

## Special cases

- **Abandoned exploration** (the change is discarded, not completed): with explicit
  user confirmation, delete together — the prototype folder
  (`git rm -r src/prototypes/<change-name>/`), the Planned file
  (`git rm docs/dev/Architecture/Planned/<change-name>.c4`), and the change folder
  (`git rm -r openspec/changes/<change-name>/` — the docs-migration ledger dies with
  it; nothing was authored to retire). Remove the change from any Plans page's
  `openspec-changes` frontmatter (a page left listing no changes is deleted or
  trimmed to a stub, as in step 4). Then re-validate what the deletions touched:
  `pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture` if a
  Planned file was removed, and the story-title check if prototypes were removed.
  Delta specs live inside the change folder, so deleting it reverts the change — unless
  this change was previously part-synced into `openspec/specs/` (an interrupted step 2),
  in which case revert that sync before deleting. Do not archive an abandoned change.

## Guardrails

- The filesystem is authoritative — glob it; never trust a ledger or plan.md alone.
- Mechanical dispositions only; when in doubt, block and report.
- Never archive while: a prototype or docs-migration ledger row is `open`, a prototype
  file is unlisted, an authored/merged docs destination is missing, the Planned file
  exists, or a dependency is unarchived.
- All steps re-runnable; never skip a step because "it ran last time".
