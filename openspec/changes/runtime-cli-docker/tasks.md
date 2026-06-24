## 1. Test infrastructure

- [x] 1.1 Build the **dual-ingress test helper** in `apps/server/src/testing/` (e.g.
      `dual-ingress.ts`): bind `start(ctx)` with a listen spec carrying both a direct loopback-TCP
      port and a dedicated serve port (two loopback-TCP listeners), issue an HTTP request to **each**
      port, and assert both bind loopback only and that `close()` releases both. Add its own
      `dual-ingress.test.ts` proving the helper round-trips `/health` on each port and observes which
      ingress a request arrived on.
- [x] 1.2 Build the **supervisor test seam** in `apps/cli/src/testing/` (the GitRunner/TmuxRunner
      fake is the precedent): an injectable **server-starter** fake that resolves a fake
      `ServerHandle`, can be driven to **reject** or to **close unexpectedly** (no signal), and records
      `close()` calls. Add a self-test proving it is controllable per scenario. (Injected so cli unit
      tests never import the real `@switchboard/server` value and run against source under the root
      vitest `switchboard-source` condition — no build needed.)
- [x] 1.3 Build the **Tailscale/Docker orchestration runner seam + fake** in `apps/cli/src/testing/`:
      an injectable `RuntimeRunner` that records argv invocations (`tailscaled`, `tailscale up`,
      `tailscale serve`) in order and is controllable for success/failure, mirroring `git-runner.ts`.
      Add a self-test proving invocation order and argv are observable.

## 2. Shared: runtime listen-spec config schema (packages/shared)

- [x] 2.1 (red) Extend `packages/shared/src/config.test.ts`: the schema parses a **direct-only** spec,
      a **serve-only** spec, and a **dual** spec; rejects an invalid spec (bad/out-of-range port) with
      a **field-named** error; and an existing config with **no** listen spec still parses (defaults to
      the prior loopback-TCP-only shape — back-compat).
- [x] 2.2 (green) Add the **listen specification** (direct loopback-TCP ingress + optional dedicated
      serve ingress on its own port, with the secrets dir layout) to `packages/shared/src/config.ts`,
      defaulting to the loopback-TCP-only shape, and export from the `@switchboard/shared` barrel
      (`index.ts`). Keep `loadConfig()`'s first-run secure-defaults behaviour intact.

## 3. Server: dedicated serve ingress + dual-listener lifecycle (apps/server)

- [x] 3.1 (red) Extend `apps/server/src/server.test.ts` (using the 1.1 helper): `start(ctx)` with a
      **dedicated serve** listen spec listens on its own loopback-TCP port and serves `/health` `200`
      **on it**, distinct from the direct port; with either spec it stays loopback-only (no
      non-loopback bind); `close()` releases **every** listener's port.
- [x] 3.2 (green) Implement the listen spec in `apps/server/src/server.ts`: build **one Node server
      per ingress** fronting the same Hono app, each on its own loopback-TCP port; `close()` releases
      every listener. Keep `ServerHandle.url` reporting the loopback URL when a direct ingress is
      present.

## 4. Server: ingress-scoped identity trust on the auth gate (apps/server)

- [x] 4.1 (red) Extend `apps/server/src/auth.test.ts`: the auth gate trusts a serve identity **only on
      the dedicated serve ingress** — an allowlisted identity on the serve port is admitted without a
      bearer; a **non-allowlisted** identity on the serve port → `403`; with trust **off** (default)
      identity headers are ignored on **every** ingress. Add the **spoof-close regression**: the
      **same** serve markers + allowlisted login presented on the **direct loopback-TCP** ingress are
      **rejected** unless a valid bearer is present (the direct loopback path is bearer-only).
- [x] 4.2 (green) Parameterise `authMiddleware` (`apps/server/src/auth.ts`) by an **ingress
      identity-trust flag** built per-ingress in `createApp`/`start` (Decision 2/3): the direct
      loopback ingress is bearer-only and never consults `tailscale-user-*`; the dedicated serve
      ingress is identity-eligible with the serve markers kept as defence-in-depth and the allowlist
      check unchanged.
