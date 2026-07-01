## Why

Run over Docker + Tailscale, the served SPA loads but every `/api` call fails: the home page
shows "Loading your repositories failed" and New repository shows "Connecting to GitHub…"
forever. `just run` is unaffected because it uses the bearer-token path. The served-SPA
identity-authorisation path — the whole point of the `--docker` serve ingress — has never
actually admitted a request.

## Root cause

The served SPA calls `/api` **tokenless**, relying on Tailscale serve identity to authorise
(`apps/web/src/api/config.ts`, `client.ts`). On the server, the serve-identity path is entered
only when `hasServeMarkers` is true, which requires **all three** of `tailscale-user-login` **+
`tailscale-headers-info` + a CGNAT `x-forwarded-for`** (`apps/server/src/auth.ts:88`, `:92`).

**`tailscale serve` does not emit a `tailscale-headers-info` header — it does not exist.** The
only identity headers `tailscale serve` injects are `Tailscale-User-Login`, `Tailscale-User-Name`,
`Tailscale-User-Profile-Pic` (and `Tailscale-App-Capabilities` with `--accept-app-caps`); the
official docs list no `x-forwarded-for` either. So `hasServeMarkers` is **always false** in a real
deployment, the identity path is never entered, and every `/api` request falls through to the
bearer path — which the tokenless SPA cannot satisfy — returning **401**. `/api/repos/cloned`
401s → "Loading your repositories failed"; `/api/repos/github` 401s → the query throws, its data
stays `undefined`, and `NewRepository.tsx:269` cannot distinguish an error from still-loading, so
it renders "Connecting to GitHub…" indefinitely.

This is encoded in the spec too: `api-auth-gate` names the phantom markers
(`spec.md:64-65`) even while its own prose says the markers "are no longer the basis of trust —
the ingress is." The implementation contradicts that intent by making a non-existent marker a hard
gate. The Dockerfile notes this path is "validated by the manual runtime check … not CI", so it
was never exercised against real Tailscale.

A second, latent blocker sits behind the first: `--docker` first-run enables `trustServeIdentity`
but leaves `identityAllowlist` empty by design, so even after the marker fix an operator who has
not added their login is silently `403`'d with no signal (only a generic SPA failure).

## What Changes

1. **Serve-identity gate no longer depends on phantom markers.** On the identity-eligible serve
   ingress (a hardened bind-time property: `trustServeIdentity ∧ assertNoHostPublication`), admit a
   request whose `tailscale-user-login` is in `identityAllowlist`, with no bearer token — without
   requiring `tailscale-headers-info` or a CGNAT `x-forwarded-for`. This aligns the code with the
   requirement's stated design (the ingress is the basis of trust; markers were meant only as
   defence-in-depth). Real markers, when present, may still be checked opportunistically but are
   never required. The direct loopback ingress stays bearer-only and unchanged.

2. **Make the empty-allowlist lockout observable.** When trust is on and a serve request presents a
   `tailscale-user-login` that is not allowlisted, log a clear server-side warning naming the login
   (so the operator knows to add it to `identityAllowlist`) alongside the `403`, instead of failing
   opaquely. (Login is not a redacted value; no secret is logged.)

3. **Surface GitHub fetch failures in the UI.** The New repository screen renders an explicit error
   state when the GitHub repo-list fetch fails, instead of showing "Connecting to GitHub…"
   indefinitely — closing the gap between "still loading" and "errored".

## Capabilities

### Modified Capabilities

- `api-auth-gate`: correct the "Tailscale identity authentication on the serve path" requirement so
  admission depends on the identity-eligible serve ingress + an allowlisted `tailscale-user-login`,
  **not** on a `tailscale-headers-info` marker (which `tailscale serve` never sends) or a CGNAT
  `x-forwarded-for`. Add a regression scenario: a realistic serve request carrying only
  `tailscale-user-login` + an allowlisted login (no bearer) is admitted (today it is wrongly
  `401`'d). Add a requirement/scenario that a non-allowlisted serve identity's `403` is logged
  observably (naming the login) rather than opaque.
- `repo-clone`: extend the New repository screen's error-state requirement so a **failed** GitHub
  repo-list fetch (not only the `not-configured` empty state) surfaces an error state, rather than
  an indefinite connecting/loading state.

## Impact

- **Code**: `apps/server/src/auth.ts` (drop the `hasServeMarkers` hard gate; `isCgnatAddress` may
  become unused; add the not-allowlisted warn log), `apps/server/src/auth.test.ts` (rewrite
  marker-dependent tests, add the "only `tailscale-user-login`" regression and the lockout-log
  case). `apps/web/src/repos/NewRepository.tsx` (thread `isError`/error into the view and render an
  error state).
- **Specs**: `openspec/specs/api-auth-gate/spec.md`, `openspec/specs/repo-clone/spec.md`.
- **Docs**: `docs/user/running-switchboard.md` already documents adding your login to
  `identityAllowlist`; update the serve-identity notes to drop the phantom markers and mention the
  lockout log.
- **Systems**: only the Docker/Tailscale **serve** ingress path. The bearer path, the direct
  loopback ingress, and `just run` are unchanged.
