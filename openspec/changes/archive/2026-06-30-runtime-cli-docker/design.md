## Context

`runtime-cli-docker` is the **last MVP change** and the only one that does no feature work: it
turns the working app the feature chain produced (`foundations → repo-clone-browse →
worktree-management → claude-session-launch`, all archived) into something the user can **install
and run on the tailnet**. It **productionizes the spike-0 findings**
(`docs/dev/spikes/runtime-spike.md`, verdict GO): userspace Tailscale-in-Docker, the `tailscale
serve` identity path, config-volume + tailscale-state persistence, Claude credential persistence,
and tmux/process supervision.

Current state going in (the implemented surface this builds on):

- **`apps/cli`** (`foundations` Decision 8) ships the **thin shell**: `switchboard --version` and a
  `switchboard start` that runs `loadConfig()`, builds a `RuntimeContext`, and calls the server's
  `start(ctx)` for a **loopback-only local run** — explicitly with "_No Docker / Tailscale
  orchestration — that is the later `runtime-cli-docker` change_" in the code. Graceful shutdown on
  SIGINT/SIGTERM already works; logs go to stderr; the one stdout line is the bound URL. A
  **packaged-CLI smoke test** (`apps/cli/src/cli.smoke.test.ts`) already exercises the **built**
  `dist/index.js` (not a workspace import) for `--version` and a loopback `/health`. This change
  fills out the orchestration the shell deferred.
- **`apps/server`** (`foundations` Decisions 2–3): `start(ctx): Promise<ServerHandle>` binds
  **loopback TCP only** (`127.0.0.1`, ephemeral port) and returns `{ url, close() }`. `close()`
  stops accepting connections and releases the port. The auth gate (`apps/server/src/auth.ts`)
  detects the "serve path" by **header markers** — `tailscale-user-login` + `tailscale-headers-info`
  + a CGNAT (`100.64.0.0/10`) `x-forwarded-for` — and trusts the identity only when
  `trustServeIdentity` is on AND those markers are present; otherwise it is bearer-only.
- **`packages/shared`** owns the `~/.switchboard/config.json` Zod schema (`config.ts`) and the
  standalone **`loadConfig()`** (`load-config.ts`): first run creates the dir (`700`) +
  `config.json` (`600`) with a generated bearer token and `trustServeIdentity: false`; an existing
  file is validated and a clear field-named error refuses startup. `start(ctx)` performs no file
  I/O.

Constraints fixed on the programme page (`docs/plans/switchboard/mvp.md`, the cross-change arbiter)
and **not re-litigated here**: TypeScript CLI, thin `apps/cli`, **npm** distribution (`npx
switchboard` / `npm i -g`), imports server `start(ctx)`; **single-user MVP, container-per-user
deferred**; loopback bind + `tailscale serve` is the ingress; config in `~/.switchboard` (`600`);
container secret mounting for the PAT and the Tailscale auth key; observability redaction holds. The
locked **Auth** decision names the hardening this change lands: "_a Unix-domain-socket serve ingress
is the deferred hardening (`runtime-cli-docker`)_." Implementation discovery reconciles that wording
(Decision 3): `tailscale serve` only proxies to `http://127.0.0.1:<port>` — it has **no** Unix-socket
target — so the hardening is realised as a **dedicated, non-host-published loopback-TCP serve
ingress** that achieves the same serve-exclusive, bind-time-trust property via container network
isolation rather than filesystem permissions. The dependency edge on `claude-session-launch` is
a **sequencing** choice (a complete app to ship + validate the runtime against real behaviour); the
only hard technical dependency is the archived `foundations`.

## Goals / Non-Goals

**Goals:**

- **CLI orchestration** — grow `apps/cli` from the thin local shell into the runtime's control
  plane: **config bootstrap** into `~/.switchboard`, **supervise** the server's `start(ctx)`
  (graceful shutdown + bounded restart-on-crash), and a **`--docker` mode** that brings up
  `tailscaled` + `tailscale serve` in front of the server. Still **npm-distributed**; still imports
  `start(ctx)` (it is not the server).
