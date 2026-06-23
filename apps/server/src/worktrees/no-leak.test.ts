import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configSchema, idForBranch } from '@switchboard/shared';
import { createGitRunner, type GitRunner } from '../repos/git-runner.js';
import { createWorktreeFixture, type WorktreeFixture } from '../testing/worktree-fixture.js';
import { createWorktreeService, type WorktreeService } from './git-worktree.js';

/**
 * No-leak tests for the worktree operations (task 5.2), reusing the redaction-aware telemetry
 * capture from the worktree fixture. A configured PAT wires the credential helper, but the
 * fixture's local remote (not github.com) means the helper never fires — so we prove the PAT
 * never reaches argv, and that no branch name, `<wt-id>`/slug, absolute path, or git args leak
 * into telemetry across create / list / delete.
 */
describe('worktree no-leak (no branch / wt-id / path / args / PAT escapes)', () => {
  const PAT = 'ghp_secret_pat_must_not_leak_wt_0001';
  const branch = 'feature/secret-sauce';
  let fx: WorktreeFixture;
  let recordedArgs: string[][];
  let service: WorktreeService;

  beforeEach(async () => {
    fx = await createWorktreeFixture({
      ctxOverrides: { config: configSchema.parse({ bearerToken: 'x', github: { token: PAT } }) },
    });
    recordedArgs = [];
    const real = createGitRunner();
    const runner: GitRunner = {
      run: (args, options) => real.run(args, options),
      capture: (args, options) => {
        recordedArgs.push(args);
        return real.capture(args, options);
      },
    };
    service = createWorktreeService(fx.ctx, { gitService: fx.gitService, runner });
  });
  afterEach(() => fx.cleanup());

  it('emits worktree telemetry that leaks no branch, wt-id, path, or args', async () => {
    const { wtId } = await service.createWorktree({ target: fx.target, branch, mode: 'new' });
    await service.listWorktrees(fx.target);
    await service.removeWorktree(fx.target, wtId);

    const spans = fx.telemetry.spans();
    // Telemetry IS emitted for the worktree operations...
    expect(spans.some((s) => s.name.startsWith('worktree.'))).toBe(true);
    // ...but it never carries the sensitive values.
    expect(fx.telemetry.containsSecret(branch)).toBe(false);
    expect(fx.telemetry.containsSecret(wtId)).toBe(false);
    expect(fx.telemetry.containsSecret(wtId.split('--')[0])).toBe(false); // the slug

    const values = spans
      .flatMap((s) => Object.values(s.attributes))
      .filter((v): v is string => typeof v === 'string');
    const path = service.worktreePath(fx.target, wtId);
    expect(values.some((v) => v.includes(path))).toBe(false);
    expect(values.some((v) => v.includes(fx.bareDir))).toBe(false);
    // No raw `worktree add … <branch>` git arg string survives unredacted.
    expect(values.some((v) => v.includes('worktree add'))).toBe(false);
  });

  it('keeps the PAT out of process arguments for an existing-remote fetch', async () => {
    await service.createWorktree({
      target: fx.target,
      branch: fx.existingBranch,
      mode: 'existing-remote',
    });
    const flat = recordedArgs.flat().join(' ');
    // The credential helper is wired (host-scoped) ...
    expect(flat.includes('credential.https://github.com.helper=')).toBe(true);
    // ... but the PAT itself never appears in any git argument.
    expect(flat).not.toContain(PAT);
  });

  it('does not leak the slug even for an adversarial branch', async () => {
    const adversarial = 'fix/CVE-2026-private-embargo';
    await service.createWorktree({ target: fx.target, branch: adversarial, mode: 'new' });
    expect(fx.telemetry.containsSecret(adversarial)).toBe(false);
    expect(fx.telemetry.containsSecret(idForBranch(adversarial))).toBe(false);
    expect(fx.telemetry.containsSecret(idForBranch(adversarial).split('--')[0])).toBe(false);
  });
});
