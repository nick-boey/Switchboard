import { describe, expect, it } from 'vitest';
import { createFakeGitHub, type FakeGitHubFixtures } from '@switchboard/shared/testing';
import { createPatGitHubProvider, GitHubError, type GitHubProvider } from './provider.js';

/**
 * Failing-first tests for the `github-repos` provider (task 4.1) against the group-1.1 fake:
 * the authenticated account + orgs as selectable owners, owner-carrying repositories, pagination
 * via `Link: rel="next"`, typed errors (401/403-rate-limit/404) with no GitHub error body
 * surfaced, and the OAuth-ready provider seam.
 */
describe('PAT GitHub provider (github-repos)', () => {
  const token = 'ghp_test_pat';

  function provider(overrides: Partial<FakeGitHubFixtures> = {}): GitHubProvider {
    const fake = createFakeGitHub({
      login: 'nick-boey',
      organisations: ['acme', 'octocat', 'globex'],
      repositories: [
        { owner: 'nick-boey', name: 'switchboard' },
        { owner: 'nick-boey', name: 'dotfiles' },
        { owner: 'acme', name: 'widget-factory' },
        { owner: 'acme', name: 'infra' },
        { owner: 'octocat', name: 'Hello-World' },
      ],
      token,
      pageSize: 2,
      ...overrides,
    });
    return createPatGitHubProvider({ token, apiBaseUrl: 'http://github.fake', fetch: fake.fetch });
  }

  it('exposes the authenticated account and organisations as selectable owners', async () => {
    const listing = await provider().listResources();
    expect(listing.owners).toContainEqual({ login: 'nick-boey', kind: 'user' });
    expect(listing.owners).toContainEqual({ login: 'acme', kind: 'organisation' });
    expect(listing.owners).toContainEqual({ login: 'globex', kind: 'organisation' });
  });

  it('aggregates owner-carrying repositories across all pages', async () => {
    const listing = await provider().listResources();
    // 5 repos at pageSize 2 ⇒ 3 pages followed via Link.
    expect(listing.repositories).toHaveLength(5);
    expect(listing.repositories).toContainEqual({ owner: 'nick-boey', name: 'dotfiles' });
    expect(listing.repositories).toContainEqual({ owner: 'octocat', name: 'Hello-World' });
  });

  it('scopes repositories to the authenticated account (distinct from org repos)', async () => {
    const personal = await provider().listRepositories('nick-boey');
    expect(personal).toEqual([
      { owner: 'nick-boey', name: 'switchboard' },
      { owner: 'nick-boey', name: 'dotfiles' },
    ]);
  });

  it('scopes repositories to a specific organisation', async () => {
    const acme = await provider().listRepositories('acme');
    expect(acme).toEqual([
      { owner: 'acme', name: 'widget-factory' },
      { owner: 'acme', name: 'infra' },
    ]);
  });

  it('maps 401 to a typed unauthorized error with no GitHub body', async () => {
    try {
      await provider({ fail: { status: 401 } }).listResources();
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GitHubError);
      expect((err as GitHubError).kind).toBe('unauthorized');
      expect((err as GitHubError).message).not.toContain('fake-github-error');
    }
  });

  it('maps 403 rate-limit to a typed error carrying the reset', async () => {
    const resetAt = 1_900_000_000;
    try {
      await provider({ fail: { status: 403, resetAt } }).listResources();
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GitHubError);
      expect((err as GitHubError).kind).toBe('rate-limited');
      expect((err as GitHubError).resetAt).toBe(new Date(resetAt * 1000).toISOString());
    }
  });

  it('maps a non-rate-limit 403 (fine-grained PAT scope/resource denial, quota remaining) to unauthorized', async () => {
    try {
      await provider({ fail: { status: 403, forbidden: true } }).listResources();
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GitHubError);
      // A 403 that still has quota is an authorization failure, NOT a rate limit.
      expect((err as GitHubError).kind).toBe('unauthorized');
      expect((err as GitHubError).resetAt).toBeUndefined();
      // The GitHub error body is never read or surfaced.
      expect((err as GitHubError).message).not.toContain('fake-github-error');
    }
  });

  it('maps 404 to a typed not-found error with no GitHub body', async () => {
    try {
      await provider({ fail: { status: 404 } }).listResources();
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GitHubError);
      expect((err as GitHubError).kind).toBe('not-found');
      expect((err as GitHubError).message).not.toContain('fake-github-error');
    }
  });
});
