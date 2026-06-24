import { timingSafeEqual } from 'node:crypto';
import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';
import type { RuntimeContext } from '@switchboard/shared';
import type { AppEnv } from './app.js';

/** Tailscale CGNAT range `100.64.0.0/10` — serve injects a CGNAT `x-forwarded-for`. */
function isCgnatAddress(xff: string | undefined): boolean {
  if (!xff) return false;
  const ip = xff.split(',')[0]?.trim() ?? '';
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 100 && b >= 64 && b <= 127;
}

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
 *   ingress, with trust enabled and the runtime asserting no host publication). The serve markers
 *   (`tailscale-user-login` + `tailscale-headers-info` + CGNAT `x-forwarded-for`) remain a
 *   defence-in-depth check on that ingress but are no longer the basis of trust.
 * - On an identity-eligible ingress an allowlisted identity is admitted without a bearer token; a
 *   non-allowlisted one is forbidden (403).
 * - The bearer path is always available and is the ONLY path on every non-eligible ingress
 *   (including the direct/local loopback ingress always, and any ingress when trust is off).
 *   `tailscale-user-*` headers are never consulted there, so forged identity headers admit nothing.
 */
export function authMiddleware(
  ctx: RuntimeContext,
  ingress: IngressTrust = DIRECT_INGRESS_TRUST,
): MiddlewareHandler<AppEnv> {
  const cfg = ctx.config;
  return async (c, next) => {
    if (c.req.path === '/health') return next();

    const login = c.req.header('tailscale-user-login');
    const headersInfo = c.req.header('tailscale-headers-info');
    const forwardedFor = c.req.header('x-forwarded-for');
    const hasServeMarkers = Boolean(login && headersInfo && isCgnatAddress(forwardedFor));

    // Identity path — only on an identity-eligible ingress (a bind-time property), AND when the
    // serve markers select it as defence-in-depth.
    if (ingress.identityEligible && hasServeMarkers) {
      if (login && cfg.identityAllowlist.includes(login)) {
        c.set('identity', { login, source: 'serve' });
        return next();
      }
      return c.json({ error: 'forbidden' }, 403);
    }

    // Bearer path — always available; the only path on a non-eligible ingress. `tailscale-user-*`
    // headers are never consulted here, so forged identity headers cannot admit a request.
    const authorization = c.req.header('authorization');
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;
    if (token && safeEqual(token, cfg.bearerToken)) {
      c.set('identity', { login: null, source: 'bearer' });
      return next();
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
