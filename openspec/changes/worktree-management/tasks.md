# Tasks: worktree-management

Red-green applies to the feature groups (2–8): each failing-test task precedes its
implement-to-green task. **Group 1 is enabling test infrastructure** — the two harness gaps from
`design.md` (the worktree temp-git fixture extension; the session-probe + PR-merged seam fakes);
these are scaffolding with smoke tests, not production behaviour to test-first. The credential
helper, no-leak harness, and operation scaffolding from `repo-clone-browse` are **reused**, not
rebuilt. Unit tests run against TS source (no pre-build); the E2E group (8) requires `just build`
first. Ordering constraints on other changes live in `dependencies.md`, not here.

## 1. Test infrastructure

- [x] 1.1 Extend the **temp-git fixture** so worktree tests have a bare clone to operate on: the
      fixture remote carries **a known existing branch** (for the existing-remote-branch path),
      plus a helper to **bare-clone it locally** to `repos/<owner>/<repo>/.bare` (reusing the Git
      service), with a smoke test proving the bare repo and the existing branch are present.
- [x] 1.2 Build the **session-probe + PR-merged seam fakes**: controllable fakes for the
      `noActiveSession` and `prMerged` inputs to the safe-to-delete predicate, so the predicate can
      be driven through every branch (safe / dirty / session-active / not-merged / force)
      deterministically, with a smoke test.

## 2. Shared contracts & canonical ID scheme (packages/shared)

- [x] 2.1 Write the failing tests for the **canonical path-safe ID scheme** (`idForBranch`,
      `isValidWorktreeId`): table-driven over adversarial branch names (`/`, `../x`/`..`/`.`,
      `.git`, spaces, Unicode/emoji, reserved/empty slug, excessive length) and **case-folding
      pairs** (`Feature/X` vs `feature/x`) — every output is path-safe and passes
      `isValidWorktreeId`; derivation is **deterministic**; distinct branches produce **distinct
      ids** across the corpus (**collision-resistant**, slug `--` hash, hash over raw branch bytes —
      assert distinct hashes, not an impossibility claim); the slug round-trips the recognisable
      head. (Create-time collision detect-and-reject is exercised in group 3, since it consults the
      on-disk worktree set.)
- [x] 2.2 Write the failing schema tests: the worktree-create request (valid `<repo-id>` + branch +
      mode `existing-remote`|`new` + optional base; rejects unsafe/empty branch and malformed
      `<repo-id>`), the worktree-summary + list response (`<wt-id>`, exact branch, path, git-status
      `dirty` + `sync ∈ up-to-date|ahead|behind|diverged`, optional `prMerged`), and the
      worktree-delete request (`<repo-id>` + `<wt-id>` + optional `force`).
- [x] 2.3 Implement the ID-scheme function + validator and the Zod schemas in `packages/shared`
      (reusing the conservative charset family from `repos.ts`) to green; export them from the
      package index for the server and the (future) `claude-session-launch` tmux naming.

## 3. Git service — worktree create / list / delete, branch existence (apps/server)