- **Dedicated serve ingress (the deferred auth hardening)** — `start(ctx)` learns to listen on a
  **dedicated serve ingress** (a second loopback-TCP listener on its own port) in addition to the
  direct/local loopback-TCP ingress, so identity trust rests on a **serve-exclusive ingress** (the
  serve port is not published to the host and `tailscale serve` is its only configured proxy —
  container network isolation, not forgeable header markers). The direct loopback-TCP path stays
  **bearer-only**.
- **Docker image + Tailscale bring-up** — a published image that runs the CLI as its supervisor:
  **userspace** `tailscaled` (no `NET_ADMIN` / `/dev/net/tun`), `tailscale up` from an auth-key
  secret, `tailscale serve` (HTTPS/443) → the **dedicated loopback-TCP serve ingress**
  (`http://127.0.0.1:<servePort>`), with **no API port published** to the host. Named-volume
  **persistence** for tailscale state and `~/.switchboard`, a **Claude-credential** strategy, and
  **secret mounting** for the PAT + auth key.
- **Packaged-CLI smoke test** extended to exercise the **shipped** path (the built bin, the serve
  ingress over loopback, `--version`), not just dev imports.
- Author the planned-architecture overlay `docs/dev/Architecture/Planned/runtime-cli-docker.c4`
  (deferred from `plan.md`; the Architecture review checkpoint fires when it lands) and the
  user-facing **runtime/deployment** documentation (Docker run, Tailscale auth, credential
  persistence, config volume) that the feature changes deferred here.

**Non-Goals:**

- **Multi-user / container-per-user.** Single-user MVP (programme decision). The `RuntimeContext`
  abstraction already keeps that path open; this change does not build it.
- **A Seq instance / OTLP sink.** Observability is already instrumented with redaction; wiring a Seq
  backend stays deferred (programme).
- **New feature behaviour** — repos, worktrees, sessions, the web UI are done. This change ships the
  runtime around them; it changes no feature contract.
- **A bespoke process supervisor / init system.** Supervision is the minimum the runtime needs
  (graceful shutdown + bounded restart-on-crash + tailscaled liveness in `--docker` mode), not a
  general-purpose supervisor.
- **Funnel / public internet exposure.** The tailnet (no Funnel) is the network boundary
  (programme security posture).
- **Removing the direct loopback-TCP ingress.** It remains for direct/local/dev access
  (bearer-only); the serve ingress is a **separate** loopback-TCP listener (its own port, not
  host-published).

## Decisions

### Decision 1 — The CLI is the orchestrator; it still imports `start(ctx)` and ships on npm

`apps/cli` grows from the thin shell into the runtime's control plane while keeping every
`foundations` Decision-8 property: TypeScript, npm-distributed, **imports** the server's
`start(ctx)` (it is not the server), bundled with `tsup`, with a packaged-bin smoke test. Two new
responsibilities join `start`:

- **Config bootstrap** (Decision 4) — provision `~/.switchboard` before serving.
- **Supervised lifecycle** (Decision 5) — run `start(ctx)`, restart it on unexpected failure with
  bounded backoff, and shut it down gracefully on a signal.

and one new mode:

- **`--docker` mode** (Decision 6) — when the CLI is the container's entrypoint, additionally bring
  up and supervise `tailscaled` + `tailscale serve` in front of the server.

`switchboard start` (no flag) keeps its meaning — a **local loopback run** — so the existing smoke
test and dev workflow are unchanged. _Alternative considered:_ a separate `switchboard-docker`
binary or a host-side Docker-orchestration command — rejected: the spike already proved the bring-up
belongs **inside** the container (its `entrypoint.sh`), so `--docker` mode is the CLI acting as the
in-container supervisor, and host-side `docker run` (volumes/secrets/caps) is operator tooling
documented in the runtime guide, not a CLI subcommand.

