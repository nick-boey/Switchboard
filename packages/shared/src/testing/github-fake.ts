import { Hono } from 'hono';

/**
 * Deterministic fake of the slice of the GitHub REST API the `github-repos` service consumes
 * (task 1.1). Built as a Hono app so it is usable two ways with no code duplication:
 *
 * - **Vitest** — inject `fake.fetch` as the provider's `fetch` seam (no socket needed); the
 *   provider talks to the in-memory app directly.
 * - **Playwright** — `await fake.listen()` binds it to a loopback port and the booted server's
 *   `github.apiBaseUrl` config points at that URL.
 *
 * It serves exactly three endpoints — `GET /user`, `GET /user/orgs`, `GET /user/repos` — with
 * cursor pagination via a synthetic `Link: rel="next"` header, and can be told to fail every
 * request with `401`, a `403` rate-limit (carrying `x-ratelimit-*`), or `404` so the provider's
 * typed-error mapping and the no-leak guarantee can be exercised. Error responses carry a
 * realistic JSON body so a no-leak test can prove the body is never surfaced.
 */

/** A repository the fake reports, owned by a user or an organisation. */
export interface FakeGitHubRepo {
  owner: string;
  name: string;
}

/** Forced-failure modes the fake can be put into (every endpoint returns the error). */
export type FakeGitHubFailure =
  | { status: 401 }
  | { status: 403; resetAt: number }
  | { status: 404 };

export interface FakeGitHubFixtures {
  /** The authenticated user's login (`GET /user`). */
  login: string;
  /** Organisations the user belongs to (`GET /user/orgs`). */
  organisations: string[];
  /** Repositories the PAT can access, each carrying its owner (`GET /user/repos`). */
  repositories: FakeGitHubRepo[];
  /** The bearer token the fake accepts; any other (or none) yields `401`. */
  token: string;
  /** Page size, kept small (default 2) so small fixtures still exercise pagination. */
  pageSize?: number;
  /** When set, every endpoint returns this failure instead of data. */
  fail?: FakeGitHubFailure;
}

/** A realistic GitHub error body so a no-leak test can prove it is never surfaced. */
const ERROR_BODY = {
  message: 'fake-github-error: this body must never be surfaced or logged',
  documentation_url: 'https://docs.github.com/rest',
};

function authorized(header: string | undefined, token: string): boolean {
  if (!header) return false;
  // GitHub accepts `Bearer <pat>` (fine-grained) and the legacy `token <pat>`; accept both.
  const m = /^(?:Bearer|token)\s+(.+)$/i.exec(header.trim());
  return m?.[1] === token;
}

/** Build a `Link` header pointing at the next page of `path`, preserving existing query params. */
function nextLink(path: string, query: URLSearchParams, nextPage: number): string {
  const params = new URLSearchParams(query);
  params.set('page', String(nextPage));
  return `<http://github.fake${path}?${params.toString()}>; rel="next"`;
}

/** Slice `items` to the requested 1-based page and report whether a further page exists. */
function paginate<T>(
  items: readonly T[],
  query: URLSearchParams,
  pageSize: number,
): { page: T[]; hasNext: boolean; nextPage: number } {
  const page = Math.max(1, Number(query.get('page') ?? '1'));
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return { page: slice, hasNext: start + pageSize < items.length, nextPage: page + 1 };
}

export interface FakeGitHub {
  /** Fetch-compatible handler for in-process (Vitest) use. */
  fetch: (input: Request | string | URL, init?: RequestInit) => Promise<Response>;
  /** Bind to a loopback port for Playwright; resolves the base URL + a close hook. */
  listen: () => Promise<{ url: string; close: () => Promise<void> }>;
  /** The fixtures the fake was built from (read-only convenience for assertions). */
  fixtures: FakeGitHubFixtures;
}

/** Create a fake GitHub REST API from the given fixtures (task 1.1). */
export function createFakeGitHub(fixtures: FakeGitHubFixtures): FakeGitHub {
  const pageSize = fixtures.pageSize ?? 2;
  const app = new Hono();

  app.use('*', async (c, next) => {
    if (fixtures.fail) {
      const { fail } = fixtures;
      if (fail.status === 403) {
        return c.json(ERROR_BODY, 403, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(fail.resetAt),
        });
      }
      return c.json(ERROR_BODY, fail.status);
    }
    if (!authorized(c.req.header('authorization'), fixtures.token)) {
      return c.json(ERROR_BODY, 401);
    }
    return next();
  });

  app.get('/user', (c) => c.json({ login: fixtures.login }));

  app.get('/user/orgs', (c) => {
    const query = new URLSearchParams(new URL(c.req.url).search);
    const orgs = fixtures.organisations.map((login) => ({ login }));
    const { page, hasNext, nextPage } = paginate(orgs, query, pageSize);
    const headers = hasNext ? { Link: nextLink('/user/orgs', query, nextPage) } : undefined;
    return c.json(page, 200, headers);
  });

  app.get('/user/repos', (c) => {
    const query = new URLSearchParams(new URL(c.req.url).search);
    const repos = fixtures.repositories.map((r) => ({
      name: r.name,
      owner: { login: r.owner },
    }));
    const { page, hasNext, nextPage } = paginate(repos, query, pageSize);
    const headers = hasNext ? { Link: nextLink('/user/repos', query, nextPage) } : undefined;
    return c.json(page, 200, headers);
  });

  return {
    fetch: (input, init) => Promise.resolve(app.request(input as never, init)),
    fixtures,
    listen: async () => {
      // `@hono/node-server` is a server/dev dependency; imported lazily so the in-process
      // `fetch` path (the common case) never pulls a socket implementation into the bundle.
      const { serve } = await import('@hono/node-server');
      const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
        const s = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, () => resolve(s));
      });
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      return {
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
      };
    },
  };
}
