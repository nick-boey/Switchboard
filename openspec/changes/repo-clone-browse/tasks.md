# Tasks: repo-clone-browse

Red-green applies to the feature groups (2–9): each failing-test task precedes its
implement-to-green task. **Group 1 is enabling test infrastructure** — the harness gaps from
`design.md` (no operation ledger/lock, no GitHub fake, no no-leak/credential-helper rig);
these are scaffolding with smoke tests, not production behaviour to test-first. Unit tests run
against TS source (no pre-build); the E2E group (9) requires `just build` first. Ordering
constraints on other changes live in `dependencies.md`, not here. The programme-page trim
(`docs-migration.md` row 1) resolves at archive, not as a task.

## 1. Test infrastructure

- [x] 1.1 Build a deterministic **fake GitHub REST layer** (paginated repo/org lists via a
      synthetic `Link` header; `401`, `403` rate-limit with reset, and `404` responses) usable
      from both Vitest and the Playwright run, with a smoke test proving pagination and each
      error shape.
- [x] 1.2 Build the **no-leak assertion harness**: helpers that spawn git and scan the process
      arguments, the cloned repository tree and its bare config at `.bare/config` (the bare clone
      has no `.git/config`), and captured telemetry/logs for a secret (reusing the `foundations`
      redaction/telemetry-capture path), with a smoke test.
- [x] 1.3 Build the **credential-helper test rig**: exercise the helper's credential-protocol
      I/O against a `600`-mode token file in a temp `~/.switchboard` workspace, with a smoke
      test.
- [x] 1.4 Build the **operation test scaffolding**: a temp `~/.switchboard` workspace fixture
      (via `RuntimeContext`) plus controllable process/clock seams enabling concurrency,
      mid-flight-kill, and restart/reconcile simulation, with a smoke test.

## 2. Shared contracts & config (packages/shared)

- [x] 2.1 Write the failing schema tests: the repo-list response (the authenticated user's own
      account and their organisations as selectable owners, plus accessible repositories each
      carrying their owner), the clone request (accepts a full
      `https://github.com/<owner>/<repo>` URL — including an optional trailing `.git`, normalized
      away — or a bare `<owner>/<repo>`, rejects out-of-charset and traversal segments), the
      abort request/response (an operation/`repo-id` identifier in,
      the resulting operation status out), the clone/operation-status response, and the `github`
      config shape that replaces the reserved `z.null()` (PAT sourced from `~/.switchboard`;
      unset/`null` ⇒ disabled).
- [x] 2.2 Implement the Zod schemas (including the abort request/response and the owner-aware
      repo-list response) and the `github` config slot in `packages/shared` to green; confirm an
      unconfigured (`null`) config still parses (backward compatible).

## 3. Operation ledger + lock (apps/server)

- [x] 3.1 Write the failing tests for the shared subsystem (using the group-1.4 scaffolding):
      a ledger record carries `{ id, type, key, state, startedAt, finishedAt, error? }`;
      a duplicate request for an in-flight/succeeded key returns the existing operation
      (**idempotency**); a per-key **lock** serializes concurrent operations on the same key;
      **abort** transitions to `aborted` and runs cleanup, and an **abort that races a
      completion** resolves as a **single terminal transition** under the per-key lock
      (completion-wins → the existing terminal state stands and no cleanup runs; abort-wins →
      cleanup runs only when the completion marker is absent); on restart a `running` operation
      with no live process is reconciled to `failed` and cleaned (**recovery**).
- [x] 3.2 Implement the filesystem-backed operation ledger + per-key lock under `~/.switchboard`
      to green, as a minimal named subsystem reusable by later changes.

## 4. GitHub service — `github-repos` (apps/server)

- [x] 4.1 Write the failing tests (using the group-1.1 fake): listing returns the user's
      organisations and accessible repositories; the **authenticated user's own account is
      exposed as a selectable owner** alongside the organisations, and personally-owned repos
      are returned for that account (distinct from org repos); results **paginate** by following
      `Link: rel="next"`; failures map to typed `unauthorized` / `rate-limited` (with reset) /
      `not-found` errors with **no GitHub error body** surfaced or logged; an unconfigured PAT
      yields `not-configured`; the PAT implementation satisfies the **provider interface**.
- [x] 4.2 Implement the `GitHubProvider` interface and its PAT-backed `fetch` implementation
      (selectable owners = account + orgs, pagination, typed errors, not-configured) to green.

## 5. Git service — bare clone, path safety, credential helper (apps/server)

- [x] 5.1 Write the failing tests (temp-git fixture as the remote): a **bare clone** lands at
      `~/.switchboard/repos/<owner>/<repo>/.bare` with no working tree; same-named forks do not
      collide; **list-cloned** reads completed clones from disk and ignores incomplete targets;
      out-of-charset/traversal owner-repo input is rejected before any path is constructed.
- [x] 5.2 Implement the Git service (validated `<owner>/<repo>` → bare `git clone --bare`;
      list-cloned with a completed-clone marker) to green.