### Decision 2 — `start(ctx)` gains a dual ingress: a direct loopback-TCP (bearer-only) + a dedicated loopback-TCP serve ingress

The server's single loopback-TCP listener becomes a **listen specification** on the
`RuntimeContext`/`start` options describing one or both ingresses, distinguished **by port**:

- **Direct loopback-TCP ingress** (`127.0.0.1`, ephemeral or configured port) — the
  **direct/local** ingress, unchanged in shape. It is **bearer-only**: `tailscale-user-*` headers
  are ignored entirely here regardless of `trustServeIdentity` or markers.
- **Dedicated loopback-TCP serve ingress** (`127.0.0.1` on its **own** configured port) that
  **`tailscale serve` proxies to** (`http://127.0.0.1:<servePort>` — the only proxy target shape
  `tailscale serve` supports). It is bound **only inside the container's network namespace** and is
  **never published to the host**, so from the tailnet the only path to it is through `tailscale
  serve`. This is the **only** ingress on which a serve identity can be trusted.

`@hono/node-server`'s `serve()` listens on each port, so each ingress is a Node server fronting the
**same** Hono app, but built with an **ingress-scoped identity-trust flag** (Decision 3).
`ServerHandle.close()` now releases **both** listeners on graceful shutdown. For a local
`switchboard start` the listen spec is the direct loopback ingress only (no behaviour change); in
`--docker` mode it is the dedicated serve ingress (plus, optionally, a direct loopback port for
in-container probing).

_Alternative considered:_ keep one listener and tag the ingress per-connection inside a single Node
server — rejected: two Node servers with a per-ingress trust flag makes "which ingress admitted this
request" a property the app **controls at bind time**, not something inferred per request, which is
exactly the trust-boundary guarantee we want.

_Alternative considered:_ a Unix-domain-socket serve ingress (the wording in the locked Auth
decision), gated by `600`/`700` filesystem permissions — rejected as **infeasible**: `tailscale
serve` proxies **only** to `http://127.0.0.1:<port>` and has no Unix-socket target (Tailscale CLI
reference: "Only `http://127.0.0.1` is supported for proxies"). The dedicated, non-host-published
loopback-TCP port gives the **same** bind-time, ingress-scoped trust property; serve-exclusivity is
enforced by **container network isolation** (no host-published port + serve as the sole proxy)
instead of filesystem permissions (Decision 3).

### Decision 3 — Identity trust rests on the serve ingress, not on header markers (the hardening)

This is the load-bearing security change and the one the Artifacts review must scrutinise. Today the
auth gate infers "this came via serve" from **header markers** any process on the host could set, so
`foundations` Decision 3 accepted a **residual single-tenant spoofing risk**: a process that bypasses
serve to reach the **loopback-TCP** port could forge `tailscale-user-*` headers and, with
`trustServeIdentity` on, be admitted as an identity. The **dedicated serve ingress** closes that:

- **Trust basis = the ingress, not the headers.** A serve identity is trusted **only** for a request
  that arrived on the **dedicated serve ingress** (the serve port) AND only when `trustServeIdentity`
  is enabled. The eligibility is an **ingress-scoped flag set at bind time** — a property of which
  listener admitted the connection, not anything inferred from a request header. The direct
  loopback-TCP ingress is **bearer-only** and never consults `tailscale-user-*` headers, so a forged
  header on it **cannot flip** the trust decision.
- **Why the serve ingress is serve-exclusive.** The serve port is a loopback-TCP listener bound
  **only inside the container's network namespace** and **never published to the host** (Decision 6);
  `tailscale serve` is the **sole** configured proxy to it. From outside the container the only path
  to the serve port is therefore through `tailscale serve`, which terminates tailnet TLS and injects
  the authenticated identity. The single-purpose container's network namespace holds **only** the
  trusted runtime processes (`tailscaled`, `tailscale serve`, the supervised server), so "serve is
  the exclusive ingress" is enforced by **container network isolation**, not by trusting a header.
  (`tailscale serve` proxies only to `http://127.0.0.1:<port>` and has no Unix-socket target, so this
  network-isolation mechanism replaces the filesystem-permission mechanism a UDS would have provided;
  see Decision 2.)
