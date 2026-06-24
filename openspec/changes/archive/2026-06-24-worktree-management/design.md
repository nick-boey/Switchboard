## Context

`worktree-management` is the **second feature change** in the MVP chain
(`repo-clone-browse → worktree-management → claude-session-launch`). A cloned repo is a bare
repository with no working tree; a Claude session needs a real checkout to run in. This change
turns a bare clone into one-or-more **worktrees**, each on its own branch, at
`repos/<repo-id>/worktrees/<wt-id>`.

Current state going in:

- **`repo-clone-browse`** (implemented) shipped the foundation this builds on:
  - the bare-clone layout `~/.switchboard/repos/<owner>/<repo>/.bare` and the Git service
    (`apps/server/src/repos/git-service.ts`) that creates it, lists cloned repos, and exposes
    `bareDir(target)`;
  - the **canonical `<repo-id> = <owner>/<repo>`** scheme and its path-safety validation in
    `packages/shared/src/repos.ts` (`parseRepoTarget`, `toRepoId`, `isValidRepoId`; conservative
    charset `[A-Za-z0-9._-]`, traversal rejection) — the precedent this change extends to branch
    and worktree identifiers;
  - the **operation ledger + per-key lock** subsystem (`apps/server/src/operations/`):
    idempotency, per-key serialization, abort/cancellation resolved as a single terminal
    transition, and restart recovery. Its `OperationType` is currently `'clone'` only, and the
    clone is its first consumer — it was built explicitly to be reused here;
  - the **credential helper** + **git-runner** subprocess seam (PAT never in URL / argv /
    `.bare/config` / logs), the **OTel redaction** processor (blocklist already names branch
    name + absolute path + command args), and the typed Hono RPC contract + client pattern
    (`apps/server/src/{app,contract,client}.ts`) with a build-breaking contract test.
- **`ui-prototypes-mvp`** sketched this change's surface in
  `apps/web/src/prototypes/ui-prototypes-mvp/worktrees.stories.tsx` (the worktrees hub: repo
  cards whose worktrees are full-width sections carrying a plug, git/PR lamps, and a delete
  square; an "Add worktree…" row; the create-worktree modal). Its confirmation gate (2026-06-22)
  is locked. Two gate facts bind this change directly:
  - **the per-worktree plug = the Claude-session affordance** — the plug's on/off *action* is
    `claude-session-launch`'s, not this change's;
  - **the delete control shipped as a visual affordance only**; the prototype explicitly
    **defers the deletion behaviour and the safe-to-delete criteria (idle + PR merged) to
    `worktree-management`**, so this change owns and specifies them.

Constraints (cross-cutting, **owned by the programme page** `docs/plans/switchboard/mvp.md`,
not re-litigated here): on-disk layout `repos/<repo-id>/worktrees/<wt-id>` with **no default
`main` worktree** (every worktree is explicit); **path-safe `<wt-id>`** with the human-readable
branch name stored/displayed separately; **tmux session names later reuse the same scheme**;
the **operation ledger + lock** for worktree creation; "branch exists on remote" vs "new branch"
handled explicitly; services take a `RuntimeContext`; branch names are **sensitive** in
telemetry (redaction blocklist). The quarantine boundary holds — production code **ports** the
prototype, it does not import `src/prototypes/**`.

This change extends the Git service inside `Switchboard.Api` with worktree create/list/delete,
adds a second `OperationType` to the shared ledger, and **designs the canonical path-safe ID
scheme** that `claude-session-launch` reuses for tmux session names.

## Goals / Non-Goals

**Goals:**

- **Canonical path-safe ID scheme** (the headline deliverable, reused downstream): a pure,
  deterministic function `branch → <wt-id>` that survives adversarial branch names (`/`,
  traversal segments, spaces, Unicode, reserved names, case-folding collisions, excessive
  length) and is **collision-resistant across distinct branches** (a bounded, vanishingly small
  truncated-hash collision probability — not an absolute guarantee), with the human-readable
  branch name stored/recovered separately. Exposed from `packages/shared` so
  `claude-session-launch` derives tmux session names from the **same** function (single source of
  truth). A **mandatory create-time collision check** (Decision 1) is the backstop that makes the
  bounded probability safe in practice.
