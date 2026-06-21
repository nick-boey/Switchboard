# Development workflow

Switchboard is built through a guided, spec-first workflow on top of
[OpenSpec](https://github.com/Fission-AI/OpenSpec). Every feature, fix, or modification
moves through the same lifecycle, and the **OpenSpec artifact DAG is the single source of
truth for where a change is** — never track workflow state in a separate file, issue, or
your memory. When in doubt, ask `openspec status`; route from evidence.

This document describes the workflow already in use. It is referenced by
[`openspec/config.yaml`](../../../openspec/config.yaml), which configures the artifact
templates and per-stage rules. The behaviour here is implemented by the
[`switch-change`](../../../.claude/skills/switch-change/SKILL.md) skill and its stage
skills.

## The one entry point: `/switch-change`

Start (or resume) **every** change through the `switch-change` router skill. It is a
router, not a stage: it works out where the change is in its lifecycle and delegates to the
right stage skill. You never invoke the stage skills cold — let the router classify and
route.

- **New work:** describe what you want to build. The router interviews briefly, classifies
  it (below), creates the change, and enters the first stage.
- **Resuming:** name the change. The router runs `openspec status` and routes to the next
  unblocked stage.

## Classify by scale, not category

"Bug vs feature" is the wrong question — classify by **scale**. There are three schemas:

| Schema | Use when |
| --- | --- |
| `switch-fix` | **All four** hold: a correction toward already-intended behaviour (delta spec is a regression scenario or a small `MODIFIED` requirement), no new UI pattern to explore, no architectural impact, roughly single-session scale. |
| `switch-feature` | Any `switch-fix` criterion fails (new functionality, multi-session scope, architectural impact). The default. |
| `switch-feature-ui` | A `switch-feature` that touches a web UI surface **needing pattern exploration** — i.e. you would sketch it in Storybook before committing to a design. Adds a `prototypes.md` ledger. |

Truly trivial changes (a typo, a comment, a config value with no spec-level behaviour) skip
the workflow entirely. The test: if it deserves a regression test, it deserves `switch-fix`.

A change is created with a kebab-case name:

```sh
openspec new change "<name>" --schema <switch-feature|switch-feature-ui|switch-fix>
```

There is **no downgrade path**. If a `switch-fix` change surfaces new functionality, UI
exploration, or architectural impact mid-flight, that is **escalation**, not a footnote:
edit the change's `.openspec.yaml` to the heavier schema, re-run `openspec status` to reveal
the now-required artifacts, and backfill them before continuing.

## The lifecycle

A change graduates through artifacts (the DAG), then implementation, then archive:

```
plan ──▶ [prototypes] ──▶ proposal ──▶ design ──▶ specs ──▶ tasks ──▶ implement ──▶ archive
  │           │              └──────────────┬───────────────┘
  │           │                       (the artifact DAG)
  │           └─ switch-feature-ui only
  └─ feature schemas only (switch-fix starts at proposal)
```

1. **Plan** (`switch-plan`, feature schemas only). An interview-style exploration of the
   problem and architecture that produces `plan.md` (Problem, Architecture summary, Plan
   page link, Planned architecture, Decisions, Open questions) and — for larger programmes
   — a `docs/plans/<area>/<topic>.md` page. **Planning edits plans, docs, and the
   architecture model — never application code.**
2. **Prototypes** (`switch-ui-prototype`, `switch-feature-ui` only). Sketch UI patterns as
   quarantined Storybook stories *before* recording design decisions (see
   [UI prototyping](#ui-prototyping) below).
3. **Proposal / design / specs / tasks** (`openspec-continue-change`). The proposal states
   Why / What Changes / Capabilities / Impact; `design.md` records decisions and the testing
   strategy; the delta specs under `specs/<capability>/spec.md` carry `ADDED` / `MODIFIED` /
   `REMOVED` requirements (each requirement's first line is a `SHALL`/`MUST`, scenarios are
   testable); `tasks.md` is the implementation checklist, harness-first.
4. **Implement** (`openspec-apply-change`). Work the tasks test-first (TDD is mandatory —
   see [`testing.md`](./testing.md)).
5. **Archive** (`switch-openspec-archive`). Close the change out (below).

The router reads the schema and artifact states from:

```sh
openspec status --change "<name>" --json
```

Each artifact is `done` (exists), `ready` (unblocked, next to create), or `blocked`
(waiting on a `requires:` predecessor). The router routes to the first matching stage. Get a
stage's template and instructions with `openspec instructions <artifact> --change "<name>"`.

## Codex review checkpoints

Independent review is built into the stage transitions. At three points the work is handed
to **Codex (`gpt-5.5`)** for a **read-only second opinion** — Codex reviews, it never edits.

| Checkpoint | Fires when | Reviews | Focus |
| --- | --- | --- | --- |
| **Architecture** | `plan` just reached `done` **and** the change has a planned LikeC4 model (feature schemas only) | `plan.md` + the planned `.c4` model | Adversarially challenge boundaries, dependencies, decisions, trade-offs. |
| **Artifacts** | all artifacts `done`, implementation not started | every artifact under `openspec/changes/<name>/` | Are the artifacts coherent, complete, and faithful to the intent? Do the specs and tasks cover the proposal? |
| **Implementation** | all tasks complete | the implementation diff | Correctness **and** scope — does the code do what the specs require, and *only* that? |

After a checkpoint, the findings are presented verbatim, ordered by severity, and the
workflow **stops**. Findings are never auto-applied: acting on one means returning to the
owning stage (re-open the artifact, or add a task), not patching from the review. `switch-fix`
changes skip Architecture; the Artifacts checkpoint is a one-time pre-implementation gate.

## Dependency gate

Cross-change ordering is recorded **only** in a change's `dependencies.md` frontmatter
(`depends-on:`), never as prose in `tasks.md`. Before implementation starts, each named
dependency must be satisfied:

- it is **archived** (a folder under `openspec/changes/archive/*-<name>/`), or
- `openspec status --change <name>` reports every task complete.

Dependencies are followed transitively; a cycle is an error to fix in the `dependencies.md`
files. If any dependency is unsatisfied, **stop** — do not implement past it. The gate
tightens at the end: *archiving* requires every dependency fully **archived** (so its specs
merge into the main specs first), which is stricter than the all-tasks-complete bar that
unblocks implementation.

## UI prototyping

Switchboard's web UI is the component workbench (Storybook) for the app. A change touching a
user-facing web surface should be `switch-feature-ui`, which adds a `prototypes.md` ledger.

- Sketch patterns with `/switch-ui-prototype` **before** recording design decisions, so you
  react to a rendered pattern instead of imagining it.
- Prototype stories live **only** under `apps/web/src/prototypes/<change-name>/`. They are
  quarantined from the visual-snapshot run, the unit-test run, autodocs, the published
  package API, and production imports (the mechanics are in [`testing.md`](./testing.md)).
- Every prototype on disk gets a row in the change's `prototypes.md`. Porting a prototype
  into production is implementation work and belongs in `tasks.md`.

## Planned architecture

Architecture is modelled in LikeC4 under [`docs/dev/Architecture`](../Architecture). Changes
with architectural impact author `docs/dev/Architecture/Planned/<change-name>.c4` inside the
single global LikeC4 project: extend existing elements with full FQNs, tag every addition
`#todo`, prefix view ids with the change name, and list the added element/view ids in the
change's `plan.md`. Feature changes graft their additions onto the permanent base model as
`#todo` overlays; the base model itself was authored as part of these foundations.

## Cross-change consistency

A `docs/plans` page may drive several concurrent changes via its `openspec-changes`
frontmatter and is the **arbiter of consistency**: any decision affecting more than one
change is recorded there, not in a single change's artifacts. Before writing or modifying
delta specs for such a change, re-read the plan page and the sibling changes' proposals and
delta specs. Capability overlap between active changes requires a shared plan page or an
explicit `depends-on` ordering — never silently proceed.

## Archiving a change

When tasks are complete, close the change out with `switch-openspec-archive`, which runs
five idempotent steps in order:

**verify → sync (delta specs → main specs) → reconcile prototypes → docs migration → archive**

Each change carries a `docs-migration.md` ledger recording where its planning docs graduate
to and what permanent documentation it must author; every row must reach `resolved` before
archive. Do not proceed past a failing step.

## References

- [`openspec/config.yaml`](../../../openspec/config.yaml) — workflow context and per-artifact
  rules.
- [`switch-change` skill](../../../.claude/skills/switch-change/SKILL.md) — the router that
  implements this workflow.
- [`testing.md`](./testing.md) — the test harness conventions TDD depends on.
- [`docs/plans/switchboard/mvp.md`](../../plans/switchboard/mvp.md) — the MVP programme page.
