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
 * The auth gate (design Decision 3), reject-by-default. Applied to every protected route;
 * `/health` is exempt (it is mounted before this middleware and also short-circuited here).
 *
 * Decision 3 rules:
 * - The security boundary is network isolation, not the headers: the serve markers
 *   (`tailscale-user-login` + `tailscale-headers-info` + CGNAT `x-forwarded-for`) only
 *   SELECT the identity path; they do not PROVE identity.
 * - Identity is trusted ONLY when `trustServeIdentity` is enabled AND the markers are
 *   present. An allowlisted identity is then admitted without a bearer token; a
 *   non-allowlisted one is forbidden (403).
 * - The bearer path is always available and is the ONLY path when trust is off.
 * - When trust is off (the default), `tailscale-user-*` headers are ignored entirely
 *   regardless of the markers — the spoof-safe default.
 */
export function authMiddleware(ctx: RuntimeContext): MiddlewareHandler<AppEnv> {
  const cfg = ctx.config;
  return async (c, next) => {
    if (c.req.path === '/health') return next();

    const login = c.req.header('tailscale-user-login');
    const headersInfo = c.req.header('tailscale-headers-info');
    const forwardedFor = c.req.header('x-forwarded-for');
    const hasServeMarkers = Boolean(login && headersInfo && isCgnatAddress(forwardedFor));

    // Identity path — only when trust is enabled AND the markers select it.
    if (cfg.trustServeIdentity && hasServeMarkers) {
      if (login && cfg.identityAllowlist.includes(login)) {
        c.set('identity', { login, source: 'serve' });
        return next();
      }
      return c.json({ error: 'forbidden' }, 403);
    }

    // Bearer path — always available; the only path when trust is off. `tailscale-user-*`
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