- **Identity-eligibility is bound to the container-isolation assertion (the host-reachable serve-port
  gap, closed).** A serve listener is identity-eligible **only** when the runtime asserts it is not
  host-published — i.e. the container/`--docker` runtime. The ingress-scoped trust flag is computed at
  bind time as `trustServeIdentity ∧ is-serve-ingress ∧ runtime-asserts-no-host-publication`; outside
  the container runtime that last conjunct is false, so a host serve listener is **bearer-only and
  never identity-eligible**. To keep the contract **fail-loud** rather than silently downgrading, the
  unsafe combination — `trustServeIdentity` **+** a serve ingress **+** no container-isolation
  assertion — is **rejected at config/bootstrap validation** with a clear, field-named error. _Option
  chosen:_ **reject-the-combo** over the alternative of making identity simply unavailable outside
  `--docker` — because a host run that *intends* an identity-eligible port is a misconfiguration the
  operator should see, not have quietly downgraded, and it matches the existing fail-fast
  invalid-config idiom. This closes the gap where a non-Docker config enabling **both** a serve ingress
  **and** `trustServeIdentity` would otherwise bind a host-reachable, identity-eligible port any local
  process could reach with forged markers. A plain host serve listener (no `trustServeIdentity`) stays
  allowed for local use — bearer-only, never identity-eligible.
- **What is closed vs. what remains.** The realistic vector in the residual risk — a process reaching
  the API by **bypassing serve** (a host process, another container, or a tailnet peer hitting a
  host-published port) — is closed: no API port is host-published and the direct/local ingress is
  bearer-only. What remains is bounded to a process **co-resident in the single-purpose container's
  network namespace**, which is the trusted runtime itself; container isolation is where the trust
  boundary now sits.
- **Markers stay as defence-in-depth.** On the serve ingress the request must still carry the serve
  markers and an allowlisted `tailscale-user-login`; the allowlist check is unchanged. The markers
  are now a **secondary** signal, not the trust basis.
- The `trustServeIdentity` config flag keeps its meaning (default **off**; when off, identity is
  never trusted on any ingress and `tailscale-user-*` headers are ignored). What changes is the
  **eligibility precondition**: it shifts from "markers present" to "arrived on the dedicated serve
  ingress."

This MODIFIES two `api-auth-gate` requirements — **"Tailscale identity authentication on the serve
path"** (its eligibility precondition becomes the dedicated serve ingress) and **"Identity trust
requires a serve-exclusive ingress"** (the dedicated, non-host-published loopback-TCP serve port is
now the concrete serve-exclusive ingress, and the residual bypass-serve spoof is closed rather than
merely accepted). The other gate requirements (reject-by-default, bearer auth, strict CORS) are
unchanged. Honours the CLAUDE.md gotcha verbatim: identity headers are trusted **only on the serve
path** (now the dedicated serve ingress), never on direct loopback; direct loopback authenticates
with the bearer token from `~/.switchboard`.

### Decision 4 — Config bootstrap + the new runtime config slots

`loadConfig()` already creates secure `600` defaults on first run; the CLI's **bootstrap** wraps it
as the runtime's front door and the schema gains the slots the runtime needs:

- A **listen specification** (Decision 2): the direct loopback-TCP ingress (host/port) and the
  optional dedicated serve ingress (its own loopback-TCP port), so the server, the CLI, and the
  Docker entrypoint all agree on the ingress shape from one schema (the single source of truth,
  mirroring `foundations` Decision 6).