- **Create a worktree** from a cloned repo at `repos/<repo-id>/worktrees/<wt-id>`, handling
  **"branch exists on remote"** vs **"new branch"** explicitly, run through the **operation
  ledger + lock** (idempotency, per-worktree serialization, cancellation, restart recovery).
- **List a repo's worktrees** from disk/git, enriched with per-worktree **git status**
  (dirty/clean, ahead/behind/diverged) — the git lamp's data.
- **Delete a worktree** with a **safe-to-delete** gate, resolving the `ui-prototypes-mvp`
  deferral: define what "safe to delete" means (idle + PR merged + no uncommitted work), define
  what deletion does, and enforce the gate server-side.
- **Worktree API** (create / list / delete / status) wired into the Hono app, typed client, and
  contract test.
- **Refine the worktrees-hub worktree slice** of the prototype into production UI: the
  worktree-list / git-lamp / create-worktree-modal / add-worktree-row / delete-control screen
  states this change owns.
- Author the planned-architecture overlay `docs/dev/Architecture/Planned/worktree-management.c4`
  (deferred from `plan.md`; the Architecture review checkpoint fires when it lands).

**Non-Goals:**

- **Claude session launch / the plug's on/off action** — `claude-session-launch`. This change
  renders the plug (display) and defines the **`<wt-id>` scheme that change reuses for tmux
  names**, but does not start/stop sessions or track tmux.
- **PR-status data source** — there is no GitHub-PR service in the MVP. The PR lamp stays
  **display-only with no live data wired here**; the safe-to-delete predicate references a
  `pr-merged` input that is **supplied to the worktree model**, not fetched by this change
  (Decision 6 + Open Questions). The direct consequence — made explicit in Decision 6 — is that
  the auto-safe (non-force) delete path is **specified but dormant in the MVP**: with no PR-merged
  source, no worktree is ever auto-classified safe, so every MVP deletion runs through explicit
  confirmation (`force`). This is a deliberate MVP availability gap, not a contradiction: the
  criteria are fully specified and the delete path stays fully usable via confirmation.
- **Interactive git/PR lamp helpers** (status/fetch/pull/push, PR checks/merge) — Future
  features; the lamps remain display-only.
- **Branch lifecycle management** — deleting the underlying git **branch** (local or remote),
  renaming, or bulk worktree/branch operations. This change removes the **worktree** (the
  checkout), the counterpart of create; the broader "delete worktrees/branches" item stays a
  Future feature (Decision 6).
- **Re-using / repairing an existing worktree dir**, fetch/pull of a worktree, conflict
  resolution — out of scope; create is for a fresh worktree.
- **The repo drawer / New repository / Settings chrome** — `repo-clone-browse` and
  `ui-prototypes-mvp` own those; this change consumes the cloned-repos list and contributes the
  per-repo worktree sections.

## Decisions

### Decision 1 — Canonical path-safe worktree ID: `slug--hash`, owned here, reused for tmux

`<wt-id>` is derived from the exact branch name by a **pure, deterministic** function exposed
from `packages/shared` (alongside the existing repo-id helpers). The id has two parts joined by
a `--` separator:

```
<wt-id> = <slug>--<hash>
```

- **`slug`** — a lossy, human-recognisable, path-safe prefix: lowercase the branch, transliterate
  to the conservative charset `[a-z0-9._-]` (reusing the same charset family as `<repo-id>`),
  map `/` and every out-of-charset run (spaces, Unicode, control chars) to `-`, collapse repeated
  separators, strip leading/trailing `.`/`-`, and **truncate to a fixed cap (48 chars)**. Purely
  for recognisability in the directory listing and tmux name.
- **`hash`** — the first **12 hex chars of `SHA-256(branch)`** over the **raw, exact, UTF-8
  branch bytes**. This is what makes the id **collision-resistant and reversible-in-intent**:
  distinct branches yield distinct hashes (with a bounded, vanishingly small truncated-hash
  collision probability) regardless of how lossy the slug is, including case-folding pairs
  (`Feature/X` vs `feature/x`) whose **distinct raw bytes** produce distinct hashes — so they get
  distinct `<wt-id>` directories and never alias on the **case-insensitive macOS filesystem** the
  user runs on.

