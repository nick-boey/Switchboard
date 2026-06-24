## Context

`repo-clone-browse` is the **first feature change** in the MVP chain
(`repo-clone-browse → worktree-management → claude-session-launch`) and the first change that
performs **long-running host work** — a git clone. Without a repo on disk nothing downstream
can run.

Current state going in:

- **`foundations`** (archived) shipped the harness this builds on: `RuntimeContext`
  (workspace root, config, logger, telemetry, identity), the Hono **RPC + Zod** app with a
  typed client and an API **contract test**, the reject-by-default **auth gate** (loopback
  bind, bearer + serve-identity, `/health` exempt), the **OpenTelemetry redaction** processor
  (its blocklist already names bearer/PAT, clone URL, branch name, absolute path, command
  args, GitHub error body), and the Playwright **temp-git fixture**
  (`packages/shared/src/testing/temp-git.ts`). Foundations **explicitly deferred the operation
  ledger/lock** ("arrives with the changes that do long-running work") and **reserved** the
  GitHub config slot — `packages/shared/src/config.ts` carries `github: z.null()`.
- **`ui-prototypes-mvp`** matured the flat design system into production primitives under
  `apps/web/src/ui/*` and sketched this change's surface in
  `apps/web/src/prototypes/ui-prototypes-mvp/new-repository.stories.tsx` (guided clone/create
  flow + the "getting ready" destination). Its **confirmation gate (2026-06-22)** is locked.
- **No** GitHub service, Git service, operation ledger/lock, or credential helper exists yet.

Constraints (cross-cutting, **owned by the programme page** `docs/plans/switchboard/mvp.md`,
not re-litigated here): Hono RPC + Zod; TanStack Query; Mantine flat theme; GitHub **PAT
behind an OAuth-ready provider interface**; git **credential-helper** token handling (never in
URL / the bare `.bare/config` / argv / logs; perms `600`); bare-clone layout
`~/.switchboard/repos/<owner>/<repo>/.bare`; **owner/repo-namespaced `<repo-id>`**; the
**filesystem operation ledger + lock** for the clone; services take a `RuntimeContext`. The
quarantine boundary holds — production code **ports** the prototype, it does not import
`src/prototypes/**`.

This change realizes the base model's `#planned` `Switchboard.Api -> GitHub` relationship and
introduces, inside `Switchboard.Api`, four new concerns: a **GitHub service**, a **Git
service**, the shared **operation ledger + lock**, and the **credential helper**.

## Goals / Non-Goals

**Goals:**

- `github-repos` — list the authenticated user's repositories and organisations via
  PAT-authenticated GitHub REST, behind an **OAuth-ready provider interface**, with pagination
  and rate-limit handling and typed errors (no GitHub error body leaked).
- `repo-clone` — **bare-clone** a chosen repo to `~/.switchboard/repos/<owner>/<repo>/.bare`,
  list already-cloned repos from disk, run the clone through the **operation ledger + lock**
  (idempotency, serialization, cancellation, restart recovery), and supply the PAT via the
  **credential helper** with **proof (subprocess + redaction tests) that it never leaks**.
- Build the **operation ledger + lock** subsystem (first consumer is the clone; reused by
  `worktree-management` / `claude-session-launch`).
