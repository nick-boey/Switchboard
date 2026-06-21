# Plan: foundations

<!-- Created during the planning interview (/switch-plan). The durable record of why this
     change exists and what architectural shape was agreed. -->

## Problem

Switchboard is greenfield — the repo holds only OpenSpec scaffolding. Before any feature
can be built test-first, the programme needs a working monorepo, application skeletons,
the '50s retro design system, the architecture model, and — critically — the **test
harness** (Vitest + Playwright with a temp-git fixture) that every later change's TDD
depends on. `foundations` is that base layer: it makes the repo buildable, testable, and
prototypable, and nothing else.

## Architecture summary

`foundations` scaffolds the **target architecture's skeleton** described in the
programme page, with no feature behaviour yet:

- A **pnpm workspaces** monorepo: `apps/web` (React + Vite + Mantine + Storybook),
  `apps/server` (Hono, exposing a programmatic `start()`), `apps/cli` (thin TypeScript
  `switchboard` shell), `packages/shared` (Zod schemas + Hono RPC client types), and
  `site/` (Astro + LikeC4). `just` orchestrates tasks.
- The **web shell**: Mantine provider + the retro switchboard theme tokens (embossed
  labels, plugs, geometric fonts), a mobile-first app layout, and a placeholder route —
  enough to host prototypes and real screens, not the screens themselves.
- The **API skeleton**: a Hono app with **Hono RPC + Zod** wiring and a health endpoint,
  exposing a programmatic `start(ctx)` that takes a **`RuntimeContext`** (workspace root,
  config, logger, telemetry, identity) rather than reaching for host-global paths; the
  typed `hc` client consumed by the web app via **TanStack Query**. No git/github/tmux
  services yet (those arrive in changes 3–5).
- The **auth gate** (closing the zero-auth hole, *not* multi-user auth): server **bound to
  loopback** behind `tailscale serve`; trust the injected `Tailscale-User-Login` identity
  against an allowlist, with a **bearer-token fallback** (from `~/.switchboard`) for
  direct/local access; strict origin/CORS; identity headers trusted only when the request
  arrived via `serve`. The exact viability behind `serve` is **proven in spike 0**.
- **Observability**: OpenTelemetry (semconv) instrumentation with an OTLP exporter behind
  a config toggle (off by default; Seq sink wired later) and a **redaction policy** (no
  PATs, clone URLs, branch names, local paths, command args, or GitHub errors in spans).
- The **test harness**: Vitest (unit) and Playwright (E2E) with a **temporary-git
  fixture**, plus Storybook configured to **quarantine** `apps/web/src/prototypes/**` from
  the snapshot/unit/autodocs/published-API surface. Includes **auth/bind-address tests**,
  **API contract tests** (web↔server schema drift), and **token-redaction/subprocess
  tests**.

See the programme page for the cross-cutting decisions this change instantiates. **Spike 0
(the runtime spike) runs before `foundations`** — its findings (Tailscale-serve auth path,
bind model, config-volume + Claude-credential persistence, process/tmux supervision) feed
this change's design, so settle the auth/bind/config shape against the spike's results.

## Plan page

[docs/plans/switchboard/mvp.md](../../../docs/plans/switchboard/mvp.md) — the Switchboard
MVP programme page. Its `openspec-changes` frontmatter lists `foundations`.

## Planned architecture

**Architectural impact: yes — but bootstrapped.** The LikeC4 tooling lives in `site/`,
which is itself a `foundations` deliverable, so a planned model cannot be authored or
validated during this planning stage (no `likec4` available, nothing to `extend`).

**Decision:** `foundations` authors the **permanent** base model directly under
`docs/dev/Architecture/*.c4` (not a `Planned/foundations.c4` overlay) as an early
implementation task — the scaffolded skeleton it describes is *real* by the time the task
runs — and validates it then with
`pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture`. Feature
changes 3–6 graft their additions as `Planned/<change>.c4` `#todo` overlays onto this base.

Intended base model (authored during implementation, names fixed here so later changes can
`extend` them):

- **System** `Switchboard` with containers `Switchboard.WebSPA`, `Switchboard.Api`,
  `Switchboard.Cli`.