Edge cases: when the slug is empty (all-Unicode branch) or a reserved/dotted name (`.`, `..`,
`.git`), the slug falls back to a fixed token (`wt`); the hash still disambiguates. The full id
is therefore always non-empty, within filesystem and tmux name-length limits, and `isValidRepoId`'s
sibling validator `isValidWorktreeId` re-checks it for path safety before any path is constructed
(defence in depth, mirroring `repo-clone-browse`'s re-validation).

**Mandatory create-time collision detection (a SHALL, not a fallback).** Because the 48-bit
truncated hash is collision-_resistant_, not collision-_free_, the pure function alone cannot
guarantee uniqueness. The **create operation** therefore MUST, before any path or tmux name is
built or reused, compare the candidate `<wt-id>` against the existing worktrees on disk: if a
worktree with the **same `<wt-id>`** is already checked out on a **different** branch (the
branch recovered from git per Decision 2, compared **exactly**/case-sensitively), the create MUST
**reject** the request with a typed collision error — it MUST NOT alias two distinct branches onto
one worktree path or tmux name, and it MUST NOT extend or otherwise mutate the identifier
(a deterministic-suffix extension is **rejected as an option**: the extended id would no longer
equal `idForBranch(branch)`, breaking the pure-derivation model and the Decision 2/5 List rule —
listing ignores any worktree whose `<wt-id>` ≠ the derivation of its branch — so an extended id
would be invisible to list and to the delete safety flows). The **same typed collision error** is
surfaced both here in the Git service and at the operation/orchestrator boundary (Decision 3).
A repeat create for the **same** branch is the idempotent path (Decision 3), not a collision. This
makes the bounded hash length safe to keep short and legible (Open Questions) while closing the
aliasing hazard.

- _Rationale:_ the programme page mandates "encoded **or** hashed" — `slug--hash` gives **both**:
  the slug keeps the on-disk/tmux name legible, the hash makes collisions vanishingly unlikely and
  keeps case/Unicode-distinctness without a separate uniqueness registry, and the create-time
  check is the hard backstop. A pure function keeps the id derivable anywhere (server, future tmux
  naming) with no shared mutable state.
- _Alternative considered — slug-only with a collision counter (`feature-foo`, `feature-foo-2`):_
  rejected — requires a persistent uniqueness registry, races under concurrent creation, and
  still aliases case-folded names on a case-insensitive FS.
- _Alternative considered — hash-only:_ rejected — equally collision-resistant but unreadable in a
  directory listing and a tmux `ls`, defeating the recognisability the slug provides for free.

### Decision 2 — The branch name is recovered from git, not a sidecar store

Because the slug is lossy, `<wt-id>` cannot reconstruct the branch. The exact branch name is
already the source of truth **in git**: each worktree has a checked-out branch ref. Listing
therefore reads `git --git-dir <bare> worktree list --porcelain`, which reports each worktree's
**path** (→ `<wt-id>`) and **branch** (the exact name), giving the id ↔ owner/repo/branch mapping
**with no separate JSON store** — consistent with the programme's "filesystem + git are the
source of truth, no database." A worktree whose path is not under `worktrees/<wt-id>` or whose
`<wt-id>` does not match `idForBranch(branch)` is treated as foreign and ignored (defence in
depth against a hand-placed directory).

- _Rationale:_ avoids a drift-prone mapping file; git already stores the authoritative branch.
- _Alternative considered — a `worktrees.json` mapping per repo:_ rejected — a second source of
  truth to keep consistent with git on every create/delete/external mutation.

### Decision 3 — Worktree creation as a tracked operation: `OperationType: 'worktree'`

Worktree creation is long-running (a checkout, plus a fetch when the branch is remote), so it
runs through the **existing ledger** with a new `OperationType: 'worktree'` and a `worktree`
handler in the orchestrator's handler map. The operation **key** is the **worktree-scoped**
`<repo-id>/<wt-id>` so that:

- **idempotency** is per worktree — a duplicate create for the same `<repo-id>/<wt-id>` **and the
  same exact (case-sensitive) branch** returns the in-flight/succeeded operation, but two
  *different* worktrees in one repo are independent operations (not deduped, unlike a repo-scoped
  key). Because the key alone cannot tell a true repeat from a truncated-hash collision (two
  **different** branches deriving the **same** `<wt-id>`), the operation **records the exact
  requested branch in its metadata** and idempotent reuse MUST check **branch equality first**:
  same key + same branch = reuse; **same key + different branch = the typed collision error of
  Decision 1**, surfaced at the **operation/orchestrator boundary** (not only in the Git service),
  so the ledger never aliases a new request onto the wrong worktree's operation;
- the `worktree` handler's `isComplete` = the worktree dir exists and `git worktree list` reports
  it; `cleanup` = `git worktree remove --force` (or directory removal) + `git worktree prune` for
  an incomplete target — re-checked under the lock exactly like the clone, so a completed worktree
  is never removed by an abort that lost the race.

`git worktree add` and `remove` **mutate the shared bare repo** (its `worktrees/` admin dir and
locks). Concurrent mutations to one bare repo can corrupt that admin state, so the git-mutating
critical section is additionally serialized by the **per-`<repo-id>` `KeyedLock`** (the same
`createKeyedLock` primitive, a second lock instance keyed by repo-id). Net: per-worktree operation
identity, per-repo git-write serialization.

- _Rationale:_ reuses the programme-mandated ledger (built in `repo-clone-browse` for exactly
  this) rather than a bespoke async path; the two-lock split gives the finest correct granularity.
- _Alternative considered — key the operation by `<repo-id>` (like clone):_ rejected — it would
  serialize *and* dedupe distinct worktree creates in the same repo, breaking idempotency
  semantics (two branches → one operation).

### Decision 4 — "Branch exists on remote" vs "new branch", resolved authoritatively via the remote

The create request carries the desired branch and an explicit **mode**, but existence is
**confirmed against the remote**, not trusted from the client or the (possibly stale) bare clone:

- **Existing remote branch** — `git --git-dir <bare> fetch origin <branch>` then
  `git --git-dir <bare> worktree add <path> --track -b <branch> origin/<branch>` (or check out the
  existing ref), so the worktree tracks the remote branch.
- **New branch** — `git --git-dir <bare> worktree add -b <branch> <path> <base>` where `<base>`
  defaults to the repo's **default branch** (origin's `HEAD`) and may be overridden. Creating a
  branch that already exists on the remote, or a worktree whose `<wt-id>` already exists, is
  rejected with a typed error rather than silently aliasing.

