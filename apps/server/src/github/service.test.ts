import { describe, expect, it } from 'vitest';
import { configSchema } from '@switchboard/shared';
import { createFakeGitHub } from '@switchboard/shared/testing';
import { makeServerTestContext } from '../testing/operation-scaffolding.js';
import { createPatGitHubProvider } from './provider.js';
import { listGitHubRepos } from './service.js';

/**
 * Failing-first tests (task 4.1) for the github-repos service: the `not-configured` state when no
 * PAT is set, and the typed-error → response-union mapping (no GitHub body surfaced).
 */
describe('listGitHubRepos service', () => {
  const token = 'ghp_test_pat';

  function ctxWithGithub() {
    return makeServerTestContext({
      config: configSchema.parse({
        bearerToken: 'x',
        github: { token, apiBaseUrl: 'http://github.fake' },
      }),
    }).ctx;
  }

  it('reports not-configured when no PAT is set (no GitHub request attempted)', async () => {
    const { ctx } = makeServerTestContext();
    expect(await listGitHubRepos(ctx)).toEqual({ status: 'not-configured' });
  });

  it('returns the owner-aware ok response from a configured PAT', async () => {
    const fake = createFakeGitHub({
      login: 'nick-boey',
      organisations: ['acme'],
      repositories: [{ owner: 'acme', name: 'infra' }],
      token,
    });
    const result = await listGitHubRepos(ctxWithGithub(), { fetch: fake.fetch });
    expect(result).toEqual({
      status: 'ok',
      owners: [
        { login: 'nick-boey', kind: 'user' },
        { login: 'acme', kind: 'organisation' },
      ],
      repositories: [{ owner: 'acme', name: 'infra' }],
    });
  });

  it('maps an unauthorized provider error onto the response union', async () => {
    const fake = createFakeGitHub({
      login: 'nick-boey',
      organisations: [],
      repositories: [],
      token,
      fail: { status: 401 },
    });
    const result = await listGitHubRepos(ctxWithGithub(), {
      provider: createPatGitHubProvider({
        token,
        apiBaseUrl: 'http://github.fake',
        fetch: fake.fetch,
      }),
    });
    expect(result).toEqual({ status: 'unauthorized' });
  });
});