- **External** systems: `GitHub`, `TmuxHost` (the host's tmux + `claude` processes),
  `ClaudeBackplane` (Claude's remote-control servers), `Tailscale`, `MobileApp` (the
  official Claude mobile app).
- **Views**: `foundations-context` (system context), `foundations-containers` (container view).

Because no `Planned/foundations.c4` exists, the programme's **Architecture review
checkpoint does not fire** for `foundations` — acceptable, as this base architecture was
designed and approved collaboratively in planning and there is no prior model to challenge.

## Decisions

- **Schema = switch-feature (not -ui).** `foundations` sets up Storybook + theme tokens
  but does not *explore* UI patterns; the dedicated prototyping happens in
  `ui-prototypes-mvp`. The app shell here is a basic scaffold, not a design exploration.
- **Auth gate from day one** (Codex review). The MVP does **not** ship zero app auth:
  `foundations` adds the loopback-bound + `tailscale serve` + identity-allowlist +
  bearer-fallback gate and its bind-address tests. Real multi-user authorization stays
  deferred. The Tailscale-header path is validated in spike 0 before it is baked in.
- **`RuntimeContext` abstraction from day one** (Codex review). Services and `start(ctx)`
  receive a workspace-root/config/identity context; no host-global paths in service APIs,
  keeping the container-per-user multi-user path clean even with one user.
- **Spike 0 precedes `foundations`** (Codex review). The runtime spike is a throwaway
  investigation (findings → `docs/dev/spikes/`), run first; `foundations` design consumes
  its go/no-go on Tailscale-in-Docker, the auth path, config/credential persistence, and
  supervision.
- **LikeC4 base model authored during implementation**, permanent (not `Planned/`), per
  the bootstrap reasoning above.
- **Cross-cutting stack decisions** (Hono RPC + Zod, TanStack Query, filesystem/tmux as
  truth, pnpm/Just, OTel-now/Seq-later, etc.) are recorded on the
  [programme page](../../../docs/plans/switchboard/mvp.md#cross-cutting-decisions-locked),
  not duplicated here.
- **Documentation destinations (seed for `docs-migration.md`):**
  - `author →` `docs/dev/Contributing/development-workflow.md` — referenced by
    `openspec/config.yaml` but does not yet exist; `foundations` authors it.
  - `author →` `docs/dev/Architecture/*.c4` — the permanent base LikeC4 model.
  - `author →` repo root `README.md` — how to install/build/run Switchboard locally.
  - `author →` `docs/dev/Contributing/testing.md` — the Vitest/Playwright/Storybook
    harness conventions (temp-git fixture, prototype quarantine).
  - `retire — trim` `docs/plans/switchboard/mvp.md` at archive: the page lists other
    still-active changes, so trim `foundations`' content rather than delete the page.

## Open questions

- **Foundations scope/size.** This is the heaviest change (toolchain + design system +
  harness + architecture model). If it balloons during design, consider splitting the
  design-system/Storybook setup from the build/server/harness setup. Settle at design.
- **Retro theme depth.** How far to take the '50s switchboard theme in `foundations`
  (tokens + primitives only?) vs leaving richer treatment to `ui-prototypes-mvp`. Lean:
  tokens + a few primitives here; full treatment in prototypes.
- **Server `start(ctx)` API shape.** The programmatic entrypoint the CLI imports —
  likely `start({ config, logger, telemetry, identity, signal })` returning a handle with
  graceful shutdown. Settle signature, port selection, log routing, and lifecycle at design.
- **OTLP/Seq toggle shape.** Exact config key + default exporter (console vs none) when
  Seq is off. Settle at design.

### Review-driven design notes (capture for `design.md` / `tasks.md`)

From the Codex plan review — fold these into the design + task list when authored; they
need no further plan-doc change:

- **PAT credential-helper contract** (#6): helper protocol, how GitHub API and git clone
  share the token, subprocess env hygiene (no token in args/remotes/logs), container
  secret mounting, behaviour on helper failure, OS-keychain/OAuth-ready interface — with
  redaction + subprocess tests. (Shared concern with `repo-clone-browse`.)
- **API contract tests** (#7): route type exports, the client import/generation pattern,
  runtime validation on every mutation input, and a deliberately-failing test when schema
  and route drift.
- **`start(ctx)` shape + packaged-CLI smoke test** (#8): test the shipped npm path, not
  just workspace dev imports.
- **Telemetry redaction policy** (#11): allow/block attribute list + redaction tests
  before any exporter is enabled.
- **Foundations split trigger** (#12): a hard rule — if `foundations` cannot produce a
  green build/test harness quickly, split design-system/Storybook from server/test/tooling.
