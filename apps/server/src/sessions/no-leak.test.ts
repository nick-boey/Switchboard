import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import {
  idForBranch,
  tmuxSessionName,
  type RepoTarget,
  type WorktreeSummary,
} from '@switchboard/shared';
import { makeServerTestContext, type ServerTestContext } from '../testing/operation-scaffolding.js';
import { fakeTmuxRunner } from '../testing/tmux-runner.js';
import { createSessionOrchestrator, type SessionWorktreeView } from './orchestrator.js';

/**
 * Session no-leak tests (task 8.1, design Decision 7), mirroring the worktree no-leak harness. The
 * tmux session name (derived from the branch — the same slug-leak vector as `<wt-id>`), the
 * worktree path, the `(repo-id, wt-id)`, and the launch argv are sensitive: they must appear only
 * under redacted (blocklisted) span attribute keys, never unredacted. The capture runs the
 * production `redactAttributes` blocklist, so it asserts exactly what an exporter would see.
 */
describe('session no-leak (name / path / (repo-id, wt-id) / argv never escape unredacted)', () => {
  const repoId = 'acme/widget-factory';
  const branch = 'feature/secret-embargo';
  const wtId = idForBranch(branch);
  let ctx: ServerTestContext['ctx'];
  let telemetry: ServerTestContext['telemetry'];

  beforeEach(() => {
    ({ ctx, telemetry } = makeServerTestContext());
  });
  afterEach(() => {
    rmSync(ctx.workspaceRoot, { recursive: true, force: true });
  });

  function worktreeView(): SessionWorktreeView {
    return {
      worktreePath: (t: RepoTarget, id: string) => `/ws/repos/${t.owner}/${t.repo}/worktrees/${id}`,
      isWorktreeComplete: async () => true,
      listWorktrees: async (): Promise<WorktreeSummary[]> => [],
    };
  }

  it('emits session telemetry that leaks no session name, worktree path, wt-id slug, or argv', async () => {
    const orch = createSessionOrchestrator(ctx, {
      worktreeService: worktreeView(),
      tmuxRunner: fakeTmuxRunner(),
    });
    await orch.launchSession(repoId, wtId);
    await orch.whenSettled(repoId, wtId);

    const spans = telemetry.spans();
    // Telemetry IS emitted for the launch...
    expect(spans.some((s) => s.name.startsWith('session.'))).toBe(true);

    // ...but it never carries the sensitive values, even unredacted in any attribute value.
    const name = tmuxSessionName(repoId, wtId);
    const path = `/ws/repos/acme/widget-factory/worktrees/${wtId}`;
    expect(telemetry.containsSecret(name)).toBe(false);
    expect(telemetry.containsSecret(path)).toBe(false);
    expect(telemetry.containsSecret(wtId)).toBe(false);
    expect(telemetry.containsSecret(wtId.split('--')[0])).toBe(false); // the slug
    expect(telemetry.containsSecret(branch)).toBe(false);

    const values = spans
      .flatMap((s) => Object.values(s.attributes))
      .filter((v): v is string => typeof v === 'string');
    // No attribute value is the raw tmux name or worktree path.
    expect(values).not.toContain(name);
    expect(values).not.toContain(path);
  });
});
