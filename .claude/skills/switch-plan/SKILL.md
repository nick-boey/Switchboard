---
name: switch-plan
description: Use for the planning stage of a change — exploring requirements and architecture with the user before development starts — or when thinking through plans, architectural records, and other non-code documents. Produces the plan artifacts for an OpenSpec change.
---

Enter planning mode: an interview-style, thinking-partner exploration of the problem
and its architecture. Think deeply, visualise freely (ASCII diagrams welcome), follow
the conversation where it goes — but unlike free exploration, this stage has **defined
outputs** that make the planning durable and resumable.

**IMPORTANT: planning mode edits plans, documentation, and architecture models — never
application code.** Investigate the codebase freely; implement nothing.

## The stance

- **Curious, not prescriptive** — ask the questions that emerge; don't follow a script
- **Open threads** — surface directions and let the user follow what resonates
- **Grounded** — read the actual codebase; don't theorise
- **Visual** — diagram the options; a sketch beats paragraphs
- **Patient** — let the shape of the problem emerge before fixing it in artifacts

## Outputs

When the thinking crystallises, capture it. For a change in the workflow
(`/switch-change`), the outputs are:

### 1. `plan.md` (always)

The change's `plan` artifact (`openspec/changes/<change-name>/plan.md`), following the
schema template: Problem, Architecture summary, Plan page link, Planned architecture
(file + element/view ids), Decisions, Open questions. Get instructions and template via:

```bash
openspec instructions plan --change "<change-name>" --json
```

### 2. A `docs/plans` page (larger features and multi-change programmes only)

`docs/plans/<area>/<topic>.md` with frontmatter:

```yaml
---
title: "Plan: <topic>"
openspec-changes:
  - <change-name>
---
```

- The `openspec-changes` list and the change's `plan.md` link MUST point at each other
  (bidirectional, greppable).
- When the page lists several changes, it is the arbiter of consistency between them:
  decisions affecting more than one change are recorded HERE, not in one change's
  artifacts.
- Plans pages are published temporarily; their content migrates to the proper docs at
  archive time. Don't duplicate what permanent docs already say — link to it.

### 3. Planned architecture in LikeC4 (when the change has architectural impact)

Model the target state in **`docs/dev/Architecture/Planned/<change-name>.c4`** — one
file per change, inside the single global LikeC4 project:

- Graft onto existing elements with `extend <fqn>` and **full FQNs** (lexical scope
  does not cross files). New top-level systems are declared directly.
- Tag **every** added element and relationship `#todo` (defined in `specs.c4`).
- Prefix every view id with the change name (view ids are project-global).
- Use the `likec4-dsl` skill for syntax. Validate after each edit (from the repo
  root; the site workspace pins the correct likec4 version — a bare `npx likec4`
  fetches a stale one, and `--json` stats are unreliable in the pinned version):
  ```bash
  pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture
  ```
  Expect `✓ Valid (N files)`; any diagnostic output means the model is broken.
- Record the file plus the element FQNs and view ids in `plan.md`'s Planned
  architecture section — this list is what makes completion (strip `#todo`, merge into
  permanent files) and abandonment (delete the one file) mechanical.
- Plans pages embed planned views with `ArchitectureView` (`viewId` matches the view).

Never model planned work by editing the permanent model files directly, and never
create a separate LikeC4 project for a plan — out-of-project models can't reference
existing elements and drift immediately.

### 4. Documentation destinations (seed for the ledger)

Decide during planning where the documentation ends up, and record it in `plan.md`'s
Decisions: which permanent pages the change must author or update
(`docs/dev/...`/`docs/user/...`), and how any Plans page retires (delete vs trim).
These decisions become the initial rows of the change's `docs-migration.md` artifact
(created after design) — `author →`, `merge →`, `retire —`, `discard —` — so the
destination map is fixed while context is rich, never improvised at archive time.

## Doc-only planning

For work that is purely documentation (no OpenSpec change), the same stance applies and
the output is the documentation edit itself — confirm the plan with the user before
editing. `docs/CLAUDE.md` defines the docs conventions.

## Guardrails

- **Don't implement** — creating OpenSpec artifacts, Plans pages, and Planned `.c4`
  files is capturing thinking; application code is not.
- **Don't auto-capture** — offer to record insights; the user decides.
- **Don't skip validation** — every LikeC4 edit gets a `likec4 validate` run.
- **Do question assumptions** — including the user's and your own.
- **Do check siblings** — if the plan page lists other changes, read their artifacts;
  consistency between concurrent changes is this stage's job.