- Refine the `new-repository` prototype into the **production New repository screen** and the
  repository **"getting ready" (cloning / error / abort)** states — this change **owns these
  screens and specifies their empty / in-progress / error states** (per `prototypes.md`
  decision #4: each screen-owning change specifies its own screen states).
- Author the planned-architecture overlay `docs/dev/Architecture/Planned/repo-clone-browse.c4`
  (committed in `plan.md`; the Architecture review checkpoint fires when it lands).

**Non-Goals:**

- **Local repository creation** — sketched in the prototype but **deferred/disabled for the
  MVP** (the source toggle's `Local` option stays disabled).
- **Worktree creation / session launch** — `worktree-management` and `claude-session-launch`;
  there is **no default `main` worktree** (every worktree is explicit — programme decision).
- **Interactive git/PR lamp helpers** — display-only in the MVP (Future features).
- **PAT / OAuth setup UI** — the PAT is written to `~/.switchboard` **out-of-band by the CLI**;
  this change *reads* it and surfaces a clear "GitHub not configured" state when it is absent.
- **Re-clone / fetch-update** of an already-cloned repo — already-cloned is an **idempotent
  no-op** (lands on the existing repo); fetch/pull/update is deferred.
- **Deleting clones**; the full **path-safe branch/worktree/tmux** ID scheme
  (`worktree-management`) — here only the **owner/repo** repo-id segment is validated.

## Decisions

### Decision 1 — GitHub access behind an OAuth-ready provider interface (PAT impl, fetch client)

A `GitHubProvider` interface (`listRepositories()`, `listOrganisations()`, returning typed
results) is the seam; the MVP implementation is **PAT-backed** and reads the token from the
`RuntimeContext` config. The HTTP layer is a **thin `fetch` client**, not Octokit: it gives
full control over what is read/logged (critical for the no-leak guarantee) and avoids a heavy
dependency, while the provider seam keeps the OAuth/keychain swap a later, contained change.

- _Rationale:_ programme page locks "PAT behind an OAuth-ready provider interface"; a minimal
  client keeps the redaction surface auditable.
- _Alternative considered:_ `@octokit/rest` — richer (pagination/rate-limit built in) but a
  large dependency whose internal logging/error shapes we would have to audit for leaks.

### Decision 2 — Pagination follows `Link`; rate-limit and access errors are typed

The provider follows the `Link: rel="next"` header to aggregate all pages (with a defensive
page cap) and maps GitHub responses to **typed errors**: `unauthorized` (401 — bad/missing
PAT → the UI's "GitHub not configured / token invalid" state), `rate-limited` (403 +
`x-ratelimit-remaining: 0`, carrying the reset/`retry-after`), and `not-found` (404). GitHub
error **bodies are never surfaced or logged** (redaction blocklist).

- _Rationale:_ resolves the plan's open question on pagination + rate-limit handling; the UI
  needs to distinguish "no access" from "try again later" from "doesn't exist".

### Decision 3 — Operation ledger + lock as a first-class subsystem (built here)

The clone runs as a tracked **operation**: a per-`repo-id` **lock** serialises operations, and
a JSON **ledger record** under `~/.switchboard` captures `{ id, type: 'clone', repoId, state,
startedAt, finishedAt, error? }` with `state ∈ pending | running | succeeded | failed |
aborted`.

- **Idempotency** — a clone request for a `repo-id` that already has an in-flight or succeeded
  operation returns the **existing** operation, never a duplicate.
- **Serialization** — the per-`repo-id` lock prevents concurrent clones of the same repo.
- **Cancellation** — abort and clone-completion resolve under the per-`repo-id` lock as a
  **single terminal transition** (the winner sets the terminal state once). If completion wins
  the race, abort returns the `ready`/succeeded status and the completed `.bare` is **not**
  removed; if abort wins, it transitions the operation to `aborted`, kills the git subprocess,
  and removes the partial `.bare` — cleanup **re-checks the completion marker** so a completed
  `.bare` is never deleted.
- **Restart recovery** — on startup, any operation left `running` with no live process is
  reconciled (→ `failed`) and its partial target cleaned, so a crashed clone never leaves a
  half-written `.bare` that lists as "cloned".

It lives as a named server subsystem (not a `utils` bucket), kept minimal so
`worktree-management` / `claude-session-launch` reuse it. Its **observable behaviours are
specified as `repo-clone` requirements** (idempotency / serialization / cancellation /
recovery) rather than a separate capability, matching the proposal's capability list.

- _Rationale:_ programme page locks the ledger/lock for long-running ops; foundations deferred
  it to the first consumer, which is this change.
- _Alternative considered:_ block the HTTP request for the whole clone — rejected: clones are
  slow, the gate confirmed the async **"getting ready"** UX, and serialization/recovery need a
  durable record regardless.

### Decision 4 — Clone via `git` subprocess with an ephemeral credential helper (no PAT leak)

The clone is `git clone --bare <https-url> <dest>` where `<https-url>` is the plain
`https://github.com/<owner>/<repo>.git` (**no token in the URL**). The PAT reaches git **only**
through a **credential helper** that reads it from `~/.switchboard` and emits it over git's
credential protocol (stdin/stdout `password=…`), wired per-invocation with
`-c credential.helper=…` scoped to `github.com` so it is **never persisted** into the cloned
repo's bare config (`~/.switchboard/repos/<owner>/<repo>/.bare/config` — a bare clone has no
`.git/config`). The PAT therefore never appears in: the clone URL, the bare `.bare/config`,
process **argv**, or **logs/telemetry** (redaction). This is enforced by the dedicated
subprocess + redaction **no-leak tests** the programme page assigns to this change.

- _Rationale:_ programme "Token handling" decision; the credential helper is a git-CLI concept,
  so the clone uses the git CLI (not a JS git library).
- _Alternative considered:_ `GIT_ASKPASS` / token-in-URL — both risk the token reaching argv,
  env-dumps, or the persisted `.bare/config`; the helper keeps it file-resident and
  process-scoped.

### Decision 5 — `<repo-id> = <owner>/<repo>`, validated for path safety

The canonical id is **owner/repo** (forks of the same name don't collide); the bare clone lands
at `~/.switchboard/repos/<owner>/<repo>/.bare`. Because the **From URL** path accepts arbitrary
input, `owner` and `repo` are validated against a **conservative charset** (`[A-Za-z0-9._-]`,
matching the prototype's `parseRepoUrl`) and **traversal segments (`.`, `..`, embedded `/`)
are rejected** in the shared Zod schema, so the on-disk destination is always derived from a
validated id. The shared schema also **normalizes an optional trailing `.git` suffix** on a full
URL — the shape copied from GitHub's clone dialog (`https://github.com/<owner>/<repo>.git`) —
stripping it before deriving `owner`/`repo`, again matching the prototype's `parseRepoUrl`. The
full path-safe **branch/worktree/tmux** scheme is `worktree-management`'s; only the repo-dir
segment is in scope here.

### Decision 6 — Async clone surface: start → poll operation → "getting ready" screen

`POST /repos/clone` validates the target, **starts** the operation, and returns immediately
with the `repo-id` + operation handle in a `cloning` state. The web app navigates to the
repository page, which **polls the operation status** (TanStack Query) and renders the
**getting-ready** states this change owns:

- **in-progress** — "Getting ready…", the cloning plug, and an **Abort clone** action;
- **error** — clone failed (auth / not-found / rate-limited / git error) with **Retry** and
  **Abort/back**;
- **ready** — the page becomes the repository (the worktrees hub, owned downstream).

The Abort action is backed by a dedicated **abort-operation endpoint** (its own request/response
schema + typed client method) that drives Decision 3's cancellation (terminate the subprocess,
clean the partial `.bare`); Retry re-starts a fresh clone operation. Retry/abort are
**user-initiated**; automatic transient retry is out of scope (Open Question).

- _Informed by:_ `new-repository.stories.tsx` (`Mobile`, `MobileFromUrl`, `MobileGettingReady`,
  `Desktop`) and the locked gate decision that Clone lands on a saga-driven "getting ready"
  state.

### Decision 7 — New repository screen: ported prototype, validated against live GitHub data

The production New repository screen ports the prototype's structure: a **GitHub · Local**
source toggle (**Local disabled**), then under GitHub a **Select repository · From URL**
toggle.

- **Select repository** — editable **Owner** + **Repository** autocompletes whose options and
  **validity** come from the `github-repos` listing (TanStack Query), not fake data. The
  **Owner** options are the authenticated user's **own account** plus each of their
  **organisations**, so personally-owned repos — which `github-repos` returns — are selectable,
  not only org repos. Owner is valid when it is your account or one of your fetched orgs;
  repository is valid when it's in that owner's repos. Clone enables once both resolve.
- **From URL** — one field validated by **parse** (`https://github.com/<org>/<repo>`, with an
  optional trailing `.git` as copied from GitHub's clone dialog, or a bare `<org>/<repo>`),
  normalizing away any trailing `.git` and previewing the parsed `owner/repo`. Access/existence
  is **confirmed by the clone operation** (→ the getting-ready `error` state on 404/403), not
  pre-checked.

The screen also renders an **empty/unconfigured** state when no PAT is present ("GitHub not
configured — add a PAT to `~/.switchboard`"), so the surface degrades clearly rather than
failing opaquely.

### Decision 8 — Vertical slice + reserved config slot

The slice spans `packages/shared` (Zod schemas: repo-list response — the authenticated account
and organisations as selectable owners plus accessible repositories — clone request/response,
abort request/response, operation status; the `github` config shape replacing the reserved
`z.null()`), `apps/server` (GitHub service, Git service, operation ledger/lock, credential
helper, clone + abort + list + status routes wired into the Hono app and typed client/contract),
and `apps/web` (the two screens via TanStack Query + the `src/ui/*` primitives). Filling the **reserved `github` config slot** is
backward-compatible: unset/`null` means GitHub features are disabled with the "not configured"
state above.

## Testing strategy

Per the programme page, **the subprocess/PAT-redaction tests live in this change**, and
Playwright covers the **operation ledger/lock** behaviour. Unit tests run against TS source via
the `switchboard-source` condition (no pre-build); E2E needs `just build` first.

**Unit / integration (Vitest):**

- **github-repos** — `GitHubProvider` (PAT impl) against a **faked GitHub HTTP layer**: lists
  repos + orgs, **follows pagination**, maps **401 / 403 rate-limit / 404** to typed errors,
  and (with the redaction processor) proves no GitHub error body or PAT escapes. A
  provider-interface test asserts the PAT impl satisfies the OAuth-ready seam.
- **repo-clone (git service + ledger)** — using the **temp-git fixture** as the "remote":
  bare clone lands at `~/.switchboard/repos/<owner>/<repo>/.bare`; **list-cloned** reads
  completed clones from disk; **already-cloned is idempotent**; owner/repo **path-traversal is
  rejected**. Ledger/lock: **idempotency** (duplicate request → same op), **serialization**
  (concurrent same-repo clones), **cancellation** (abort kills subprocess + cleans partial),
  **restart recovery** (a `running` op with a dead process reconciles to `failed` + cleanup).
- **credential helper / no-leak (subprocess + redaction)** — spawn the real clone under the
  helper and assert the **PAT is absent** from process argv, the clone URL, the cloned bare
  config at `~/.switchboard/repos/<owner>/<repo>/.bare/config` (which must hold neither a
  credential-helper entry nor a PAT-bearing remote URL, e.g. via
  `git --git-dir …/.bare config --get-regexp '^(credential|remote\..*\.url)'`), and emitted
  **telemetry/logs**; assert the helper supplies the token over the credential protocol; assert
  redaction scrubs GitHub error bodies.
- **API contract** — extend the foundations contract test so the typed client mirrors the new
  clone / list / status routes and their Zod schemas (drift fails the build); 422 on invalid
  input.

**UI (component / Storybook + TanStack Query):**

- Production stories/render tests for the **New repository** screen (source/method toggles,
  Local disabled, Select vs From URL validation, empty/unconfigured state) and the repository
  **getting-ready / error / ready** states, reusing the `prototype-workbench` scheme +
  responsive helpers (mobile + desktop, both colour schemes). Query-wiring tests cover loading
  / error / success against a mocked typed client.

**E2E (Playwright, temp-git fixture + faked GitHub):** the New repository flow → Clone →
getting-ready → repository ready; **abort**; **error** (404/403/rate-limit); and the
**ledger/lock** behaviours (concurrent clone requests, cancellation, recovery after restart).

**Test-harness gap assessment.** The base harness exists (RuntimeContext, temp-git fixture,
Vitest source condition, contract-test pattern, OTel redaction, Playwright). Four **gaps** must
be built first and become the leading **"Test infrastructure"** task group:

1. **Operation ledger + lock** — does not exist (foundations deferred it). It is production
   infra *and* the dependency of every clone test, so it (plus helpers to simulate concurrency
   and a **restart/reconcile**, and a way to **kill a clone mid-flight**) leads the work.
2. **Faked / recorded GitHub REST layer** — no GitHub client or fake exists; a deterministic
   fake (paginated lists, 401/403-rate-limit/404) is needed for both Vitest and Playwright
   (the programme assumes "faked/recorded GitHub" but it is unbuilt). Hand-written deterministic
   fixtures for the MVP; recording deferred.
3. **No-leak assertion harness** — helpers to spawn git under the credential helper and scan
   argv / the bare `.bare/config` / **captured telemetry** for the PAT (extends foundations'
   redaction tests with subprocess + filesystem scanning).
4. **Credential-helper test rig** — a way to exercise the helper's credential-protocol I/O in
   isolation (token from a `600` file, host-scoped, nothing persisted).

## Risks / Trade-offs

- **[Risk] PAT leak** via clone URL, the bare `.bare/config`, argv, env dumps, or logs. →
  _Mitigation:_ credential helper (file-resident, host-scoped, per-invocation `-c`, never
  persisted) + `600` perms + redaction + the dedicated **no-leak subprocess/redaction tests**
  (the verifiable proof the programme requires).
- **[Risk] Path traversal** via From-URL `owner/repo`. → _Mitigation:_ conservative charset +
  traversal rejection in the shared Zod schema; the on-disk destination is derived only from a
  validated id.
- **[Risk] Interrupted clone** leaves a corrupt `.bare` that lists as cloned. → _Mitigation:_
  ledger marks `running`→`failed` on restart, cleans the partial target, and **list-cloned
  ignores targets without a completed marker**; retry starts clean.
- **[Risk] Concurrent clone of the same repo.** → _Mitigation:_ per-`repo-id` lock +
  idempotent ledger return the in-flight operation instead of racing.
- **[Risk] GitHub rate-limit / large accounts.** → _Mitigation:_ follow `Link` with a
  defensive page cap; surface a typed **rate-limited** error (with reset) the UI explains
  rather than a generic failure.
- **[Trade-off] Building the ledger now** (first consumer) risks over-generalising. →
  _Mitigation:_ scope to the clone's needs with a minimal interface; it is programme-mandated
  shared infra, not speculative, and downstream changes extend rather than rebuild it.
- **[Trade-off] Async clone + polling** adds UI/state complexity vs a blocking request. →
  _Mitigation:_ required — clones are long-running and the gate confirmed the "getting ready"
  saga; polling reuses TanStack Query already in the stack.
- **[Risk] Architecture overlay drift** — `Switchboard.Api` gains four concerns. →
  _Mitigation:_ author `Planned/repo-clone-browse.c4` (extend `Switchboard.Api`, additions
  `#todo`, view ids `repo-clone-browse-*`) and `likec4 validate` it; the Architecture review
  checkpoint gates it.

## Migration Plan

- **Config:** replace the reserved `github: z.null()` in `packages/shared/src/config.ts` with
  the GitHub/credential-helper config shape (PAT sourced from `~/.switchboard`, perms `600`).
  Backward-compatible: unset/`null` ⇒ GitHub features disabled with the "not configured" state.
- **Filesystem:** introduce `~/.switchboard/repos/<owner>/<repo>/.bare` and the ledger/lock
  store under `~/.switchboard` (e.g. `~/.switchboard/operations/`). `repos/` is gitignored.
- **API:** additive routes (clone / list-cloned / operation-status / repo-list) wired into the
  Hono app, typed client, and contract test; no breaking changes.
- **Architecture:** author `docs/dev/Architecture/Planned/repo-clone-browse.c4` and validate it
  (`pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture`).
- **Prototype disposition:** `new-repository.stories.tsx` is **consumed/superseded** by this
  change's production screens (ported, not imported — quarantine holds); its `prototypes.md`
  row resolves to `delete — superseded by repo-clone-browse` at archive.

## Open Questions

- **Automatic transient retry** for the clone saga vs **user-initiated retry only.** _Direction:_
  user retry/abort for the MVP; auto-retry-with-backoff deferred (the ledger already records
  enough state to add it later).
- **Faked vs recorded GitHub fixtures.** _Direction:_ hand-written deterministic fake for the
  MVP (resolved in the Test-infrastructure group); recording (e.g. Polly/VCR) deferred.
- **Org/repo listing scope** under a fine-grained PAT (personal repos, org repos, installation
  repos). _Direction:_ list exactly what the PAT can see; document the PAT scope expectation.
- **Whether the operation ledger graduates to its own capability spec** once a second consumer
  (`worktree-management`) lands. _Direction:_ keep its behaviours under `repo-clone` here;
  reconsider extracting an `operations` capability when reuse is concrete.
