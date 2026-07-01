# Switchboard

Switchboard is a self-hosted, mobile-first web app for **starting** Claude Code sessions
from your phone. The official Claude mobile app can remote-control an existing session but
cannot create one; Switchboard fills that gap. Reachable over a private Tailscale tailnet,
it lets a single user browse their GitHub repositories, clone them, create git worktrees,
and launch `claude --remote-control` in a detached `tmux` session — then hand the
conversation off to the official app. It is a conventional client–server SPA with the
host's filesystem and `tmux` as the source of truth.

For the full programme vision and target architecture, see
[`docs/plans/switchboard/mvp.md`](docs/plans/switchboard/mvp.md).

## Status

Early foundations. This repository contains the **monorepo skeleton** plus the implemented
**runtime/security spine** — the buildable, testable, prototypable base layer that every
feature change builds on. There are no feature screens yet; what exists is a thin end-to-end
slice from the CLI through the server to the web shell. Concretely:

- `apps/server` builds a Hono app from a `RuntimeContext` and exposes
  `start(ctx): Promise<ServerHandle>`, which binds a loopback-only (`127.0.0.1`) server. It
  serves an unauthenticated `GET /health` plus one placeholder `POST /api/echo` route behind a
  reject-by-default auth gate (the bearer token path is always available; a Tailscale serve
  identity is trusted only when explicitly enabled) and OpenTelemetry instrumentation that
  redacts secrets before export (exporter `none` by default).
- `apps/cli` is the `switchboard` thin shell: `switchboard --version` prints the version and
  `switchboard start` runs `loadConfig()`, builds a `RuntimeContext`, and boots the local
  loopback server whose `/health` responds. No Docker / Tailscale orchestration yet — that
  is a later change.
- `apps/web` is a mobile-first Mantine app shell on the '50s retro switchboard theme tokens
  (with a couple of embossed-panel / jack primitives), wired through TanStack Query and the
  typed `hc` client. It renders one placeholder "line status" panel that round-trips the
  server's placeholder route; real feature screens land in later changes.
- `packages/shared` owns the Zod `config` schema + `loadConfig()`, the generic typed API
  client factory, the `RuntimeContext` types, and the `@switchboard/shared/testing` harness
  helpers (`makeTestContext`, `createTempGitRepo`).

The build, lint, type-check, unit-test, and e2e harness is real and green today, so feature
work can proceed test-first. See
[`docs/dev/Contributing/testing.md`](docs/dev/Contributing/testing.md) for the harness
conventions.

## Prerequisites

