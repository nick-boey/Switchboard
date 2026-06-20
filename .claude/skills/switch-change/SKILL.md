---
name: switch-change
description: Use when starting any new feature, bug fix, or modification in this repository, or when resuming an in-progress OpenSpec change and you need to know what stage comes next. The single entry point for the guided development workflow.
---

Route a change through the development workflow. This skill is a **router, not a
stage**: it determines where a change is in its lifecycle and delegates to the stage
skill. The OpenSpec artifact DAG is the ONLY state store — never record workflow state
anywhere else, and never guess the stage when `openspec status` can tell you.

**Input**: optionally a change name. With a name (or one inferable from context), go to
**Routing**. Without one, go to **Classification**.

## Classification (new change)

1. **Interview briefly.** Understand what the work is. Then classify by **scale, not
   category** — "bug" vs "feature" is the wrong question. Select `switch-fix` only when
   ALL four hold (ask explicitly if unsure):

   | # | Criterion |
   |---|---|
   | 1 | Correction toward already-intended behaviour (delta spec = regression scenario or small MODIFIED requirement, no new functionality) |
   | 2 | No new UI pattern to explore (touching UI files is fine; needing prototypes is not) |
   | 3 | No architectural impact (nothing to model in LikeC4) |
   | 4 | Roughly single-session scale |

   Fail any → `switch-feature`, or `switch-feature-ui` if the change touches a web UI surface
   that needs pattern exploration. The test for
   "needs pattern exploration": would you sketch it in Storybook before committing to
   a design? A new or visibly changed component/layout → yes (`switch-feature-ui`);
   wiring existing components per existing patterns → no (`switch-feature`).

   Truly trivial changes skip the workflow entirely — say so and stop. The test: no
   spec-level behaviour is involved (typo, comment, config value). If the change
   deserves a regression test, it deserves `switch-fix`.

2. **Create the change** with a kebab-case name:
   ```bash
   openspec new change "<name>" --schema <switch-feature|switch-feature-ui|switch-fix>
   ```

3. **Scan for capability overlap.** List other active changes' delta capabilities
   (`openspec/changes/*/specs/*/`). If another active change touches a capability this
   one will, surface it: the two changes need either a shared `docs/plans` page
   that arbitrates the split, or an explicit ordering via `dependencies.md` (for
   `switch-fix` changes, which have no plan stage, the ordering is the remedy). Do not
   silently proceed.

4. **Enter stage 1**: for feature schemas, invoke the `switch-plan` skill. For `switch-fix`,
   proceed straight to the proposal via the `openspec-continue-change` skill.

## Routing (existing change)

```bash
openspec status --change "<name>" --json
```

Read `schemaName` and the artifact states (`done` = exists, `ready` = unblocked and
next to create, `blocked` = waiting on its `requires:`), then route to the FIRST
matching row:

| Status shows | Route to |
|---|---|
| `plan` ready (not done) | `switch-plan` skill |
| `prototypes` ready and sketching not finished | `switch-ui-prototype` skill |
| any other artifact ready | `openspec-continue-change` skill |
| all artifacts done, tasks incomplete | **Artifacts** review checkpoint, then the **dependency gate**, then `openspec-apply-change` skill |
| all tasks complete | **Implementation** review checkpoint, then `switch-openspec-archive` skill |
| user wants to abandon the change | `switch-openspec-archive` skill (abandoned-exploration path) |
| anything else (malformed state) | show the raw `openspec status` output and fix the artifacts with the user |

Announce the change name, schema, and the stage you are routing to before delegating.
When the `plan` artifact has just reached `done` on a feature change with architectural
impact, run the **Architecture** review checkpoint (below) before routing to the next
artifact.

## Dependency gate

Before implementation starts (and again if resuming implementation), read the change's
`dependencies.md` frontmatter. For each name in `depends-on`, the dependency is
satisfied only if:

- the change is archived — a folder matching `openspec/changes/archive/*-<name>/`; or
- `openspec status --change <name> --json` reports every task complete.

