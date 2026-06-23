import { describe, expect, it } from 'vitest';
import {
  abortRequestSchema,
  cloneRequestSchema,
  operationStatusSchema,
  parseRepoTarget,
  repoListResponseSchema,
} from './repos';
import { configSchema } from './config';

/**
 * Failing-first schema tests (task 2.1) for the repo-clone-browse contracts: the owner/repo
 * clone-target parser (full URL, optional `.git`, bare `owner/repo`; traversal/charset rejected),
 * the owner-aware repo-list response, the clone/operation-status response, the abort
 * request/response, and the `github` config slot replacing the reserved `z.null()`.
 */
describe('parseRepoTarget (Decision 5)', () => {
  it('parses a full GitHub URL', () => {
    expect(parseRepoTarget('https://github.com/nick-boey/switchboard')).toEqual({
      owner: 'nick-boey',
      repo: 'switchboard',
    });
  });

  it('strips an optional trailing .git (the clone-dialog shape)', () => {
    expect(parseRepoTarget('https://github.com/acme/widget-factory.git')).toEqual({
      owner: 'acme',
      repo: 'widget-factory',
    });
  });

  it('parses a bare owner/repo', () => {
    expect(parseRepoTarget('octocat/Hello-World')).toEqual({
      owner: 'octocat',
      repo: 'Hello-World',
    });
  });

  it('rejects traversal and out-of-charset and extra-segment input', () => {
    expect(parseRepoTarget('../../etc/passwd')).toBeNull();
    expect(parseRepoTarget('a/..')).toBeNull();
    expect(parseRepoTarget('./repo')).toBeNull();
    expect(parseRepoTarget('own er/repo')).toBeNull();
    expect(parseRepoTarget('owner/re@po')).toBeNull();
    expect(parseRepoTarget('owner/repo/extra')).toBeNull();
    expect(parseRepoTarget('')).toBeNull();
  });
});

describe('cloneRequestSchema', () => {
  it('accepts a valid target and exposes the parsed owner/repo/repoId', () => {
    const result = cloneRequestSchema.safeParse({ target: 'https://github.com/acme/infra.git' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ owner: 'acme', repo: 'infra', repoId: 'acme/infra' });
    }
  });

  it('rejects an out-of-charset or traversal target', () => {
    expect(cloneRequestSchema.safeParse({ target: '../evil' }).success).toBe(false);
    expect(cloneRequestSchema.safeParse({ target: 'a@b/c' }).success).toBe(false);
  });
});

describe('repoListResponseSchema (owner-aware)', () => {
  it('accepts the ok variant with selectable owners and owner-carrying repositories', () => {
    const result = repoListResponseSchema.safeParse({
      status: 'ok',
      owners: [
        { login: 'nick-boey', kind: 'user' },
        { login: 'acme', kind: 'organisation' },
      ],
      repositories: [
        { owner: 'nick-boey', name: 'switchboard' },
        { owner: 'acme', name: 'infra' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts the typed non-ok states', () => {
    expect(repoListResponseSchema.safeParse({ status: 'not-configured' }).success).toBe(true);
    expect(repoListResponseSchema.safeParse({ status: 'unauthorized' }).success).toBe(true);
    expect(
      repoListResponseSchema.safeParse({ status: 'rate-limited', resetAt: '2026-01-01T00:00:00Z' })
        .success,
    ).toBe(true);
    expect(repoListResponseSchema.safeParse({ status: 'not-found' }).success).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(repoListResponseSchema.safeParse({ status: 'boom' }).success).toBe(false);
  });
});

describe('operationStatusSchema', () => {
  it('accepts each clone state and a typed error', () => {
    expect(
      operationStatusSchema.safeParse({ repoId: 'a/b', operationId: 'op1', status: 'cloning' })
        .success,
    ).toBe(true);
    expect(
      operationStatusSchema.safeParse({ repoId: 'a/b', operationId: 'op1', status: 'ready' })
        .success,
    ).toBe(true);
    expect(
      operationStatusSchema.safeParse({
        repoId: 'a/b',
        operationId: 'op1',
        status: 'error',
        error: { kind: 'not-found' },
      }).success,
    ).toBe(true);
    expect(
      operationStatusSchema.safeParse({ repoId: 'a/b', operationId: 'op1', status: 'aborted' })
        .success,
    ).toBe(true);
  });

  it('rejects an unknown clone state or error kind', () => {
    expect(
      operationStatusSchema.safeParse({ repoId: 'a/b', operationId: 'op1', status: 'pending' })
        .success,
    ).toBe(false);
    expect(
      operationStatusSchema.safeParse({
        repoId: 'a/b',
        operationId: 'op1',
        status: 'error',
        error: { kind: 'explosion' },
      }).success,
    ).toBe(false);
  });
});

describe('abortRequestSchema', () => {
  it('accepts a well-formed repoId', () => {
    expect(abortRequestSchema.safeParse({ repoId: 'acme/infra' }).success).toBe(true);
  });

  it('rejects a malformed repoId', () => {
    expect(abortRequestSchema.safeParse({ repoId: '../evil' }).success).toBe(false);
    expect(abortRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('github config slot', () => {
  it('treats unset/null as disabled (backward compatible)', () => {
    expect(configSchema.parse({ bearerToken: 'x' }).github).toBeNull();
    expect(configSchema.parse({ bearerToken: 'x', github: null }).github).toBeNull();
  });

  it('accepts a configured PAT and defaults the API base URL', () => {
    const parsed = configSchema.parse({ bearerToken: 'x', github: { token: 'ghp_abc' } });
    expect(parsed.github).toEqual({ token: 'ghp_abc', apiBaseUrl: 'https://api.github.com' });
  });

  it('rejects an empty token', () => {
    expect(configSchema.safeParse({ bearerToken: 'x', github: { token: '' } }).success).toBe(false);
  });
});