| Tool                                  | Version    | Notes                                                                                             |
| ------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org)         | **>= 26**  | enforced by `engines` in the root `package.json`                                                  |
| [pnpm](https://pnpm.io)               | **>= 11**  | the package manager (pinned to `pnpm@11.4.0` via `packageManager`); enable with `corepack enable` |
| [just](https://github.com/casey/just) | any recent | the task runner; wraps the per-package scripts                                                    |
| [git](https://git-scm.com)            | any recent | required by the temp-git test fixture and by Switchboard itself                                   |

For end-to-end tests you also need the Playwright Chromium browser:

```sh
pnpm exec playwright install chromium
```

## Workspace layout

A pnpm-workspaces monorepo with TypeScript project references. `just` orchestrates the
per-package scripts.

| Path              | Package               | Role                                                                                      | Built with           |
| ----------------- | --------------------- | ----------------------------------------------------------------------------------------- | -------------------- |
| `apps/web`        | `@switchboard/web`    | React + Vite + Mantine SPA, Storybook component workbench                                 | Vite                 |
| `apps/server`     | `@switchboard/server` | Hono API runtime — `start(ctx)`, health endpoint, auth gate, observability                | `tsc`                |
| `apps/cli`        | `switchboard`         | thin TypeScript `switchboard` shell that boots a local server                             | `tsup` (bundled bin) |
| `packages/shared` | `@switchboard/shared` | shared Zod schemas, `RuntimeContext` types, and the `@switchboard/shared/testing` helpers | `tsc`                |
| `site`            | `@switchboard/site`   | Astro + LikeC4 — renders the architecture model under `docs/dev/Architecture`             | Astro                |

Workspace membership is declared in [`pnpm-workspace.yaml`](pnpm-workspace.yaml); the
TypeScript project graph is the solution-style [`tsconfig.json`](tsconfig.json) referencing
each buildable package (`site` is an Astro project, validated separately).

## Getting started

```sh
# 1. Install workspace dependencies.
just install

# 2. Build every package (tsc for shared/server, tsup for the cli bin, Vite for web).
just build

# 3. Check it: lint, type-check, unit tests.
just lint
just typecheck
just test

# 4. End-to-end tests (Playwright). Build first — e2e resolves the built packages.
just build
just e2e
```

Run `just` with no arguments to list every recipe.

## `just` recipes

| Recipe           | What it does                                                     |
| ---------------- | ---------------------------------------------------------------- |
| `just install`   | install all workspace dependencies (`pnpm install`)              |
| `just build`     | build every package (`pnpm -r build`)                            |
| `just lint`      | ESLint (flat config) + Prettier format check                     |
| `just typecheck` | type-check every TS project via references (`tsc -b`)            |
| `just test`      | run the Vitest unit suite (`vitest run`) — no prior build needed |
| `just e2e`       | run the Playwright e2e suite — assumes `just build` has run      |

The same commands are available as root `package.json` scripts (`pnpm build`, `pnpm test`,
etc.) if you prefer to invoke pnpm directly. Unit tests resolve workspace packages to their
TypeScript source (via the `switchboard-source` export condition), so `just test` does not
require a prior `just build`; Playwright resolves the built `dist`, so `just e2e` does.

## Running Switchboard

Switchboard is distributed on **npm** as the `switchboard` bin. `switchboard start` bootstraps
`~/.switchboard/config.json` (a freshly generated bearer token and secure `600` permissions on
first run), builds a `RuntimeContext`, and supervises the server's `start(ctx)` for a loopback-bound
local run:

```sh
npx switchboard start        # one-off
# or: npm i -g switchboard && switchboard start
switchboard --version
```

A local `start` binds `127.0.0.1` only and is **bearer-only** — it serves an unauthenticated
`GET /health` plus the placeholder `POST /api/echo` route behind the reject-by-default auth gate
(authenticate with the bearer token from `~/.switchboard/config.json`):

```sh
curl http://127.0.0.1:PORT/health    # -> {"status":"ok"} (substitute the printed port)
```

To **run on the tailnet (Docker)** — the image **bundles and serves the web UI** and brings up
userspace Tailscale, exposing the app via `tailscale serve` over a dedicated, non-host-published
loopback serve port, with named volumes and mounted secrets. Open
`https://switchboard.<your-tailnet>.ts.net/` on your phone to use it (no separate web host; the
served SPA is authorised tokenlessly by your Tailscale identity). See
**[`docs/user/running-switchboard.md`](docs/user/running-switchboard.md)**.

From a workspace checkout you can also run the bin straight from the build output:

```sh
just build
node apps/cli/dist/index.js start    # boot the loopback server; prints its 127.0.0.1 URL
```

The web app (`apps/web`) is a themed mobile-first shell with a single placeholder route — real
feature screens land in later changes.

## Documentation

- [`docs/user/running-switchboard.md`](docs/user/running-switchboard.md) — running locally and the
  Docker run on the tailnet (volumes, mounted secrets, Tailscale prerequisites, access model).
- [`docs/dev/Contributing/testing.md`](docs/dev/Contributing/testing.md) — the
  Vitest / Playwright / Storybook harness conventions.
- [`docs/dev/Architecture`](docs/dev/Architecture) — the LikeC4 architecture model
  (rendered by `site`).
- [`docs/plans/switchboard/mvp.md`](docs/plans/switchboard/mvp.md) — the MVP programme page.