- [x] 4.3 (red) Extend `apps/server/src/auth.test.ts` with the **host-reachable serve-port negative**:
      bind a serve ingress **without** the container-isolation assertion (no no-host-publication
      assertion) and present the **full serve markers + an allowlisted `tailscale-user-login`** on it —
      assert the identity is **not** admitted (those forged markers grant nothing) and a valid bearer
      is still required. This proves identity-eligibility is gated by the isolation assertion, not by
      the headers, even when a serve ingress happens to be reachable from the host.
- [x] 4.4 (green) Thread a **container-isolation assertion** (no host publication) into the per-ingress
      identity-trust flag from 4.2 so a serve ingress is identity-eligible **only** when the runtime
      asserts it is not host-published; a serve ingress bound without that assertion is bearer-only
      (`tailscale-user-*` ignored). Carry the assertion on the listen spec / `RuntimeContext` passed to
      `start(ctx)` (Decision 2/3).

## 5. CLI: config bootstrap (apps/cli)

- [x] 5.1 (red) Write `apps/cli/src/bootstrap.test.ts` (pointing config at a temp dir): bootstrap
      provisions `~/.switchboard` on first run — `config.json` at `600`, the run/secrets dirs at `700`;
      it is **idempotent** over an existing valid config (bearer token intact, only missing pieces
      created); an invalid config refuses with a field-named error.
- [x] 5.2 (green) Implement the bootstrap module in `apps/cli/src/` (wrapping `loadConfig()` from
      `@switchboard/shared/node` and provisioning the run/secrets dirs with secure perms); route
      `switchboard start` through it before serving.
- [x] 5.3 (red) Extend `apps/cli/src/bootstrap.test.ts` with the **unsafe-combo rejection**: a config
      that enables `trustServeIdentity` **together with** a serve ingress is **rejected** at bootstrap
      with a **field-named** error when the runtime does **not** assert no host publication (host /
      non-`--docker`); the **same** config is **accepted** when the runtime asserts container isolation
      (`--docker`); a serve ingress **without** `trustServeIdentity` is accepted on the host
      (bearer-only).
- [x] 5.4 (green) Implement the **mode-aware cross-field validation** in the bootstrap module
      (Decision 3/4): reject `trustServeIdentity` + serve ingress unless the runtime asserts no host
      publication, failing fast with a clear, field-named error before any listener binds; pass the
      runtime's no-host-publication assertion through to `start(ctx)` so the serve ingress is bound
      identity-eligible only under it. (Mode is a bootstrap input; the shared schema stays
      mode-agnostic.)

## 6. CLI: supervised server lifecycle (apps/cli)

- [ ] 6.1 (red) Write `apps/cli/src/supervisor.test.ts` (using the 1.2 seam): a **signal-driven**
      shutdown closes the handle gracefully and does **not** restart; an **unexpected** failure
      restarts with **bounded** backoff; repeated rapid failures past the **give-up ceiling** stop
      restarting and yield a **non-zero** exit; the close releases the ingresses (asserted via the fake
      handle).
- [ ] 6.2 (green) Implement the supervisor module in `apps/cli/src/` (bounded exponential backoff +
      give-up ceiling; SIGINT/SIGTERM → graceful close with no restart; calls the injected
      server-starter), and wire `switchboard start` = bootstrap → supervisor.

## 7. CLI: `--docker` mode bring-up (apps/cli)

- [ ] 7.1 (red) Write `apps/cli/src/docker.test.ts` (using the 1.3 runner fake): `start --docker`
      invokes, **in order**, `tailscaled` (userspace) → `tailscale up` (mounted auth key) → `start(ctx)`
      on the **dedicated serve ingress** → `tailscale serve` with the **pinned argv** `--bg
      --https=443 http://127.0.0.1:<servePort>`; assert the bring-up **checks the Tailscale version**
      and refuses when below the pinned minimum (**v1.50.0**); a shutdown signal is **forwarded to
      `tailscaled`**; both `tailscaled` and the server are supervised.
