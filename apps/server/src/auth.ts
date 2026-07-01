import { timingSafeEqual } from 'node:crypto';
import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';
import type { RuntimeContext } from '@switchboard/shared';
import type { AppEnv } from './app.js';

/** Constant-time credential comparison (avoids leaking the token via timing). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * The bind-time, ingress-scoped identity-trust flag (`runtime-cli-docker` Decision 3). Whether a
 * request MAY be admitted as a serve identity is a property of WHICH listener accepted the
 * connection, fixed when the ingress is bound — NOT anything inferred from a request header. The
 * auth middleware is parameterised by this per-ingress flag (one app per ingress, design
 * Decision 2), so a forged `tailscale-user-*` header on a non-eligible ingress can never flip the
 * trust decision.
 */
export interface IngressTrust {
  /**
   * `true` ONLY on the dedicated serve ingress when `trustServeIdentity` is enabled AND the
   * runtime asserts no host publication (container isolation). `false` everywhere else — the
   * direct/local loopback-TCP ingress is ALWAYS bearer-only.
   */
  identityEligible: boolean;
}

/** The direct/local loopback-TCP ingress: never identity-eligible (bearer-only, Decision 3). */
export const DIRECT_INGRESS_TRUST: IngressTrust = { identityEligible: false };

/**
 * Compute the dedicated serve ingress's bind-time identity eligibility (`runtime-cli-docker`
 * Decision 3): `trustServeIdentity ∧ runtime-asserts-no-host-publication`. The "is-serve-ingress"
 * conjunct is implied — this is only ever applied to the serve ingress. A serve ingress bound
 * WITHOUT the no-host-publication assertion (a host-reachable serve port) is therefore bearer-only
 * and never identity-eligible, so enabling `trustServeIdentity` cannot make a host-reachable serve
 * port admit a forged identity. (Pairing the two outside that runtime is also rejected fail-fast at
 * CLI bootstrap — see `app-runtime` config validation.)
 */
export function serveIngressTrust(ctx: RuntimeContext): IngressTrust {
  return {
    identityEligible: ctx.config.trustServeIdentity && (ctx.assertNoHostPublication ?? false),
  };
}

/**
 * The auth gate (foundations Decision 3), reject-by-default. Applied to every protected route;
 * `/health` is exempt (it is mounted before this middleware and also short-circuited here).
 *
 * Rules (`runtime-cli-docker` Decision 3 hardens foundations Decision 3):
 * - **Identity eligibility is the bind-time `ingress` flag, not the headers.** The identity path
 *   is consulted ONLY when `ingress.identityEligible` is true (i.e. this is the dedicated serve
 *   ingress, with trust enabled and the runtime asserting no host publication). Admission then
 *   depends solely on an allowlisted `tailscale-user-login` — the one identity header `tailscale
 *   serve` actually injects. No other "serve marker" is required (real serve does not emit a
 *   `tailscale-headers-info` header, nor a CGNAT forwarding address here), so a genuine tokenless
 *   served-SPA request is admitted rather than wrongly rejected.
 * - On an identity-eligible ingress an allowlisted identity is admitted without a bearer token; a
 *   present-but-non-allowlisted identity (with no valid bearer) is forbidden (403) and logged.
 * - The bearer path is always available — the ONLY path on every non-eligible ingress, and kept
 *   ahead of the identity 403 on the eligible one so a valid bearer is never shadowed. On a
 *   non-eligible ingress `tailscale-user-*` headers are never consulted, so forged identity
 *   headers admit nothing.
 */
export function authMiddleware(
  ctx: RuntimeContext,
  ingress: IngressTrust = DIRECT_INGRESS_TRUST,
): MiddlewareHandler<AppEnv> {
  const cfg = ctx.config;
  return async (c, next) => {
    if (c.req.path === '/health') return next();

    // Identity path — admitted purely on the bind-time ingress property plus an allowlisted
    // `tailscale-user-login` (the sole identity header `tailscale serve` actually injects). No
    // dependence on a `tailscale-headers-info` header (serve does not emit one) or a CGNAT
    // `x-forwarded-for`, so a real tokenless served-SPA request is admitted rather than 401'd.
    const login = ingress.identityEligible ? c.req.header('tailscale-user-login') : undefined;
    if (login && cfg.identityAllowlist.includes(login)) {
      c.set('identity', { login, source: 'serve' });
      return next();
    }

    // Bearer path — always available; the only path on a non-eligible ingress. Kept ahead of any
    // identity denial so a valid bearer token is never shadowed by a non-allowlisted serve login.
    // `tailscale-user-*` headers are never consulted here, so forged identity headers admit nothing.
    const authorization = c.req.header('authorization');
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;
    if (token && safeEqual(token, cfg.bearerToken)) {
      c.set('identity', { login: null, source: 'bearer' });
      return next();
    }

    // A present-but-non-allowlisted serve login (with no valid bearer) is forbidden, and logged so
    // an operator can see they must add it to `identityAllowlist` — the login is not a secret.
    if (login) {
      ctx.logger.warn('serve identity not in allowlist; denying request', { login });
      return c.json({ error: 'forbidden' }, 403);
    }

    return c.json({ error: 'unauthorized' }, 401);
  };
}

/**
 * Strict CORS (design Decision 3): grant only same-origin/configured origins — never a
 * wildcard — and never block non-browser requests that carry no `Origin` header (those fall
 * through to the auth rules above).
 */
export function corsMiddleware(ctx: RuntimeContext): MiddlewareHandler<AppEnv> {
  const allowedOrigins = ctx.config.cors.allowedOrigins;
  return cors({
    // Return the origin to allow it; return null/'' to omit the allow-origin header so the
    // browser denies the cross-origin request / preflight.
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  });
}
