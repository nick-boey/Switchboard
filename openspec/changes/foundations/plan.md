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
- The **API skeleton**: a Hono app with **Hono RPC + Zod** wiring and a health endpoint;
  the typed `hc` client consumed by the web app via **TanStack Query**. No git/github/tmux
  services yet (those arrive in changes 3–5).
- **Observability**: OpenTelemetry (semconv) instrumentation with an OTLP exporter behind
  a config toggle (off by default; Seq sink wired later).
- The **test harness**: Vitest (unit) and Playwright (E2E) with a **temporary-git
  fixture**, plus Storybook configured to **quarantine** `src/prototypes/**` from the
  snapshot/unit/autodocs/published-API surface.
- Security guardrails: server binds to localhost / the tailnet interface, never
  `0.0.0.0` publicly.

See the programme page for the cross-cutting decisions this change instantiates.

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
- **Server `start()` API shape.** The programmatic entrypoint the CLI imports — signature,
  config injection, lifecycle/shutdown. Settle at design.
- **OTLP/Seq toggle shape.** Exact config key + default exporter (console vs none) when
  Seq is off. Settle at design.