- [x] 3.1 Write the failing tests (group-1.1 fixture as the remote/bare clone): **create** lands a
      working tree at `repos/<owner>/<repo>/worktrees/<wt-id>` on the branch; **existing-remote
      branch** fetches and checks out tracking `origin/<branch>`; **new branch** is created from the
      base (default = origin `HEAD`); create **requires a completed bare clone** and **rejects**
      unsafe/empty branch before any path is built; **create-time collision detection** — a forced
      same-`<wt-id>`/**different-branch** collision (via a stubbed `idForBranch` mapping two distinct
      branches to one id) is **detected and rejected with a typed collision error** before
      any path is built (the id is never extended or mutated), while **case-folding pairs**
      (`Feature/X` vs `feature/x`) each create their
      own **distinct** worktree directory on the case-insensitive FS (no aliasing); **list** reads
      `git worktree list --porcelain` with the correct id↔branch mapping + git-status, and
      **ignores** a foreign/mismatched dir; **delete** removes only the target worktree (bare +
      siblings untouched), prunes, and never deletes the branch.
- [x] 3.2 Implement the Git-service worktree operations (validated `<repo-id>`/`<wt-id>` → `git
      worktree add/list/remove` against `.bare`, branch-existence check via the remote, the
      create-time collision check against the on-disk worktree set comparing branches exactly,
      git-status derivation) to green.

## 4. Worktree creation as a tracked operation (apps/server)

- [x] 4.1 Write the failing tests (reusing the operation scaffolding): widen the ledger to a
      `worktree` `OperationType`; a create **starts** as a tracked op keyed by `<repo-id>/<wt-id>`
      and reaches `ready`; the operation **records the exact requested branch** in its metadata and
      a duplicate create for the same key **and the same exact (case-sensitive) branch** is
      **idempotent**; a same-key create for a **different** branch (a truncated-hash collision forced
      at the **orchestrator/API** level, not only the Git service) is **not** reused/aliased but
      surfaces the **same typed collision error** as group 3 **at the operation boundary**, producing
      no second worktree; concurrent creates
      of **different** worktrees in one repo are independent but their git mutations **serialize**
      under the per-`<repo-id>` lock; **abort** cancels + cleans the partial worktree with the
      **abort-races-completion** single-terminal-transition behaviour (completion-wins keeps it;
      abort-wins cleans only an incomplete target, gated on the completion check); a `running`
      worktree op with a dead process is **reconciled** to `failed` + cleanup on restart.
- [x] 4.2 Implement the worktree orchestrator (Git service + the `worktree` ledger handler
      `isComplete`/`cleanup` + the per-`<repo-id>` git-mutation lock) to green, recording the exact
      requested branch in the operation metadata and gating idempotent reuse on **branch equality
      first** so a same-key/different-branch request raises the typed collision error at the
      operation boundary instead of aliasing the existing operation.

## 5. Safe-to-delete predicate & no-leak (apps/server)

- [x] 5.1 Write the failing tests for the **safe-to-delete** gate (group-1.2 seam fakes): the
      predicate is `noActiveSession AND prMerged AND NOT dirty`; delete is **refused** (typed
      `not-safe`) for a dirty / session-active / not-merged worktree without `force`, **allowed**
      with `force`, and the seams **degrade safely** (default: no session, PR unmerged) so a
      worktree is not auto-safe until the inputs are wired. Assert the **MVP coherence**: with no
      `prMerged` source wired, **no worktree is ever auto-safe** (the auto-safe path is dormant),
      a worktree with **no merged PR (incl. no PR at all) is not auto-safe**, and **every MVP
      deletion is confirmation-gated** via `force` — the `force`/confirmation path removes **only
      the worktree checkout** (never the bare clone, siblings, or branch — cross-check group 3).
- [x] 5.2 Write the failing **no-leak** tests (reusing the no-leak/redaction harness): a worktree
      create/list/delete emits **no branch name, no `<wt-id>`/slug, no absolute path, no command
      args** in telemetry/logs, and the credential helper used for an existing-remote fetch never
      leaks the PAT.
- [x] 5.3 Implement the server-side safe-to-delete guard (re-check before removal) and the
      redaction-safe worktree spans (sensitive values under blocklisted keys) to green.

## 6. API routes, typed client & contract (apps/server)

- [x] 6.1 Write the failing tests: the worktree **create**, **list**, **delete**, and **status**
      routes validate input with Zod (invalid input → `422`, handler not invoked); delete reports
      the typed `not-safe` refusal vs success; and the typed client mirrors every route so schema
      drift fails the **contract** test.
- [x] 6.2 Wire the worktree routes into the Hono app and extend the typed client/contract to green.

## 7. Web UI — worktrees-hub worktree slice (apps/web)

- [ ] 7.1 Write the failing UI tests (TanStack Query + `src/ui/*` primitives, **ported** from the
      `worktrees` prototype, not imported): the worktree **list** (with git lamp), **empty**
      ("Add worktree…" only), **loading**, and **error** states; the **create-worktree modal**
      (existing-branch vs new-branch + base selector; Create enabled only for valid input); and the
      **delete** control reflecting the safe-to-delete predicate (lit when safe, confirm-before-
      remove, refused-with-reason when not) — including the **dormant-in-MVP** assertion: with no
      PR-status source, **no worktree reaches the lit styling** and the control **always confirms**
      before removing. Mobile + desktop, both colour schemes.
- [ ] 7.2 Implement the worktrees-hub worktree slice to green (create → tracked op → list refresh;
      delete → guarded removal → list refresh), with the plug rendered display-only (its on/off
      action is `claude-session-launch`) and the PR lamp display-only (no data source here).

## 8. End-to-end (Playwright — requires `just build`)

- [ ] 8.1 Write the failing E2E (group-1.1 fixture): create a worktree (**new branch** and
      **existing-remote branch**) → it appears in the hub with the right branch + git lamp; create
      with an **adversarial branch name** (`feature/foo`, a Unicode name) → a valid `<wt-id>`
      directory + correct mapping; **delete via confirmation** (the `force` path — the MVP delete
      path, since with no PR-status source no worktree is auto-safe) → it disappears and the
      bare/siblings survive; **delete refused** without confirmation/`force` (the un-forced path is
      always refused in the MVP) and for an unsafe (dirty) worktree; and the **ledger/lock**
      behaviours (idempotent duplicate create, abort + cleanup, recovery after restart).
- [ ] 8.2 Wire the flow end-to-end to green.

## 9. Architecture overlay (docs)

- [ ] 9.1 Author `docs/dev/Architecture/Planned/worktree-management.c4` (`docs-migration.md` row 2):
      `extend` `Switchboard.Api` (its Git service) with the worktree create/list/delete operations
      and the `worktree`-typed operation-ledger usage, every addition tagged `#todo`, view ids
      prefixed `worktree-management-*`; validate with
      `pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture`. List the added
      element/view ids in `plan.md`. (Triggers the Architecture review checkpoint.)

## 10. Verify

- [ ] 10.1 Run `just lint`, `just typecheck`, `just test`, and `just e2e` (after `just build`);
      confirm all new unit/UI/E2E tests pass, the ID-scheme tests prove **collision-resistance**
      (distinct ids) on the adversarial + case-folding corpus and the create-time
      **collision detect-and-reject** rejects a forced same-id/different-branch collision at **both
      the Git-service and the orchestrator/API boundary**, the
      safe-to-delete tests prove the auto-safe path is **dormant in the MVP** (every delete
      confirmation-gated), the no-leak tests prove no branch/`<wt-id>`/path/args leak, and the
      LikeC4 overlay validates.