Existence is determined by consulting the remote's heads (`git ls-remote --heads` through the
credential helper, or the fetched refs) because the bare clone's refs can lag the remote and the
user may target a brand-new upstream branch. The credential helper (built in `repo-clone-browse`)
is reused unchanged for the fetch/ls-remote.

- _Rationale:_ the programme page requires explicit handling; an authoritative remote check
  avoids "branch exists locally but not on the remote" ambiguity from a stale bare clone.
- _Alternative considered — infer existence from the bare clone's local refs only:_ rejected —
  stale after the initial clone; a newly-pushed upstream branch would be misclassified as "new".

### Decision 5 — List worktrees with git-derived status (the git lamp's data)

Listing returns, per worktree: `<wt-id>`, the exact `branch`, the relative `path`, and a
**git status** summary — `dirty` (uncommitted changes present) and `sync` ∈
`{ up-to-date, ahead, behind, diverged }` computed from the worktree's `HEAD` vs its upstream
(`git -C <wt> status --porcelain` + rev-list ahead/behind counts). This is the **git lamp's**
data and a direct input to the safe-to-delete predicate (uncommitted work blocks deletion). The
**PR lamp** has **no data source in this change** (Non-Goals); the list carries an optional
`prMerged` flag defaulting to unset, populated only when a PR-status source exists.

- _Rationale:_ the worktrees-hub UI this change owns needs the git lamp; the status is cheap to
  derive from the worktree itself and is exactly the "uncommitted work" signal deletion needs.

### Decision 6 — Worktree deletion + the safe-to-delete predicate (owned here; resolves the prototype deferral)

`ui-prototypes-mvp` shipped the delete control as a visual affordance and **deferred the
behaviour + criteria here**. This change defines and enforces both.

**Safe-to-delete predicate** (the owned criteria — the prototype's "idle + PR merged", made
precise and conservative):

```
safeToDelete(wt) = noActiveSession(wt) AND prMerged(wt) AND NOT wt.dirty
```