- A **secrets layout**: the Tailscale auth key and the GitHub PAT are read **out-of-band** from
  `~/.switchboard` (or a mounted secret), never baked into the image or logged; the bootstrap ensures
  the directory perms (`700` dir, `600` files). The PAT slot already exists (`github` config); the
  auth key is read by `--docker` mode at bring-up, not stored in `config.json` plaintext when a
  mounted secret is supplied.

Bootstrap is **idempotent**: an existing valid `~/.switchboard` is left intact (only missing pieces
are created); an invalid config refuses to start with a field-named error (existing behaviour). This
MODIFIES `app-runtime` **"Configuration loading and validation"** to add the listen/runtime slots and
name the CLI bootstrap as the provisioning step, without weakening the existing first-run /
invalid-config / parsed-on-context guarantees. It also adds one **cross-field, mode-aware validation
rule**: serve-identity trust (`trustServeIdentity`) paired with a serve ingress is **rejected** unless
the runtime asserts no host publication (Decision 3) — a fail-fast guard against binding a
host-reachable, identity-eligible port. The runtime mode is a bootstrap input (the shared schema stays
mode-agnostic), so this check lives at the CLI bootstrap where `--docker` vs host is known, not in the
mode-blind `loadConfig()` Zod parse.

### Decision 5 — Supervised lifecycle: graceful shutdown + bounded restart-on-crash

The CLI **supervises** the server it starts:

- **Graceful shutdown** (existing): SIGINT/SIGTERM → `handle.close()` (now releasing both
  loopback-TCP listeners) → exit. In `--docker` mode the signal is also forwarded to `tailscaled`.
- **Restart-on-crash** (new): if `start(ctx)` rejects or the handle closes unexpectedly (not via a
  signal), the supervisor restarts it with **bounded exponential backoff** and a **give-up ceiling**
  (after N rapid failures it exits non-zero so the container/orchestrator surfaces the fault rather
  than crash-looping silently). A clean signal-driven shutdown never triggers a restart.

This MODIFIES `app-runtime` **"Server lifecycle via RuntimeContext"** so the lifecycle covers the
dual ingress + clean teardown of both; the **supervision policy itself** (backoff, give-up, signal
forwarding) is an ADDED `cli-runtime` requirement, since it is the CLI's behaviour, not the server's.
_Alternative considered:_ run the server as a spawned **child** process the CLI watches — rejected for
the MVP: the thin shell already runs `start(ctx)` **in-process** and that is simplest to supervise and
test; a child-process supervisor is unnecessary ceremony for a single server. `tailscaled` **is** a
real child process in `--docker` mode and is supervised as one (Decision 6).

### Decision 6 — `--docker` mode: userspace `tailscaled` + `tailscale serve` → the dedicated loopback serve port

`--docker` mode is the CLI acting as the **container entrypoint/supervisor**, productionizing the
spike's `entrypoint.sh`:

1. Start **`tailscaled` with userspace networking** (`--tun=userspace-networking`) — the spike proved
   this needs **no** `NET_ADMIN` / `/dev/net/tun` (Q1). Wait for its control socket.
2. `tailscale up` using the **auth-key secret** (mounted, not in the image), with a stable hostname.
3. Start the server on the **dedicated serve ingress** (Decision 2) via `start(ctx)` — a loopback-TCP
   listener on `127.0.0.1:<servePort>` that is **not** published to the host.
4. `tailscale serve` (HTTPS/443) → the serve port, with the **pinned invocation**:

   ```
   tailscale serve --bg --https=443 http://127.0.0.1:<servePort>
   ```

   `--bg` runs serve in the background (returns control to the supervisor); `--https=443` is the
   tailnet-facing HTTPS listener; `http://127.0.0.1:<servePort>` is the only proxy-target shape
   `tailscale serve` supports ("Only `http://127.0.0.1` is supported for proxies"). **Minimum
   Tailscale version: v1.50.0** — the release that introduced this simplified `serve` CLI (the `--bg`
   flag and the positional `<target>` reverse-proxy form). The image installs a current stable
   release at or above that floor, and the bring-up **asserts the version at startup** before running
   serve. (The spike left this as a fallback chain — pinning it was an explicit spike follow-up.)
   HTTPS serve needs MagicDNS + HTTPS certs on the tailnet (documented).