- [ ] 7.2 (green) Implement the docker-orchestration module in `apps/cli/src/` (the in-container
      supervisor; the pinned `tailscale serve --bg --https=443 http://127.0.0.1:<servePort>`
      invocation gated on a **>= v1.50.0** version assertion), dispatched when `start --docker` is
      given; reuse the 6.2 supervisor for the server and supervise `tailscaled` as a child.

## 8. CLI: packaged-CLI smoke test extension (build the cli first)

- [ ] 8.1 Extend `apps/cli/src/cli.smoke.test.ts` to also assert `/health` **on the dedicated serve
      ingress**: start the **built** bin with a listen spec that includes a serve port (a second
      loopback-TCP port) and `fetch`/request `/health` on it → `200`, alongside the existing
      `--version` and loopback `/health` cases. The smoke test runs on the **host**, so the serve port
      is host-reachable: it MUST run with **`trustServeIdentity` disabled (bearer-only)** — the
      host-reachable serve port is **not** identity-eligible, and forged `tailscale-user-*` markers on
      it grant nothing (bearer still required). **Build first** (CLAUDE.md / Decision 8): `pnpm
      --filter @switchboard/cli build` (which requires `@switchboard/shared` + `@switchboard/server`
      built), then `pnpm --filter @switchboard/cli test`.

## 9. Ops: production Dockerfile + runtime image (productionize the spike)

- [ ] 9.1 Author the production `Dockerfile` (productionizing `spikes/runtime/`): base matching the
      repo Node engine, with `tailscale` + `tmux` + `git` + `ca-certificates`; bundle the built CLI;
      `ENTRYPOINT` runs `switchboard start --docker`; publish **no** API port; document the userspace
      default and the kernel-TUN fallback (`--cap-add=NET_ADMIN --device=/dev/net/tun`); declare the
      named-volume mount points (tailscale state, `~/.switchboard`, `~/.claude`) and the mounted
      secrets (GitHub PAT, Tailscale auth key). (Real bring-up is validated by the manual runtime check
      in task 11.1, not CI.)

## 10. Docs: planned-architecture overlay + runtime guide + README (docs-migration rows)

- [ ] 10.1 Author `docs/dev/Architecture/Planned/runtime-cli-docker.c4`: `extend` `Switchboard.Cli`
      with its orchestration/supervision role (config bootstrap, supervised `start(ctx)`, `--docker`
      bring-up of `tailscaled` + `tailscale serve`) and realise the `Tailscale -> Switchboard.Api`
      serve ingress **over the dedicated loopback serve port**; tag every addition `#todo`; prefix view
      ids `runtime-cli-docker-*`;
      list the added element/view ids in `plan.md`; validate with `pnpm --dir site exec likec4 validate
      --no-layout ../docs/dev/Architecture`. (The Architecture review checkpoint fires when this lands.)
- [ ] 10.2 Author `docs/user/running-switchboard.md` (docs-migration `author →` row): npm install +
      local `switchboard start`; the Docker run (image, named volumes, mounted PAT + auth-key secrets,
      userspace vs kernel-TUN); Tailscale prerequisites (auth key, MagicDNS + HTTPS certs for `tailscale
      serve`); the **in-container `claude` login + `~/.claude` volume** credential strategy (macOS
      keychain caveat); and the dedicated serve-ingress vs bearer-loopback access model.
- [ ] 10.3 Merge into `README.md` (docs-migration `merge →` row): the **npm distribution** install path
      (`npx switchboard` / `npm i -g`) and a "run on the tailnet (Docker)" pointer to
      `docs/user/running-switchboard.md`.

## 11. Verification gate

- [ ] 11.1 Run `just test`, `just lint`, `just typecheck`, then `just build` + `just e2e` — all green;
      perform the **manual runtime check** following `docs/user/running-switchboard.md` (Docker +
      userspace Tailscale bring-up, `tailscale serve` → the dedicated loopback serve port, in-container
      `claude` login + `~/.claude`
      volume, restart-without-re-auth); confirm prettier-clean and that `openspec validate
      runtime-cli-docker --strict` passes.