- `noActiveSession` — **idle**: no live Claude session is bound to the worktree. Sessions are
  `claude-session-launch`'s domain, and that change **depends on this one**, so this change
  cannot import session state. It consumes session-liveness through a **seam**
  (`SessionProbe`-style injected predicate) that **defaults to "no active session"** here (no
  sessions exist yet); `claude-session-launch` wires the real probe into the seam. This seam **is
  satisfiable in the MVP** — it degrades cleanly to "unknown / no session" until
  `claude-session-launch` ships and populates it — so the term contributes a real value rather
  than a permanently-unavailable input. This keeps the predicate complete and the dependency
  direction correct.
- `prMerged` — supplied as an input on the worktree model (Decision 5); it has **no data source
  in the MVP** (the PR lamp is display-only — Non-Goals), so it is **unset/false** and a worktree
  is conservatively *never auto-safe on the PR term* until a future PR-status source is wired.
  **Consequence:** the auto-safe (non-force) delete path and the UI's "bright red when safe"
  styling are **specified but dormant/unreachable in the MVP**. They are not dead specification —
  they become live the moment a PR-status source populates `prMerged` — but in the MVP no worktree
  reaches the auto-safe state, so **every MVP deletion is confirmation-gated** (the `force` path
  below is the MVP delete path).
- `NOT dirty` — uncommitted work in the worktree blocks safe deletion (this change's git status,
  which **is** fully available in the MVP).

**Classifying a worktree with no PR.** A worktree with no associated PR (or one whose PR is not
merged) has `prMerged` false and is therefore **not auto-safe** → its deletion **requires explicit
confirmation** (`force`). There is no separate "no PR" state to model: absence of a merged PR is
exactly the unmerged-PR case, which the predicate already covers conservatively.

**Deletion behaviour:** delete removes the **worktree** only — `git worktree remove` (and prune)
plus removal of `repos/<repo-id>/worktrees/<wt-id>/`. It **never** touches the bare clone, other
worktrees, or the git **branch** (local or remote — branch lifecycle is the Future-features
"delete worktrees/branches" item). The destructive action is **guarded server-side**: the server
**re-checks `safeToDelete`** before removing and **refuses** (typed `not-safe` error) when the
worktree is not safe, unless an explicit `force` flag is set (the UI requires confirmation;
`force` covers the deliberate "I know it's not merged" path). Deletion runs under the
**per-`<repo-id>` git-mutation lock** (Decision 3) so it cannot race a concurrent create/remove.

Because the auto-safe path is dormant in the MVP (no `prMerged` source), **`force` is the only
path that ever proceeds in the MVP**, so the MVP UI **always confirms before deleting** — there is
no contradiction between "safe-delete requires PR-merged" and "delete is usable today": the
criteria stay fully specified, and the confirmation/`force` path keeps delete fully usable now.
The non-force path becomes reachable, with no spec change, the moment a PR-status source populates
`prMerged`.

- _Rationale:_ the prototype already ships the control; leaving it inert/unspecified is worse than
  the natural symmetric counterpart of create. The Future-features "delete worktrees/branches"
  item is scoped to **branch** lifecycle and bulk management, which this explicitly excludes;
  removing the *checkout* belongs with the change that creates it. The server-side re-check makes
  the UI's lit/unlit styling a real safety boundary, not advisory.
- _Flag for the Artifacts review checkpoint:_ this is the one place the change reaches beyond
  `proposal.md`'s "What Changes" list (which omits delete) to honour the locked `prototypes.md`
  deferral. The session-liveness and PR-merged **seams** (degrading safely until their owning
  changes populate them) are the coupling to scrutinise.

### Decision 7 — Telemetry: branch names and worktree paths are sensitive

Branch names are adversarial *and* on the redaction blocklist; the slug portion of `<wt-id>` can
echo a branch. Worktree spans therefore put the branch name, the `<wt-id>`, and absolute paths
under **blocklisted attribute keys** (the existing redactor masks them) and never as plain
attributes — mirroring `git-service.ts`'s clone span (`repoId`, `clone.url`, `git.args`,
`repo.path` under masked keys). The git-runner already discards subprocess stderr without logging.

- _Rationale:_ the programme's redaction policy names branch names + paths explicitly; the slug
  leak vector means `<wt-id>` is treated as sensitive too.

### Decision 8 — Vertical slice

