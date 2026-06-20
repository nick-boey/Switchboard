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
> keeping the bidirectional plan-page ↔ `plan.md` link honest.

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
  Phone (Tailscale)
   ├── Switchboard Web SPA ──────────► Switchboard API (Hono)
   │     React + Vite + Mantine          │   ├── Git service      → repos/<repo>/.bare + worktrees
   │     mobile-first, retro UI          │   ├── GitHub service   → GitHub REST (PAT)
   │                                     │   └── Session service  → tmux  → claude --remote-control
   │                                     │
   └── Official Claude mobile app ◄──── (remote-control backplane, Claude's servers)
                                          drives the conversation once a session exists

  Launched/orchestrated by:  switchboard CLI (TypeScript)  → local process  OR  Docker + Tailscale
  Observability:             OpenTelemetry (semconv)       → OTLP (Seq sink wired later)
```

- **Web SPA** — React + Vite + Mantine, mobile-first, '50s retro switchboard styling
  (embossed labels, plugs, geometric fonts). Talks to the API via a typed Hono RPC client.
- **API server** — Node + Hono, **Hono RPC + Zod** for end-to-end typed endpoints.
  Orchestrates three host integrations: git, GitHub, tmux.
- **State** — **filesystem + tmux are the source of truth.** Repos and worktrees *are*
  the disk (`repos/`); sessions *are* tmux. A small JSON config in `~/.switchboard`
  holds settings + the GitHub PAT. **No database in the MVP.**
- **CLI** — a thin TypeScript `switchboard` package that owns lifecycle/orchestration
  (config bootstrap, spawn + supervise the server, and `--docker` mode), distributed via
  **npm** (`npx switchboard` / `npm i -g`). It is *not* the server; it imports the
  server's programmatic `start()`.
- **Runtime** — local process, or a Docker container that brings up Tailscale and serves
  the SPA on the tailnet. Container-per-user is the multi-user path later.
- **Observability** — OpenTelemetry (semconv) instrumentation in the API from day one;
  the Seq sink is wired later (OTLP export behind a config toggle, off by default).

### Repo layout (pnpm workspaces monorepo)

```
apps/web/        # React + Vite + Mantine + Storybook (the SPA + component workbench)
apps/server/     # Hono API; git / github / tmux services; programmatic start()
apps/cli/        # TypeScript `switchboard` CLI (lifecycle, Docker, Tailscale)
packages/shared/ # Zod schemas + shared types; Hono RPC client types
site/            # Astro dev site + LikeC4 architecture model (likec4 validate)
docs/            # plans, dev/Architecture, user docs
repos/           # gitignored — bare clones + worktrees at runtime
```

`just` is the task runner across all of it.

### Git on-disk layout (decided)

```
repos/<repo>/.bare           # the bare clone (no working tree)
repos/<repo>/<branch-name>/  # one directory per worktree
```

The bare repository lives at `repos/<repo>/.bare`; **there is no default `main`
worktree** — every worktree, including one for the default branch if wanted, is created
explicitly and lives at `repos/<repo>/<branch-name>`. This makes worktrees uniform (no
"is `main` special?" branching) and avoids the contradiction of a "bare clone named
`main`".

## Change roadmap

Each change is sequenced; ordering constraints are recorded in each change's
`dependencies.md` (never in prose in `tasks.md`).

| # | Change | Schema | Purpose |
|---|--------|--------|---------|
| 1 | `foundations` | switch-feature | Monorepo, TS, web shell + Mantine + retro design tokens, Storybook, Hono skeleton + RPC wiring, Vitest, Playwright E2E harness (temp-git fixture), Just, OTel instrumentation, `site/` + LikeC4, `shared` package. **Builds the test harness everything else needs.** |
| 2 | `ui-prototypes-mvp` | switch-feature-ui | Lightweight **upfront** prototypes (hybrid strategy): the design language + core screens (repo browser/clone, worktree list/create, session list/launch), desktop + mobile. Confirms user stories before backend work. |
| 3 | `repo-clone-browse` | switch-feature | List GitHub repos/orgs (PAT) + bare clone → `repos/<repo>/.bare` + list cloned repos. |
| 4 | `worktree-management` | switch-feature | Create worktree + branch → `repos/<repo>/<branch>`; handle "branch exists on remote" vs "new branch". |
| 5 | `claude-session-launch` | switch-feature | Launch `claude --remote-control` detached in tmux; list/track sessions by naming convention. |
| 6 | `runtime-cli-docker` | switch-feature | TypeScript `switchboard` CLI, `~/.switchboard` config, Docker image, Tailscale bring-up. Includes the **Tailscale-in-Docker spike** (see Risks). |

**Dependencies**

- All changes depend on `foundations`.
- `ui-prototypes-mvp` after `foundations` (Storybook must exist before we prototype).
- `repo-clone-browse` → `worktree-management` → `claude-session-launch` (each needs the
  previous artifact present on disk: a clone before a worktree, a worktree before a session).
- `runtime-cli-docker` ties the deployment story together at the end (depends on `foundations`;
  practically sequenced after the feature changes so there is a working app to ship).
- Feature changes 3–5 **refine their slice of the upfront prototypes** from
  `ui-prototypes-mvp` (a soft link coordinated here, not a hard `depends-on`).

**Prototyping strategy (hybrid):** one lightweight upfront prototype change establishes
the design language + core screens and confirms user stories; feature changes then
refine/extend their own prototypes as spikes/implementation reveal backend realities.

## Cross-cutting decisions (locked)

These hold across all changes. Changing one is a programme-level decision and is edited
here.

| Area | Decision | Rationale |
|------|----------|-----------|
| API layer | **Hono RPC + Zod** | End-to-end types with minimal boilerplate; native to the chosen backend; Zod is the single schema source. |
| Client server-state | **TanStack Query** | Standard for a client–server SPA; pairs cleanly with Mantine. |
| UI | **Mantine** + '50s retro switchboard theme | Per brief; theme tokens established in `foundations`. |
| Persistence | **Filesystem + tmux as source of truth + `~/.switchboard` JSON config** | Repos/worktrees *are* the disk; sessions *are* tmux. Minimal sync logic; no DB to drift. |
| GitHub auth | **PAT** (fine-grained) behind an OAuth-ready provider interface | Simplest for a single trusted user; OAuth slots in for multi-user later. |
| Token handling | Git **credential helper** reading from `~/.switchboard`; never embed PAT in clone URLs / `.git/config`; file perms `600`; never logged | Avoids writing the token into every clone; cheap to do right, painful to retrofit. |
| Runtime | **Single-user MVP; container-per-user** for multi-user later | Strongest isolation + simplest per-user Tailscale identity + permission story. |
| CLI | **TypeScript**, thin `apps/cli` package, **npm** distribution | Single language across the stack; clean separation from the server; `npx switchboard`. |
| Build/tooling | **pnpm workspaces**, **Just** task runner | Multi-package monorepo (web/server/cli/shared) earns workspaces; Just per brief. |
| Observability | **OpenTelemetry (semconv)** instrumented now; **Seq deferred** (OTLP export behind a config toggle, off by default) | Get instrumentation in early without standing up Seq as a hard MVP dependency. |
| Session metadata | Switchboard tracks **session existence + worktree mapping only** (via tmux session-naming convention, e.g. `sb-<repo>-<branch>`). Conversation metadata (model, context usage, last message) is the **mobile app's** job. | Keeps "tmux as source of truth" viable; richer metadata would need a store and is explicitly out of scope. |

## Testing strategy

TDD is mandatory across the programme.

- **Vitest** — unit/service tests (git/github/tmux services with fakes).
- **Playwright** — E2E driving the real web UI against a running server, using **git in
  a temporary folder** (per brief), a faked/recorded GitHub, and a stub for the
  tmux/claude launch.
- **Storybook** — component + prototype work. Prototype stories live under
  `src/prototypes/<change-name>/`, use `definePrototypeMeta`, and are **quarantined**
  from visual-regression snapshots, the unit run, autodocs, the published API, and
  production imports.

`foundations` stands this harness up first (its "Test infrastructure" task group).

## Security posture & accepted risks (MVP)

- **Tailscale is the only auth boundary in the MVP.** The API is effectively a
  remote-code-execution surface (it launches processes, clones arbitrary repos, runs
  git). For a single trusted user on a private tailnet this is an **accepted risk**.
  Guardrails baked into `foundations`: bind the server to localhost / the tailnet
  interface (never `0.0.0.0` publicly), and keep `tailscale serve` **private** (no Funnel).
- App-level authentication/authorization is deferred to the future multi-user change.

## Risks / deferred items

- **[Risk] Tailscale-in-Docker** — `tailscaled` in a container needs `/dev/net/tun` +
  `--cap-add NET_ADMIN` or userspace-networking mode; serving the SPA cleanly likely
  wants `tailscale serve`. **Highest residual technical risk.** Mitigation: a spike
  inside (or just before) `runtime-cli-docker`. **Deferred — run the spike later**
  (user decision); not gating earlier changes.
- **[Risk] Branch/worktree edge cases** — base for new branches, remote-tracking setup,
  name collisions, dirty states. Mitigation: strong E2E coverage in `worktree-management`.
- **Claude `--remote-control` auth spike: skipped.** Remote control rides the host's
  existing `claude` login; once `claude` is authenticated on the host (out-of-band; in
  Docker, persist/mount the credentials), launching it detached "just works" and there
  is no per-session pairing UI to build.

## Future features (architecture must not preclude)

Multi-user (container-per-user); worktrees from GitHub issues + linked PRs; delete
worktrees/branches; git status + commands; file viewing (VS Code on desktop, read on
mobile); session info (model/context/last-message — mobile app's domain today); stream
tmux output to a browser terminal.
