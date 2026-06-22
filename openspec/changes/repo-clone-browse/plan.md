# Plan: repo-clone-browse

> **Roadmap scaffold.** This plan records the agreed shape from the programme page so the
> change and its dependency edges are visible up front. The full planning interview
> (`/switch-plan`) runs when this change is routed to — after `ui-prototypes-mvp` confirms
> the user stories. The decisions below are inherited from the programme page; the
> change-specific decisions, open questions, and the LikeC4 overlay are authored then.

## Problem

List the user's GitHub repositories and organizations, then clone a chosen repo to the host
so worktrees and sessions have something to operate on. Without browse + clone there is no
repo on disk, and nothing downstream in the MVP can run.

## Architecture summary

Adds two host integrations to the `Switchboard.Api` container: a **GitHub service** (GitHub
REST via a fine-grained PAT behind an OAuth-ready provider interface) and a **Git service**
that performs a **bare clone** into `~/.switchboard/repos/<owner>/<repo>/.bare` and lists already-cloned repos
from disk. This realizes the base model's `#planned` `Switchboard.Api -> GitHub`
relationship. The clone is a long-running operation, so it runs through the filesystem
**operation ledger + lock** under `~/.switchboard` (idempotency, serialization,
cancellation, restart recovery). The PAT reaches git only via a **credential helper**
reading from `~/.switchboard` — never embedded in clone URLs, `.git/config`, process args,
or logs. Canonical `<repo-id>` is namespaced by **owner/repo** so forks of the same name
do not collide.

## Plan page

[docs/plans/switchboard/mvp.md](../../../docs/plans/switchboard/mvp.md) — the programme page
drives this change (listed in its `openspec-changes` frontmatter) and is the arbiter for any
decision that affects more than one change.

## Planned architecture

**Architectural impact: yes.** Realizes the base model's `#planned`
`Switchboard.Api -> GitHub` relationship and introduces the GitHub + Git service concepts
inside `Switchboard.Api`. The LikeC4 overlay
`docs/dev/Architecture/Planned/repo-clone-browse.c4` (extending `Switchboard.Api`, view ids
prefixed `repo-clone-browse-*`) is **authored during this change's full planning stage** —
deferred here because this is a roadmap scaffold, not the planning interview. The
Architecture review checkpoint fires when that overlay lands.

## Decisions

Inherited from the programme page's locked cross-cutting decisions: GitHub **PAT** behind an
OAuth-ready provider interface; git **credential-helper** token handling with subprocess +
redaction tests proving no leak; bare-clone on-disk layout `~/.switchboard/repos/<owner>/<repo>/.bare`;
**owner/repo-namespaced `<repo-id>`**; **operation ledger + lock** for the clone.
Change-specific decisions are recorded at full-planning time.

## Open questions

Deferred to the full planning interview — e.g. repo/org pagination + GitHub rate-limit
handling, re-clone / fetch-update semantics for an already-cloned repo, and partial-clone
recovery after an interrupted clone. Listed here as a placeholder so they are not lost.