The slice spans `packages/shared` (Zod schemas + the canonical ID function: `idForBranch`,
`isValidWorktreeId`, the worktree-create request, the worktree-summary + list response, the
delete request, reusing `operationStatusSchema`), `apps/server` (Git-service worktree
operations + a worktree orchestrator reusing the ledger/lock + the worktree create/list/delete/
status routes wired into the Hono app and typed client/contract), and `apps/web` (the worktrees-
hub worktree slice via TanStack Query + the production `src/ui/*` primitives, ported from the
prototype — not imported). No new config slot is needed (the GitHub PAT slot already exists).

## Testing strategy

Per the programme, unit tests run against TS source via the `switchboard-source` condition (no
pre-build); E2E needs `just build` first. The credential-helper/no-leak harness and the
operation test scaffolding already exist (`apps/server/src/testing/`) — this change **reuses**
them rather than rebuilding.

**Unit / integration (Vitest):**

- **Canonical ID scheme (`packages/shared`)** — the highest-value tests, since `claude-session-
  launch` depends on this function. Table-driven against **adversarial branch names**: `/` in
  names (`feature/foo`), traversal (`../x`, `..`, `.`, `.git`), spaces, Unicode/emoji,
  reserved/empty slugs, excessive length (→ slug truncation), and **case-folding pairs**
  (`Feature/X` vs `feature/x` → distinct `<wt-id>`s). Assert: every output passes
  `isValidWorktreeId`; the function is **deterministic** (same branch → same id) and produces
  **distinct ids** across the distinct-branch corpus (collision-resistant — the proof is distinct
  hashes, not a claim of impossibility); the slug round-trips the recognisable head; the branch is
  recoverable via git (Decision 2), not from the id.
