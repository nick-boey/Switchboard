---
title: "Plan: Switchboard MVP"
openspec-changes:
  - foundations
---

# Plan: Switchboard MVP

> Programme page coordinating the Switchboard MVP. It is the **arbiter of
> consistency** across the changes below: any decision that affects more than one
> change is recorded here, not in a single change's artifacts.
>
> `openspec-changes` (frontmatter) lists changes **as they are created**. Only
> `foundations` exists today; the remaining changes are roadmapped in
> [Change roadmap](#change-roadmap) and added to the frontmatter as each is created,
> keeping the bidirectional plan-page ↔ `plan.md` link honest. (The runtime spike is a
> throwaway investigation, not an OpenSpec change — see the roadmap.)

## Problem

The official Claude mobile app supports remote-controlling an existing Claude Code
session, but cannot **start** sessions — let alone create the worktree a session needs.
The user wants to start new Claude Code sessions (remote-control enabled) in new or
existing git worktrees from their phone, then hand off to the official app to drive the
conversation.

Switchboard is a self-hosted web app, reachable over a private Tailscale tailnet and
designed mobile-first, that lets the user: browse their GitHub repositories, clone them,
create worktrees, and launch `claude --remote-control` in a detached `tmux` session.
Conversation management stays in the official mobile app.

## Target architecture

A conventional client–server SPA, **single-user for the MVP**, with the host's
filesystem and `tmux` as the source of truth.

```
  Phone (on the tailnet)
   │
   ├── tailscale serve ──► Switchboard API (Hono, bound to loopback)
   │     injects identity      │  Auth gate: trust Tailscale-User-Login (allowlist),
   │     headers               │             bearer-token fallback for direct/local access
   │                           │  ├── Git service      → repos/<id>/.bare + worktrees
   │   Switchboard Web SPA ────┤  ├── GitHub service   → GitHub REST (PAT via cred helper)
   │     React + Vite +        │  └── Session service  → tmux → claude --remote-control
   │     Mantine, retro UI     │  Long-running ops (clone/worktree/launch) go through a
   │                           │  filesystem operation ledger + lock under ~/.switchboard.
   │
   └── Official Claude mobile app ◄── (remote-control backplane, Claude's servers)
                                       drives the conversation once a session exists

  Launched/orchestrated by:  switchboard CLI (TypeScript)  → local process  OR  Docker + Tailscale
  Observability:             OpenTelemetry (semconv, with redaction) → OTLP (Seq sink wired later)
```

- **Web SPA** — React + Vite + Mantine, mobile-first, '50s retro switchboard styling
  (embossed labels, plugs, geometric fonts). Talks to the API via a typed Hono RPC client.
- **API server** — Node + Hono, **Hono RPC + Zod** for end-to-end typed endpoints.
  Orchestrates three host integrations: git, GitHub, tmux. **Bound to loopback**; fronted
  by `tailscale serve`. All mutations validate input with Zod and pass an auth gate.
- **Auth gate** — behind `tailscale serve`, trust the injected `Tailscale-User-Login`
  identity against an allowlist (passwordless); a **bearer token** from `~/.switchboard`
  is required for direct/loopback/local access. The server only trusts identity headers
  when the request arrived via `serve` (enforced by the loopback bind). Strict
  origin/CORS policy. This is *not* multi-user auth — it closes the zero-auth hole.
- **State** — **filesystem + tmux are the source of truth.** Repos and worktrees *are*
  the disk (`repos/`); sessions *are* tmux. A small JSON config in `~/.switchboard` holds
  settings + the GitHub PAT. **No database in the MVP** — but long-running operations use
  a **filesystem-backed operation ledger + lock** (see decisions) for idempotency,
  serialization, cancellation, and recovery after restart.
- **RuntimeContext** — services receive a `RuntimeContext` (workspace root, config,
  logger, telemetry, identity) rather than reaching for host-global paths directly. Even
  with one user, this keeps the container-per-user multi-user path clean.
- **CLI** — a thin TypeScript `switchboard` package that owns lifecycle/orchestration
  (config bootstrap, spawn + supervise the server, and `--docker` mode), distributed via
  **npm** (`npx switchboard` / `npm i -g`). It is *not* the server; it imports the
  server's programmatic `start(ctx)`.
- **Runtime** — local process, or a Docker container that brings up Tailscale and serves
  the SPA on the tailnet. Container-per-user is the multi-user path later.
- **Observability** — OpenTelemetry (semconv) instrumentation in the API from day one,
  with a **redaction policy** (no PATs, clone URLs, branch names, local paths, command
  args, or GitHub errors leaked); the Seq sink is wired later (OTLP export behind a
  config toggle, off by default).

### Repo layout (pnpm workspaces monorepo)

```
apps/web/        # React + Vite + Mantine + Storybook (the SPA + component workbench)
apps/server/     # Hono API; git / github / tmux services; programmatic start(ctx)
apps/cli/        # TypeScript `switchboard` CLI (lifecycle, Docker, Tailscale)
packages/shared/ # Zod schemas + shared types; Hono RPC client types
site/            # Astro dev site + LikeC4 architecture model (likec4 validate)
docs/            # plans, dev/Architecture, dev/spikes, user docs
repos/           # gitignored — bare clones + worktrees at runtime
```

`just` is the task runner across all of it.

### Git on-disk layout & canonical IDs (decided)

```
repos/<repo-id>/.bare              # the bare clone (no working tree)
repos/<repo-id>/worktrees/<wt-id>/ # one directory per worktree
```

- The bare repository lives at `repos/<repo-id>/.bare`; **there is no default `main`
  worktree** — every worktree is created explicitly. This makes worktrees uniform and
  avoids the contradiction of a "bare clone named `main`".
- **Canonical IDs (direction — full design in `worktree-management`):** `<repo-id>` is
  namespaced by **owner/repo** (forks of the same name don't collide). Branch and
  worktree directory names are **path-safe**: branch names containing `/` (e.g.
  `feature/foo`), traversal segments (`../x`), spaces, Unicode, reserved names, or
  excessive length are **encoded or hashed** for the on-disk `<wt-id>` and the tmux
  session name; the human-readable branch name is stored/displayed separately. tmux
  session names use the same path-safe scheme (no raw `sb-<repo>-<branch>`). The mapping
  (id ↔ owner/repo/branch) is part of the worktree/session model. Tested against forks
  and adversarial branch names.

## Change roadmap

Sequenced. Ordering constraints are recorded in each change's `dependencies.md` (never as
prose in `tasks.md`).

| # | Change | Schema | Purpose |
|---|--------|--------|---------|
| **0** | **runtime spike** *(throwaway investigation — not an OpenSpec change)* | — | Prove the riskiest runtime assumptions **before** `foundations` bakes them in: Tailscale-in-Docker (`serve`, bind), the **Tailscale-identity-header auth path** behind `serve`, config-volume persistence, **Claude credential persistence** in a container, and process/tmux supervision. Output: a findings note under `docs/dev/spikes/`; throwaway code lives outside the monorepo. Go/no-go on the assumptions feeds `foundations` design. |
| 1 | `foundations` | switch-feature | Monorepo, TS, web shell + Mantine + retro design tokens, Storybook, Hono skeleton + RPC wiring, **auth gate + loopback bind + CORS + bind-address tests**, **RuntimeContext** abstraction, Vitest, Playwright E2E harness (temp-git fixture), Just, OTel instrumentation + redaction policy, `site/` + LikeC4, `shared` package. **Builds the test harness everything else needs.** |
| 2 | `ui-prototypes-mvp` | switch-feature-ui | Lightweight **upfront** prototypes (hybrid strategy): the design language + core screens (repo browser/clone, worktree list/create, session list/launch), desktop + mobile. **Confirmation gate** for user stories before backend work. |
| 3 | `repo-clone-browse` | switch-feature | List GitHub repos/orgs (PAT) + bare clone → `repos/<repo-id>/.bare` + list cloned repos. |
| 4 | `worktree-management` | switch-feature | Create worktree + branch → `repos/<repo-id>/worktrees/<wt-id>`; canonical ID scheme; "branch exists on remote" vs "new branch". |
| 5 | `claude-session-launch` | switch-feature | Launch `claude --remote-control` detached in tmux; list/track sessions via the path-safe naming scheme. |
| 6 | `runtime-cli-docker` | switch-feature | TypeScript `switchboard` CLI, `~/.switchboard` config, Docker image, Tailscale bring-up — **productionizing the spike-0 findings**. |

**Dependencies**

- **Spike 0 runs first** — a prerequisite investigation. Its findings inform `foundations`
  design (auth/bind, config volume, Claude creds, supervision) and `runtime-cli-docker`.
  Because it is not an OpenSpec change, it is sequenced here, not via `depends-on`.
- All changes depend on `foundations`.
- `ui-prototypes-mvp` after `foundations` (Storybook must exist before we prototype).
- **`repo-clone-browse` hard-depends on `ui-prototypes-mvp`** — prototypes are a real
  user-story confirmation gate, so backend work cannot start until they are confirmed.
- `repo-clone-browse` → `worktree-management` → `claude-session-launch` (each needs the
  previous artifact present on disk: a clone before a worktree, a worktree before a session).
- `runtime-cli-docker` ties the deployment story together at the end (depends on `foundations`;
  practically sequenced after the feature changes so there is a working app to ship).
- Feature changes 3–5 **refine their slice of the upfront prototypes** from
  `ui-prototypes-mvp`.

**Prototyping strategy (hybrid):** one lightweight upfront prototype change establishes
the design language + core screens and confirms user stories (a gate); feature changes
then refine/extend their own prototypes as the spike/implementation reveal backend realities.

## Cross-cutting decisions (locked)

These hold across all changes. Changing one is a programme-level decision and is edited
here.

| Area | Decision | Rationale |
|------|----------|-----------|
| API layer | **Hono RPC + Zod**; runtime validation on all mutation inputs; **API contract tests** to catch web↔server schema drift | End-to-end types with minimal boilerplate; Zod is the single schema source; contract tests stop the workspace boundary from silently coupling/drifting. |
| Client server-state | **TanStack Query** | Standard for a client–server SPA; pairs cleanly with Mantine. |
| UI | **Mantine** + '50s retro switchboard theme | Per brief; theme tokens established in `foundations`. |
| Auth | **Tailscale identity (`Tailscale-User-Login`, allowlist) behind `tailscale serve` + bearer-token fallback**; loopback bind; `/health` exempt; strict CORS. Identity trust is config-gated (`trustServeIdentity`, default **off**) — the real boundary is **serve-exclusive ingress (network isolation)**, not the headers (markers select a path, they don't prove identity). A Unix-domain-socket serve ingress is the deferred hardening (`runtime-cli-docker`). | Closes the zero-auth hole cheaply, passwordless on mobile, and the identity is exactly what container-per-user multi-user keys off. **Validated in spike 0.** |
| Persistence | **Filesystem + tmux as source of truth + `~/.switchboard` JSON config**, plus a **filesystem-backed operation ledger + lock** for long-running ops (clone/worktree/launch): idempotency, serialization, cancellation, stale-lock recovery after restart | Repos/worktrees *are* the disk; sessions *are* tmux. No DB to drift — but raw disk/tmux truth is insufficient for in-flight operations, so the ledger/lock fills that gap. |
| Runtime context | Services take a **`RuntimeContext`** (workspace root, config, logger, telemetry, identity); no host-global paths hardcoded into service APIs | Preserves a clean container-per-user multi-user path even though MVP is single-user. |
| GitHub auth | **PAT** (fine-grained) behind an OAuth-ready provider interface | Simplest for a single trusted user; OAuth/keychain slots in later. |
| Token handling | Git **credential helper** reading from `~/.switchboard`; never embed PAT in clone URLs / `.git/config` / process args / logs; file perms `600`; redaction + subprocess tests prove no leak; container secret mounting for the Docker path | Avoids writing the token into every clone; the subprocess/redaction tests are what make "no leak" verifiable rather than aspirational. |
| Runtime | **Single-user MVP; container-per-user** for multi-user later | Strongest isolation + simplest per-user Tailscale identity + permission story. |
| CLI | **TypeScript**, thin `apps/cli` package, **npm** distribution; imports server `start(ctx)`; packaged-CLI smoke test | Single language across the stack; clean separation from the server; tests the shipped path, not just dev imports. |
| Build/tooling | **pnpm workspaces**, **Just** task runner | Multi-package monorepo (web/server/cli/shared) earns workspaces; Just per brief. |
| Observability | **OpenTelemetry (semconv)** instrumented now with a **redaction policy** (allow/block attribute list); **Seq deferred** (OTLP export behind a config toggle, off by default) | Get instrumentation in early without standing up Seq as a hard MVP dependency — and without leaking secrets/paths into telemetry. |
| Session metadata | Switchboard tracks **session existence + worktree mapping only** (path-safe tmux session naming). Conversation metadata (model, context usage, last message) is the **mobile app's** job. | Keeps "tmux as source of truth" viable; richer metadata would need a store and is explicitly out of scope. |

## Testing strategy

TDD is mandatory across the programme.

- **Vitest** — unit/service tests (git/github/tmux services with fakes); **API contract
  tests**; **auth/bind-address tests** (loopback-only, `trustServeIdentity`-gated identity
  trust, bearer fallback, `/health` exempt); **telemetry-redaction tests** (in
  `foundations`). Subprocess/PAT-redaction tests (no PAT in args / remotes / logs) live in
  **`repo-clone-browse`**, where subprocesses and the PAT exist.
- **Playwright** — E2E driving the real web UI against a running server, using **git in
  a temporary folder** (per brief), a faked/recorded GitHub, and a stub for the
  tmux/claude launch. Covers the **operation ledger/lock** behaviour (concurrent
  requests, cancellation, recovery).
- **Storybook** — component + prototype work. Prototype stories live under
  `apps/web/src/prototypes/<change-name>/`, use `definePrototypeMeta`, and are
  **quarantined** from visual-regression snapshots, the unit run, autodocs, the published
  API, and production imports.

`foundations` stands this harness up first (its "Test infrastructure" task group).

## Security posture & accepted risks (MVP)

- **Two boundaries, not one.** Network: a private Tailscale tailnet (no Funnel, server
  bound to **loopback** behind `tailscale serve`). Application: the **auth gate** (bearer
  always; Tailscale identity when `trustServeIdentity` is enabled under a serve-exclusive
  deployment) on every endpoint **except the `/health` liveness probe**, since the API is
  effectively a remote-code-execution surface (it launches processes, clones repos, runs
  git). The earlier "Tailscale is the only boundary" stance was tightened after review —
  we do **not** ship zero app auth. The identity boundary is network isolation
  (serve-exclusive ingress); a Unix-domain-socket serve ingress is the deferred hardening
  in `runtime-cli-docker`.
- Multi-user authorization (per-user repo isolation) is deferred to the future
  container-per-user change; the `RuntimeContext` abstraction keeps that path open.

## Risks / deferred items

- **[Risk → spike 0] Tailscale-in-Docker + runtime assumptions.** `tailscaled` in a
  container needs `/dev/net/tun` + `--cap-add NET_ADMIN` or userspace mode; serving the
  SPA wants `tailscale serve`; the identity-header auth path, config-volume persistence,
  Claude credential persistence, and process/tmux supervision all need proving. **No
  longer deferred — this is spike 0, run first**, before `foundations` bakes in the
  server/bind/config/auth shape.
- **[Risk] Branch/worktree/session identity** — collisions across owners/forks, `/` in
  branch names, traversal, Unicode, length. Mitigation: the canonical path-safe ID scheme
  (above), fully designed and E2E-tested in `worktree-management`.
- **[Risk] Long-running operation state** — partial failures, concurrency, recovery.
  Mitigation: the filesystem operation ledger + lock, designed in the owning changes and
  E2E-tested.
- **Claude `--remote-control` auth spike: skipped.** Remote control rides the host's
  existing `claude` login; once `claude` is authenticated on the host (out-of-band; in
  Docker, persist/mount the credentials — proven in spike 0), launching it detached
  "just works" and there is no per-session pairing UI to build.

## Future features (architecture must not preclude)

Multi-user (container-per-user); worktrees from GitHub issues + linked PRs; delete
worktrees/branches; git status + commands; file viewing (VS Code on desktop, read on
mobile); session info (model/context/last-message — mobile app's domain today); stream
tmux output to a browser terminal.
