import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configSchema } from '@switchboard/shared';
import { createTempGitRepo, type TempGitRepo } from '@switchboard/shared/testing';
import { bareConfigCredentialLines, scanDirForSecret } from '../testing/no-leak.js';
import { makeServerTestContext, type ServerTestContext } from '../testing/operation-scaffolding.js';
import { createGitService } from './git-service.js';
import { cloneUrlFor } from './git-service.js';
import { createGitRunner, type GitRunner } from './git-runner.js';

/**
 * No-leak tests (task 5.3) using the group-1.2 harness. With a configured PAT the clone is wired
 * with the credential helper; cloning a local temp-git remote (so the helper, host-scoped to
 * github.com, never fires) lets us prove the PAT never reaches argv, the bare config, the cloned
 * tree, or telemetry — and that the canonical clone URL is the plain HTTPS URL.
 */
describe('clone no-leak (PAT never escapes)', () => {
  const PAT = 'ghp_secret_pat_must_not_leak_0001';
  let remote: TempGitRepo;
  let fixture: ServerTestContext;
  let recordedArgs: string[];
  let runner: GitRunner;

  beforeEach(() => {
    remote = createTempGitRepo();
    fixture = makeServerTestContext({
      config: configSchema.parse({ bearerToken: 'x', github: { token: PAT } }),
    });
    recordedArgs = [];
    const real = createGitRunner();
    runner = {
      run: (args, options) => {
        recordedArgs = args;
        return real.run(args, options);
      },
    };
  });
  afterEach(() => {
    remote.cleanup();
  });

  it('derives the plain HTTPS clone URL with no embedded credentials', () => {
    expect(cloneUrlFor({ owner: 'acme', repo: 'infra' })).toBe('https://github.com/acme/infra.git');
    expect(cloneUrlFor({ owner: 'acme', repo: 'infra' })).not.toContain(PAT);
  });

  it('keeps the PAT out of process arguments and out of the cloned tree', async () => {
    const service = createGitService(fixture.ctx, { runner });
    const target = { owner: 'acme', repo: 'infra' };
    await service.cloneBare(target, { remoteUrl: remote.path });

    // The credential helper is wired (so the args carry `-c credential.*`)...
    expect(recordedArgs.some((a) => a.startsWith('credential.https://github.com.helper='))).toBe(
      true,
    );
    // ...but the PAT is in none of the args.
    expect(recordedArgs.join(' ')).not.toContain(PAT);
    // And the PAT appears nowhere under the cloned repository.
    expect(scanDirForSecret(service.bareDir(target), PAT)).toEqual([]);
  });

  it('persists no credential-helper entry and no PAT-bearing remote URL in the bare config', async () => {
    const service = createGitService(fixture.ctx, { runner });
    const target = { owner: 'acme', repo: 'infra' };
    await service.cloneBare(target, { remoteUrl: remote.path });

    const lines = bareConfigCredentialLines(service.bareDir(target));
    expect(lines.some((line) => line.startsWith('credential'))).toBe(false);
    expect(lines.join('\n')).not.toContain(PAT);
  });

  it('redacts the PAT, clone URL, absolute paths, and command args from telemetry', async () => {
    const service = createGitService(fixture.ctx, { runner });
    const target = { owner: 'acme', repo: 'infra' };
    await service.cloneBare(target, { remoteUrl: remote.path });

    expect(fixture.telemetry.containsSecret(PAT)).toBe(false);
    // Sensitive attribute values are masked, never surfaced verbatim.
    const values = fixture.telemetry
      .spans()
      .flatMap((span) => Object.values(span.attributes))
      .filter((v): v is string => typeof v === 'string');
    expect(values.some((v) => v.includes(remote.path))).toBe(false);
    expect(values.some((v) => v.includes(service.bareDir(target)))).toBe(false);
  });
});
