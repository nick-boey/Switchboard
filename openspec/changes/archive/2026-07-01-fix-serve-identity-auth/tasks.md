## 1. Regression tests (red)

- [x] 1.1 In `apps/server/src/auth.test.ts`, add a failing test: on the dedicated serve ingress
      (`serveApp` with `trustServeIdentity: true`, `identityAllowlist: ['nick-boey@github']`,
      container-isolated), a request carrying ONLY `tailscale-user-login: nick-boey@github` —
      **no** `tailscale-headers-info`, **no** `x-forwarded-for`, **no** `Authorization` (the shape a
      real `tailscale serve` produces) — is admitted (`200`). Fails today with `401`.
- [x] 1.2 In `apps/server/src/auth.test.ts`, add a failing test for bearer precedence on the serve
      ingress: a request on the identity-eligible serve ingress carrying a **valid bearer token**
      AND a `tailscale-user-login` that is NOT allowlisted is admitted (`200`, bearer path) — a
      non-allowlisted login must not shadow a valid bearer. (Covers the Codex precedence finding.)
- [x] 1.3 In `apps/server/src/auth.test.ts`, add a failing test for the lockout signal: on the
      identity-eligible serve ingress, a request whose `tailscale-user-login` is NOT allowlisted
      AND carries no valid bearer gets `403` AND the injected `ctx.logger.warn` is called with the
      rejected login (assert via a spy logger from `makeTestContext`). No bearer token or secret
      appears in the log call.
- [x] 1.4 In `apps/web/src/repos/NewRepository.test.tsx` (co-located), add a failing test: when the
      `['github-repos']` query rejects (mock `client.api.repos.github.$get` to return a non-OK
      response / throw), the New repository view renders an explicit error state with a retry
      affordance — NOT the `data-testid="github-loading"` "Connecting to GitHub…" card.

## 2. Fix (green)

- [x] 2.1 In `apps/server/src/auth.ts`, drop the `hasServeMarkers` hard gate and implement
      **bearer-preserving precedence** on an identity-eligible ingress, in this order: (a) read
      `tailscale-user-login`; if present AND in `cfg.identityAllowlist` → admit with `source: 'serve'`;
      (b) otherwise attempt the bearer path — a valid bearer token → admit with `source: 'bearer'`
      (unchanged); (c) if no valid bearer AND a `tailscale-user-login` was present but not
      allowlisted → `ctx.logger.warn` naming the login and respond `403`; (d) otherwise `401`. No
      dependence on `tailscale-headers-info` or a CGNAT `x-forwarded-for`. The direct loopback
      ingress stays bearer-only and unchanged.
- [x] 2.2 In `apps/web/src/repos/NewRepository.tsx`, thread the query's `isError`/`error` (and a
      `refetch`) into `NewRepositoryView`, and render an error state (with retry) when the repo-list
      fetch errors — a branch distinct from the connecting (`listing === undefined && !isError`)
      and not-configured states. Update any existing `NewRepository` stories to cover the new state.

## 3. Cleanup, reconcile & docs

- [x] 3.1 Remove the now-dead marker plumbing so `noUnusedLocals` stays clean: delete
      `isCgnatAddress` (and its `x-forwarded-for` read) from `apps/server/src/auth.ts` if unused
      after 2.1. Reconcile other tests that assert the phantom marker — the `serveMarkers` helper in
      `auth.test.ts` (keep an all-markers-present case green to prove markers-present still works)
      and any `tailscale-headers-info` reference in `apps/cli/src/cli.smoke.test.ts`.
- [x] 3.2 Update `docs/user/running-switchboard.md`: correct the serve-identity notes to drop the
      non-existent `tailscale-headers-info`/CGNAT-`x-forwarded-for` markers, note that a valid bearer
      still works on the serve URL, and note that a non-allowlisted login is now logged (so an
      operator sees why they are `403`'d). Keep the existing "add your tailnet login to
      `identityAllowlist`" step.
- [x] 3.3 Run `just test`, `just lint`, and `just typecheck` — all green; the four regression
      tests from section 1 now pass.