- **Git service — worktree create/list/delete (`apps/server`)** — using the **temp-git fixture**
  as the remote and a bare clone of it: `worktree add` lands a real checkout at
  `repos/<owner>/<repo>/worktrees/<wt-id>` with the expected branch; **existing-remote-branch**
  (tracks `origin/<branch>`) vs **new-branch** (from base / default branch) both work; **list**
  reads worktrees from `git worktree list --porcelain` with correct id↔branch mapping and
  git-status (dirty / ahead / behind / diverged); a foreign/mismatched dir is ignored;
  **create-time collision detection** — a forced same-`<wt-id>`/**different-branch** collision (via
  a stubbed `idForBranch` mapping two branches to one id) is **detected and rejected** before any
  path is built, while case-folding pairs (`Feature/X` vs `feature/x`) each create their own
  distinct worktree directory on the case-insensitive FS; **delete** removes only the target
  worktree (bare + siblings untouched) and prunes; the safe-to-delete gate **refuses** an unsafe
  (dirty / session-active / not-merged) delete and **allows** `force`, and (the MVP coherence
  assertion) with no `prMerged` source wired **no worktree is ever auto-safe** so the auto-safe
  styling stays **dormant** and the delete path is exercised through `force`/confirmation.
- **Worktree orchestrator + ledger (`apps/server`)** — using the **operation scaffolding**:
  create **starts** as a tracked `worktree` operation reaching `ready`; the operation **records
  the exact requested branch** and a duplicate create for the same `<repo-id>/<wt-id>` **and the
  same exact branch** is **idempotent**, while a same-key create for a **different** branch (a
  forced truncated-hash collision exercised at the **orchestrator/API** level, not only in the Git
  service) is **not** aliased onto the existing operation but surfaces the **same typed collision
  error** at the operation boundary; concurrent creates of *different* worktrees in
  one repo are independent but their **git mutations serialize** under the per-repo lock;
  **abort** cancels and cleans the partial worktree, with the **abort-races-completion** single-
  terminal-transition behaviour (completion-wins keeps the worktree; abort-wins cleans only an
  incomplete target, gated on the completion check); **restart recovery** reconciles a `running`
  worktree op with a dead process to `failed` + cleanup.
- **No-leak / redaction** — extend the existing no-leak harness: a worktree create's
  telemetry/logs contain **no branch name, no `<wt-id>`/slug, no absolute path, no command args**
  (Decision 7); the credential helper used for the fetch never leaks the PAT.
- **API contract** — extend the contract test so the typed client mirrors the new worktree
  create / list / delete / status routes and their Zod schemas (drift fails the build); `422` on
  invalid input (bad repo-id, unsafe/empty branch).

**UI (component / Storybook + TanStack Query):** production stories/render tests for the
worktrees-hub worktree slice this change owns — the worktree **list** (with git lamp), **empty**
("Add worktree…" only), **loading**, and **error** states; the **create-worktree modal**
(existing-branch vs new-branch, base-branch select, validation before Create enables); and the
**delete** control + confirmation with the **safe-to-delete styling** driven by the predicate
(lit when safe, refused-with-reason when not). Mobile + desktop, both colour schemes, reusing the
responsive helpers. Query-wiring tests cover loading/error/success against a mocked typed client.

**E2E (Playwright, temp-git fixture):** create a worktree (new branch and existing-remote-branch)
→ it appears in the hub with the right branch + git lamp; create with an **adversarial branch
name** (`feature/foo`, a Unicode name) → a valid `<wt-id>` directory and a correct mapping;
**delete** a safe worktree → it disappears and the bare/siblings survive; **delete refused** for
an unsafe (dirty) worktree; the **ledger/lock** behaviours (idempotent duplicate create,
abort + cleanup, recovery after restart).

**Test-harness gap assessment.** The base harness is in place (temp-git fixture, operation
scaffolding, credential-helper + no-leak rig, contract-test pattern, responsive Storybook
helpers). **No large new harness is required** — the gaps are small and become the leading
**"Test infrastructure"** task group:

1. **Worktree temp-git fixture extension** — the temp-git fixture clones a remote; worktree tests
   additionally need the fixture remote to carry **a known existing branch** (for the existing-
   remote-branch path) and a helper to **bare-clone it locally** so `worktree add` has a real
   bare repo to operate on. A small extension of the existing fixture, not a new one.
2. **Session-probe + PR-merged seam fakes** — controllable fakes for the `noActiveSession` and
   `prMerged` inputs (Decision 6) so safe-to-delete can be driven through every branch
   (safe / dirty / session-active / not-merged / force) deterministically.

## Risks / Trade-offs

- **[Risk] `<wt-id>` collision** across distinct branches (especially case-folding on macOS's
  case-insensitive FS) silently aliasing two worktrees onto one directory. → _Mitigation (now a
  SHALL, not advisory):_ the `slug--hash` scheme hashes the **exact raw branch** (Decision 1) so
  case-folding pairs already differ; on top of that, the **mandatory create-time collision check**
  (Decision 1 + the spec's create requirement) consults the persisted-on-disk worktree set and
  **rejects with a typed collision error** a distinct-branch `<wt-id>` collision **before any
  path or tmux name is built** — both in the Git service and at the operation/orchestrator boundary
  (the ledger records the exact requested branch and reuses an operation only on branch equality,
  Decision 3), and **never by extending the identifier** (an extended id would not match its
  branch's derivation and so would be invisible to list/delete) — so two branches are never aliased;
  the 48-bit hash is collision-_resistant_, and detect-and-reject closes the residual probability.
  The distinct-branch corpus test (incl. case-folding pairs) plus a forced same-id/different-branch
  rejection test at **both** the Git-service and orchestrator levels are the verifiable proof.
- **[Risk] Branch-name path traversal** (`../`, `.git`, embedded `/`) escaping the worktree dir.
  → _Mitigation:_ the id is derived only through `idForBranch` (charset-restricted slug + hash)
  and re-validated by `isValidWorktreeId` before any path is built — the same defence-in-depth as
  `<repo-id>` in `repo-clone-browse`.
- **[Risk] Concurrent `git worktree add/remove` on one bare repo** corrupting git's worktree
  admin state. → _Mitigation:_ per-`<repo-id>` `KeyedLock` around the git-mutating section
  (Decision 3), independent of the per-worktree operation key.
- **[Risk] Interrupted create** leaves a half-written worktree dir that lists as a worktree. →
  _Mitigation:_ the `worktree` ledger handler's `isComplete`/`cleanup` + restart reconcile prune
  the incomplete target, exactly like the clone; list ignores dirs git doesn't report as
  worktrees.
- **[Risk] PAT / branch-name leak** via the fetch subprocess or telemetry. → _Mitigation:_ reuse
  the credential helper unchanged; redact branch/`<wt-id>`/path/args (Decision 7); extend the
  no-leak tests to the worktree path.
- **[Risk] Deleting a worktree with un-pushed work** loses it irrecoverably. → _Mitigation:_ the
  safe-to-delete gate refuses on `dirty`/not-merged; `force` is explicit and confirmation-gated
  in the UI; the git **branch** is never deleted, so pushed history survives even after the
  worktree is removed.
- **[Trade-off] Specifying + implementing delete** beyond `proposal.md`'s "What Changes". →
  _Mitigation:_ scoped to **worktree** removal (not branch lifecycle), honouring the locked
  `prototypes.md` deferral; flagged for the Artifacts review checkpoint (Decision 6).
- **[Trade-off] Session-liveness / PR-merged seams** default-degrade rather than fully evaluate
  the predicate today, and they degrade **asymmetrically**: the **session-liveness** seam is
  satisfiable in the MVP (wired by `claude-session-launch`, which depends on this change; "no
  session" until then), whereas the **PR-merged** input has **no MVP data source** at all, which
  makes the auto-safe path **dormant in the MVP** (every delete is confirmation-gated via `force`).
  → _Mitigation:_ the dependency direction forbids importing `claude-session-launch`; the seams
  keep the predicate complete and the safe-default conservative (not auto-safe until wired), delete
  stays fully usable via confirmation, and both seams are the documented integration point for the
  downstream change — no spec change is needed when a PR-status source ships, the dormant path
  simply becomes live.
- **[Risk] Architecture overlay drift** — `Switchboard.Api`'s Git service gains worktree
  concerns. → _Mitigation:_ author `Planned/worktree-management.c4` (extend the Git service,
  additions `#todo`, view ids `worktree-management-*`) and `likec4 validate` it; the Architecture
  review checkpoint gates it.

## Migration Plan

- **Filesystem:** introduce `~/.switchboard/repos/<owner>/<repo>/worktrees/<wt-id>/` (under the
  already-gitignored `repos/`). The ledger store under `~/.switchboard/operations` is reused
  (new `worktree`-type records key off `<repo-id>/<wt-id>`); no new top-level store.
- **Operation ledger:** widen `OperationType` to `'clone' | 'worktree'` and register the
  `worktree` handler in the worktree orchestrator's handler map. Additive — existing `clone`
  records and behaviour are unchanged.
- **API:** additive worktree routes (create / list / delete / status) wired into the Hono app,
  typed client, and contract test; no breaking changes to the repo routes.
- **Architecture:** author `docs/dev/Architecture/Planned/worktree-management.c4` and validate it
  (`pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture`).
- **Prototype disposition:** `worktrees.stories.tsx` is **consumed/superseded** by this change's
  production worktree UI (ported, not imported — quarantine holds). Per `ui-prototypes-mvp`'s
  deferred-archive note its row resolves to `delete — superseded by worktree-management` when its
  remaining (plug/session) concern is consumed by `claude-session-launch`; this change records
  its consumption of the worktree slice in `docs-migration.md`.

## Open Questions

- **PR-merged data source.** No GitHub-PR service exists in the MVP. _Direction (resolved):_ keep
  `prMerged` an input on the worktree model defaulting unset (safe-to-delete conservatively false
  on the PR term until wired); a later PR-status feature (interactive-lamp Future feature)
  populates it. Because the input is MVP-unavailable, the auto-safe path is **specified but dormant
  in the MVP** and delete stays usable via confirmation (Decision 6) — so there is no
  "required criterion depends on a missing capability" contradiction. The predicate is specified
  now so the integration point is fixed and the dormant path goes live with no spec change.
- **`force` delete exposure in the MVP UI.** The server supports `force`; whether the MVP UI
  surfaces a "delete anyway" affordance or only enables delete when safe. _Direction (resolved):_
  since the auto-safe (lit) path is dormant in the MVP (no `prMerged` source), the MVP UI **always
  routes delete through an explicit confirmation** that sets `force`; the "bright red when safe"
  styling is wired to the predicate and will light when a PR-status source ships. The server
  contract supports both the safe and `force` paths regardless.
- **Hash truncation length (12 hex) vs detect-and-reject.** _Direction (resolved):_ keep **12 hex
  (48 bits)** — ample for a single user's worktree counts and legible in directory/tmux listings.
  The essential safety property is **not** the digest length but the **mandatory create-time
  detect-and-reject** (Decision 1, now a SHALL), which closes the residual truncated-hash collision
  probability regardless of length; lengthening the digest is an orthogonal, deferrable tweak.
  Revisit the length only if a real collision is ever observed.
