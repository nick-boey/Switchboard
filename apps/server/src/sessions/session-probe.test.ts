import { describe, expect, it } from 'vitest';
import { tmuxSessionName } from '@switchboard/shared';
import { fakeTmuxRunner } from '../testing/tmux-runner.js';
import { createSessionProbe } from './session-probe.js';

/**
 * Session-liveness probe tests (task 5.1, design Decision 4). `createSessionProbe(tmuxRunner)`
 * fulfils worktree-management's `SessionProbe.hasActiveSession(repoId, wtId)` seam by
 * FORWARD-DERIVING `tmuxSessionName(repoId, wtId)` and testing `hasSession` — it never decodes a
 * tmux name back into a branch, and depends only on tmux (no worktree back-edge).
 */
describe('createSessionProbe', () => {
  const repoId = 'acme/widget-factory';
  const wtId = 'feature-login--0123456789ab';

  it('reports a live session as active (forward-derives the name and tests existence)', async () => {
    const tmux = fakeTmuxRunner();
    const probe = createSessionProbe(tmux);
    expect(await probe.hasActiveSession(repoId, wtId)).toBe(false);

    // Mark exactly the forward-derived name live — the probe must observe it.
    tmux.setSession(tmuxSessionName(repoId, wtId), true);
    expect(await probe.hasActiveSession(repoId, wtId)).toBe(true);
  });

  it('reports no active session when the derived name is not live', async () => {
    // A different worktree's session being live must not leak into this one (keyed by repoId+wtId).
    const tmux = fakeTmuxRunner([tmuxSessionName(repoId, 'other--0123456789ab')]);
    const probe = createSessionProbe(tmux);
    expect(await probe.hasActiveSession(repoId, wtId)).toBe(false);
  });

  it('keys liveness by (repoId, wtId): same wt-id in different repos is independent', async () => {
    const tmux = fakeTmuxRunner([tmuxSessionName('acme/one', wtId)]);
    const probe = createSessionProbe(tmux);
    expect(await probe.hasActiveSession('acme/one', wtId)).toBe(true);
    expect(await probe.hasActiveSession('acme/two', wtId)).toBe(false);
  });
});