Follow `depends-on` transitively through active changes; report a cycle as an error to
fix in the `dependencies.md` files. If any dependency is unsatisfied: **STOP**, report
the blocking change(s), and offer to switch to the blocking change instead. Never
implement past an unsatisfied dependency, and never "note it and continue".

Note the gate tightens at completion: implementation may start once a dependency's
tasks are all complete, but *archiving* requires the dependency fully archived (its
specs merged first) — see the `switch-openspec-archive` skill.

## Codex review checkpoints

Hand the work to **Codex (`gpt-5.5`)** for an independent review at three transition
points. The router is re-entered between stages, so each checkpoint fires here — before
delegating onward — and is a **read-only second opinion**: Codex reviews, it never edits.

**Run a checkpoint** by dispatching the `codex:codex-rescue` subagent (the `Agent` tool
with `subagent_type: "codex:codex-rescue"`) in the foreground. Give it a prompt that
(a) states up front that this is a **read-only review — do not modify any files**, (b)
names the artifacts or diff to review plus the focus from the table below, and (c)
passes `--model gpt-5.5`. The read-only framing is what stops the subagent running
write-capable, so do not omit it.

**After a checkpoint**, present Codex's findings verbatim, ordered by severity, and
**stop** — never apply fixes or route onward automatically. Ask the user which findings
(if any) to act on. Acting on one means returning to the owning stage (re-open the
artifact, or add a task), not patching straight from the review. Only continue past the
checkpoint once the user has decided.

| Checkpoint | Fires when | Codex reviews | Focus |
|---|---|---|---|
| **Architecture** | the `plan` artifact has just reached `done` **and** the change has architectural impact (a planned LikeC4 model under `docs/dev/Architecture/Planned/`) — feature schemas only | `plan.md` and the planned `.c4` model | Adversarially challenge the proposed architecture — boundaries, dependencies, decisions, trade-offs. Where does this design fail under real-world load or future change? |
| **Artifacts** | all OpenSpec artifacts are `done` and implementation has not started | every artifact under `openspec/changes/<name>/` — proposal, delta specs, design, tasks | Are the artifacts coherent, complete, and faithful to the stated intent? Do the delta specs and `tasks.md` actually cover the proposal? Surface gaps, contradictions, and missing scenarios. |
| **Implementation** | all tasks are complete | the implementation diff for the change | Correctness **and** scope — does the code do what the specs and tasks require, and *only* that? Flag bugs, untested behaviour, and scope creep beyond the change. |

Skip **Architecture** for `switch-fix` changes (no plan stage, no architectural impact);
run **Artifacts** and **Implementation** for every schema. The Artifacts checkpoint is a
one-time pre-implementation gate — when resuming a change whose implementation is already
underway, skip it.

## Escalation

If at any stage an `switch-fix` change surfaces new functionality, UI exploration, or
architectural impact:

1. Edit the change's `.openspec.yaml`: `schema: switch-feature`, or `switch-feature-ui` if
   the surfaced work needs UI pattern exploration (same Storybook test as
   classification).
2. Re-run `openspec status` — the newly required artifacts (`plan`, and `prototypes`
   for UI) now show as pending.
3. Backfill them (route to `switch-plan`), and reconcile any already-completed tasks
   against the backfilled plan and specs — update `tasks.md` if the plan reshapes the
   remaining work — before continuing.

There is no downgrade path — never switch a feature schema to `switch-fix`.

## Red flags — stop and re-route

- "I'll track progress in a separate file/issue" → the artifact DAG is the state store.
- "It's called a bug, so switch-fix" → classify by the four criteria, not the label.
- "The dependency is nearly done, I'll start anyway" → the gate is binary.
- "This fix just needs one small new capability" → that is escalation, not a footnote.
- "I remember where we were" → run `openspec status`; route from evidence.
- "The Codex review can wait until the PR" → the checkpoints are part of the stage
  transition; run them before routing onward.
- "Codex flagged it, I'll just fix it" → reviews are read-only; surface findings and let
  the user decide what to address in the owning stage.