5. **No API port is published** to the host network: only `tailscale serve` reaches the server, over
   the loopback serve port inside the container's network namespace. This container network isolation
   is what makes the ingress serve-exclusive (the bind-time trust property of Decision 3).
6. Supervise `tailscaled` (a real child) and the server (Decision 5) for the container's lifetime;
   forward signals.

ADDED under the new **`container-runtime`** capability. _Alternative considered:_ kernel TUN
(`--cap-add=NET_ADMIN --device=/dev/net/tun`) — kept as a **documented fallback** if userspace proves
unreliable (the spike's `run.sh` notes the swap), but userspace is the default because it needs no
elevated capabilities.

### Decision 7 — Persistence: named volumes, the Claude-credential strategy, secret mounting

From the spike's verdicts:

- **Tailscale state** (`/var/lib/tailscale`) and **`~/.switchboard`** (config + secrets) are **named
  volumes** so a container restart **reconnects without re-auth** (Q3 ✓) and config/bearer-token
  persist.
- **Claude credentials** (`~/.claude`) are a **named volume populated by an in-container `claude`
  login**, performed once. The spike found (Q4 ❌ on macOS) that mounting the host `~/.claude` does
  **not** carry a working login into a Linux container (macOS stores the OAuth token in the Keychain,
  not `~/.claude/.credentials.json`). So the runtime guide documents: **authenticate `claude` inside
  the container once and persist the `~/.claude` volume**, or run on a Linux host where
  `~/.claude/.credentials.json` exists. Without this, `claude --remote-control` launches (the
  `claude-session-launch` slice) would fail at runtime — surfaced there as a typed launch error, not a
  crash.
- **Secrets** — the Tailscale **auth key** and the GitHub **PAT** are **mounted** (env-file / secret
  file / volume), never baked into the image and never logged (redaction holds). Volume removal is the
  documented teardown.

ADDED under `container-runtime`.

### Decision 8 — Packaged-CLI smoke test exercises the shipped path, including the serve ingress

The existing smoke test (built `dist/index.js`; `--version`; loopback `/health`) is **extended** to
also prove the **dedicated serve ingress**: start the bin with a listen spec that includes a serve
port (a second loopback-TCP port alongside the direct one), then `fetch` `/health` on the serve port
and assert `200` — proving the shipped artifact binds the dedicated serve port the Docker path
depends on. Per CLAUDE.md the CLI's Vitest exercises the **built** bin, so any task that touches
`apps/cli` (or the smoke test) **must `pnpm --filter @switchboard/cli build` first** — encoded as an
explicit task ordering.

### Decision 9 — Vertical slice + planned-architecture overlay

The slice spans:

- `packages/shared` — the listen-spec / runtime config-schema additions (Decision 4), exported from
  the barrel; co-located tests.
- `apps/server` — the dedicated serve-ingress port + ingress-scoped identity-trust flag on
  `start(ctx)` and the auth gate (`server.ts`, `auth.ts`); `close()` releasing both listeners.
- `apps/cli` — config bootstrap, the supervisor (graceful + restart policy), `--docker` mode
  (`tailscaled` + `serve` bring-up), and the extended smoke test.
- **Ops** — the `Dockerfile` (productionizing the spike image: tailscale + tmux + git + the CLI), the
  pinned `tailscale serve` invocation, and the secret/volume layout.
- `docs` — the planned-architecture overlay `docs/dev/Architecture/Planned/runtime-cli-docker.c4`
  (`extend` `Switchboard.Cli` with the orchestration/supervision role and the `Tailscale ->
  Switchboard.Api` serve ingress over the dedicated loopback serve port, every addition `#todo`, view
  ids `runtime-cli-docker-*`) and the user runtime/deployment guide.

## Testing strategy

Unit/integration tests run against TS source via the `switchboard-source` condition (no pre-build) —
**except** `apps/cli`, whose Vitest exercises the **built** `dist/index.js` (CLAUDE.md), so the smoke
test's group builds the CLI first. E2E needs `just build` first.

**Test-harness gap assessment.** Most harness exists and is reused: the `RuntimeContext` fakes
(`makeTestContext`), the auth unit tests (`auth.test.ts` — bearer / identity / spoof-safe negative),
the server bind tests (`server.test.ts`), the config tests, and the **packaged-CLI smoke test**
(`cli.smoke.test.ts`). Gaps to build in the leading **Test infrastructure** group:

- A **dual-ingress test helper** — bind `start(ctx)` with a listen spec carrying both a direct
  loopback-TCP port and a dedicated serve port (two loopback-TCP listeners), issue HTTP requests to
  **each** port, and assert both bind loopback only and `close()` releases both — so the
  ingress-scoped serve trust and the listener lifecycle are deterministically testable without Docker
  or real Tailscale.
- A **supervisor test seam** — inject a controllable "server factory" so the restart-on-crash policy
  (backoff, give-up ceiling, no-restart-on-signal) can be driven by making the fake `start` reject /
  close unexpectedly, with no real ports.
- A **Tailscale/Docker orchestration seam** — `--docker` mode's `tailscaled` / `tailscale serve`
  calls go through an injectable runner (the `GitRunner`/`TmuxRunner` precedent) so bring-up
  **wiring** (argv, ordering, signal forwarding, the pinned `serve` invocation) is asserted against a
  fake. **Real** `tailscaled` / `serve` / Docker bring-up is **not** run in CI — it is covered by the
  spike (GO) and a manual runtime check; the unit surface proves the wiring, the manual check proves
  the real bring-up.

**Unit / integration surface:**

- `packages/shared` — the listen-spec schema parses a direct-only spec, a serve-only spec, and a dual
  spec; invalid specs are rejected with a field-named error.
- `apps/server` — `start(ctx)` binds the dedicated serve port and serves `/health` on it; `close()`
  releases both listeners; the **auth gate trusts a serve identity only on the serve ingress** (an
  allowlisted identity on the serve port is admitted; the **same headers on the direct loopback port
  are rejected** unless a valid bearer is present — the spoof-close regression test); the
  **host-reachable serve-port negative**: a serve ingress bound **without** the container-isolation
  assertion is bearer-only, so forged markers on it grant nothing (bearer still required); both binds
  stay loopback-only.
- `apps/cli` — bootstrap provisions `~/.switchboard` idempotently with secure perms; bootstrap
  **rejects** the unsafe combo (`trustServeIdentity` + a serve ingress, non-`--docker`) with a
  field-named error before any listener binds; the supervisor
  restarts on simulated crash with bounded backoff and gives up after the ceiling, and a signal-driven
  shutdown does **not** restart; `--docker` mode invokes `tailscaled` (userspace) → `tailscale up` →
  `start` (dedicated serve port) → `tailscale serve` (the pinned `--bg --https=443
  http://127.0.0.1:<servePort>` invocation, gated on a minimum-version check) in order against the
  fake runner and forwards signals; the **extended smoke test** proves `--version`, loopback
  `/health`, and `/health` **on the serve port** on the built bin.

**E2E / manual:** the existing E2E (bearer path against a real `start(ctx)`) is unchanged. The real
Docker + Tailscale bring-up + the Claude-credential volume is validated by a **manual runtime check**
following the new runtime guide (CI cannot run real Tailscale/Docker), echoing the spike's evidence.

## Risks / Trade-offs

- **[Risk] The serve-ingress hardening is the trust boundary — a regression silently re-opens the
  spoof.** → **Mitigation:** an explicit **spoof-close regression test** asserts the **same** serve
  headers admitted on the serve port are **rejected on the direct loopback port** (bearer-only); the
  ingress trust is a bind-time flag (Decision 2/3), not a per-request inference, so it cannot be
  flipped by a forged header. The Artifacts review scrutinises both MODIFIED `api-auth-gate`
  requirements.
- **[Risk] The serve port gets host-published, re-exposing it outside the container.** Because the
  serve ingress is a loopback-TCP port (not a permission-gated socket), publishing it to the host
  (`-p`) would let a process bypass serve and reach an identity-eligible ingress. → **Mitigation:**
  the `container-runtime` spec REQUIRES **no API port published**; the `Dockerfile` declares no port
  and the runtime guide + manual check verify nothing is published — container network isolation is
  the serve-exclusive guarantee (Decision 3/6). And even if a serve port is bound on a host, a config
  that pairs `trustServeIdentity` with a serve ingress **outside** the container runtime is **rejected
  at bootstrap** (Decision 3/4), so a host-reachable serve port can never be made identity-eligible —
  identity-eligibility is, by construction, container-isolated.
- **[Risk] `tailscale serve` CLI/version drift** — the spike used a fallback chain. → **Mitigation:**
  the invocation is **pinned** (`tailscale serve --bg --https=443 http://127.0.0.1:<servePort>`) with
  a **minimum version (v1.50.0)** asserted at bring-up and the argv asserted against the fake runner;
  document the MagicDNS + HTTPS-certs prerequisite.
- **[Risk] Claude credentials do not carry into the container** (spike Q4 ❌ on macOS). →
  **Mitigation:** the runtime guide mandates an **in-container `claude` login + `~/.claude` named
  volume** (or a Linux host); a missing login surfaces as a typed launch error in
  `claude-session-launch`, not a runtime crash. Documented, not silently assumed.
- **[Risk] Restart-on-crash masks a real fault by crash-looping.** → **Mitigation:** bounded backoff +
  a give-up ceiling that exits non-zero so the orchestrator surfaces the fault.
- **[Trade-off] No real Docker/Tailscale in CI.** → Accepted: the spike (GO) + a manual runtime check
  cover real bring-up; CI asserts the orchestration **wiring** against a fake runner. The seam keeps
  the wiring honest without a flaky, capability-hungry CI dependency.
- **[Trade-off] Userspace networking over kernel TUN.** → Userspace needs no elevated capabilities
  (the default); kernel TUN (`NET_ADMIN` + `/dev/net/tun`) is a documented fallback if userspace
  proves unreliable.

## Migration Plan

**BREAKING (runtime shape only — no feature contract changes).** The serve ingress moves from the
single shared loopback-TCP port to a **dedicated, non-host-published loopback-TCP serve port**
distinct from the direct/local loopback ingress, which stays bearer-only. Because the MVP is
single-user and this is the last change, migration is operational, not code-level: a deployment that
fronted the API port with `tailscale serve` reconfigures `serve` to target the **dedicated serve
port** and stops publishing any API port to the host (`switchboard start --docker` does this
automatically inside the container). `trustServeIdentity` now additionally requires the dedicated
serve ingress to be in effect; existing `~/.switchboard/config.json` files remain valid (the new
listen-spec slots default to the prior loopback-TCP-only shape, so a plain `switchboard start` is
unchanged).

## Open Questions

- **Image base + size** (the spike used `node:22-alpine`; the production image must match the repo's
  Node engine and bundle the CLI) — settled during implementation; not a contract.
- **Restart-policy constants** (backoff base/ceiling, give-up count) — chosen during implementation;
  the policy shape (bounded backoff + give-up) is the contract, the constants are not.
- **Auth-key rotation / ephemeral nodes** — out of scope for the single-user MVP; the auth key is a
  mounted secret and rotation is operator-driven (documented), not automated here.
