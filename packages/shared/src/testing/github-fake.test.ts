import { describe, expect, it } from 'vitest';
import { createFakeGitHub } from './github-fake.js';

/**
 * Smoke test for the fake GitHub REST layer (task 1.1): pagination via the synthetic `Link`
 * header and each error shape (`401`, `403` rate-limit with reset, `404`). Behaviour the
 * `github-repos` provider tests (group 4) and the Playwright run (group 9) depend on.
 */
describe('fake GitHub REST layer', () => {
  const token = 'fake-pat';
  const base = 'http://github.fake';

  function fake(overrides: Partial<Parameters<typeof createFakeGitHub>[0]> = {}) {
    return createFakeGitHub({
      login: 'nick-boey',
      organisations: ['acme', 'octocat', 'globex'],
      repositories: [
        { owner: 'nick-boey', name: 'switchboard' },
        { owner: 'acme', name: 'widget-factory' },
        { owner: 'acme', name: 'infra' },
      ],
      token,
      pageSize: 2,
      ...overrides,
    });
  }

  const auth = { headers: { authorization: `Bearer ${token}` } };

  it('returns the authenticated user', async () => {
    const res = await fake().fetch(`${base}/user`, auth);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ login: 'nick-boey' });
  });

  it('paginates orgs via a Link: rel="next" header', async () => {
    const f = fake();
    const first = await f.fetch(`${base}/user/orgs`, auth);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual([{ login: 'acme' }, { login: 'octocat' }]);
    const link = first.headers.get('link');
    expect(link).toMatch(/rel="next"/);
    expect(link).toMatch(/page=2/);

    const second = await f.fetch(`${base}/user/orgs?page=2`, auth);
    expect(await second.json()).toEqual([{ login: 'globex' }]);
    expect(second.headers.get('link')).toBeNull();
  });

  it('paginates repos carrying their owner', async () => {
    const f = fake();
    const first = await f.fetch(`${base}/user/repos`, auth);
    expect(await first.json()).toEqual([
      { name: 'switchboard', owner: { login: 'nick-boey' } },
      { name: 'widget-factory', owner: { login: 'acme' } },
    ]);
    expect(first.headers.get('link')).toMatch(/rel="next"/);
  });

  it('rejects a missing or wrong token with 401 and never an empty body', async () => {
    const f = fake();
    const noToken = await f.fetch(`${base}/user`);
    expect(noToken.status).toBe(401);
    const wrong = await f.fetch(`${base}/user`, { headers: { authorization: 'Bearer nope' } });
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).message).toContain('fake-github-error');
  });

  it('fails every request with 403 rate-limit carrying the reset', async () => {
    const resetAt = 1_900_000_000;
    const res = await fake({ fail: { status: 403, resetAt } }).fetch(`${base}/user/repos`, auth);
    expect(res.status).toBe(403);
    expect(res.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(res.headers.get('x-ratelimit-reset')).toBe(String(resetAt));
  });

  it('fails every request with 404', async () => {
    const res = await fake({ fail: { status: 404 } }).fetch(`${base}/user/orgs`, auth);
    expect(res.status).toBe(404);
  });

  it('serves over a loopback socket for the Playwright run', async () => {
    const f = fake();
    const { url, close } = await f.listen();
    try {
      const res = await fetch(`${url}/user`, auth);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ login: 'nick-boey' });
    } finally {
      await close();
    }
  });
});
