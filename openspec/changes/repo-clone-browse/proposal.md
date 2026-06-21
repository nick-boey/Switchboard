## Why

Switchboard needs a repository on the host before it can create worktrees or launch
sessions. This change lets the user browse their GitHub repos/orgs and bare-clone a chosen
one to disk — the first link in the feature chain.

## What Changes

- Add a **GitHub service** that lists the authenticated user's repositories and
  organizations via the GitHub REST API, using a fine-grained **PAT** behind an
  OAuth-ready provider interface.
- Add a **Git service** that performs a **bare clone** of a chosen repo into
  `repos/<repo-id>/.bare`, and lists already-cloned repos from disk.
- Run the clone through the **operation ledger + lock** (idempotency, serialization,
  cancellation, restart recovery).
- Supply the PAT to git via a **credential helper** from `~/.switchboard`; prove with
  subprocess + redaction tests that the PAT never appears in args, remotes, `.git/config`,
  or logs/telemetry.
- Refine the repo-browser / clone slice of the `ui-prototypes-mvp` prototypes into real UI.

## Capabilities

### New Capabilities

- `github-repos`: list the authenticated user's repositories and organizations via
  PAT-authenticated GitHub REST.
- `repo-clone`: bare-clone a chosen repo to `repos/<repo-id>/.bare`, list cloned repos, with
  the operation ledger/lock and credential-helper token handling.

### Modified Capabilities

<!-- Confirmed at full planning. The PAT/subprocess-redaction guarantees may extend the
     existing `observability` redaction requirement rather than adding a capability. -->
- (none expected — to be confirmed at full planning)

## Impact

- `apps/server`: GitHub + Git services, clone route + handler, operation ledger/lock,
  credential helper.
- `packages/shared`: Zod schemas for the repo list and clone request/response.
- `apps/web`: repo browser + clone UI (refining `ui-prototypes-mvp` prototypes).
- Architecture: realizes base-model `Switchboard.Api -> GitHub`; adds
  `docs/dev/Architecture/Planned/repo-clone-browse.c4` (authored at full planning).
- Filesystem: `repos/<repo-id>/.bare`; `~/.switchboard` credential-helper config.