- [x] 5.3 Write the failing **no-leak** tests (group-1.2/1.3 harness): the PAT is absent from
      process arguments and the clone URL is plain `https://github.com/<owner>/<repo>.git`; the
      bare config at `~/.switchboard/repos/<owner>/<repo>/.bare/config` (not a `.git/config`,
      which a bare clone lacks) holds neither a credential-helper entry nor a PAT-bearing remote
      URL — e.g. `git --git-dir …/.bare config --get-regexp '^(credential|remote\..*\.url)'`
      returns nothing secret — and the PAT appears nowhere under the clone; the PAT, clone URL,
      absolute paths, command args, and GitHub error body are redacted from telemetry.
- [x] 5.4 Implement the **credential helper** (reads the PAT from `~/.switchboard`, emits it
      over git's credential protocol, wired per-invocation with host-scoped `-c`, never
      persisted) to green.

## 6. Clone as a tracked operation (apps/server)

- [x] 6.1 Write the failing tests: a clone **starts** as a tracked operation and returns
      immediately in a `cloning` state, reaching `ready` on success; a request for an
      already-cloned or in-flight repo is **idempotent** (returns the existing result/op);
      concurrent same-repo clones are **serialized**; **abort** cancels the subprocess and
      removes the partial `.bare`, and an **abort that races a successful clone completion**
      resolves as a single terminal transition under the per-repo lock (completion-wins →
      `ready`, the completed `.bare` is **not** deleted; abort-wins → only an incomplete target
      is removed, gated on the completion marker); a `running` clone with a dead process is
      **reconciled** on restart; clone failures record a typed error (`unauthorized` /
      `not-found` / `rate-limited` / git failure).
- [x] 6.2 Implement the clone-through-ledger orchestration (Git service + operation ledger/lock
      + typed failure mapping) to green.

## 7. API routes, typed client & contract (apps/server)

- [x] 7.1 Write the failing tests: the clone, **abort**, list-cloned, operation-status, and
      repo-list routes validate input with Zod (invalid input → `422`, handler not invoked); the
      **abort** route aborts an in-flight clone and responds with the operation's terminal
      status (and for an unknown or already-finished operation — including a clone that
      **completed as the abort arrived** — reports the current terminal status, e.g. `ready`,
      without terminating any subprocess or deleting the completed clone); and the typed client
      mirrors every route — including an **abort method** — so schema drift fails the
      **contract** test.
- [x] 7.2 Wire the routes (including the **abort** route) into the Hono app and extend the typed
      client/contract — including the abort method — to green.

## 8. Web UI — New repository & getting-ready (apps/web)

- [x] 8.1 Write the failing UI tests for the **New repository** screen (TanStack Query +
      `src/ui/*` primitives, ported from the `new-repository` prototype, not imported): Local
      source disabled; the **Owner** selector offers the authenticated user's own account and
      their organisations, and Select repository validates the chosen owner and repository
      against the `github-repos` listing before Clone enables — covering **both a personal-account
      repo and an organisation repo** as happy paths; From URL validates and previews the parsed
      `<owner>/<repo>`, including a `.git`-suffixed URL whose suffix is normalized away; the
      **empty/unconfigured** state prompts to add a PAT when none is
      configured; mobile + desktop, both colour schemes.
- [x] 8.2 Implement the New repository screen to green.
- [x] 8.3 Write the failing UI tests for the repository **getting-ready** screen: **in-progress**
      (cloning indicator + Abort), **error** (Retry + Abort/back, no raw command/GitHub output),
      and **ready** states, driven by polling the operation status; the **Abort action invokes
      the abort mutation** (typed client `abort` method) and the screen reflects the resulting
      `aborted` state.
- [x] 8.4 Implement the getting-ready screen (start clone → navigate → poll status → ready, with
      the Abort action wired to the abort mutation) to green.

## 9. End-to-end (Playwright — requires `just build`)

- [ ] 9.1 Write the failing E2E (temp-git fixture + the group-1.1 fake GitHub): New repository
      flow → Clone → getting-ready → repository ready, covering **both a personal-account repo
      and an organisation repo** via the owner selector and a **From URL `.git` input**
      (`https://github.com/<owner>/<repo>.git`); **abort** (the Abort action calls the
      abort endpoint and the screen reaches the `aborted` state); **error** (404/403/rate-limit);
      and the **ledger/lock** behaviours (concurrent clone requests, cancellation, an **abort
      that races completion** resolving to a single terminal state without deleting a completed
      clone, recovery after restart).
- [ ] 9.2 Wire the flow end-to-end to green.

## 10. Architecture overlay (docs)

- [ ] 10.1 Author `docs/dev/Architecture/Planned/repo-clone-browse.c4` (`docs-migration.md` row
      2): `extend` `Switchboard.Api` with the GitHub service, Git service, operation
      ledger/lock, and credential helper, every addition tagged `#todo`, view ids prefixed
      `repo-clone-browse-*`; validate with
      `pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture`. (Triggers the
      Architecture review checkpoint.)

## 11. Verify

- [ ] 11.1 Run `just lint`, `just typecheck`, `just test`, and `just e2e` (after `just build`);
      confirm all new unit/UI/E2E tests pass, the no-leak tests prove the PAT never appears in
      args/URL/the bare `.bare/config`/telemetry, and the LikeC4 overlay validates.
