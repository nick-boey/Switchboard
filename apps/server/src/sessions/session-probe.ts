import { tmuxSessionName } from '@switchboard/shared';
import type { SessionProbe } from '../worktrees/seams.js';
import type { TmuxRunner } from './tmux-runner.js';

/**
 * The tmux-backed session-liveness provider (design Decision 4). It fulfils exactly the
 * `SessionProbe.hasActiveSession(repoId, wtId)` seam that `worktree-management` defined and consumes
 * in its safe-to-delete predicate, by FORWARD-DERIVING the session name from `(repoId, wtId)` and
 * testing tmux existence — it never decodes a tmux name back into a branch (Decision 1).
 *
 * It depends ONLY on `TmuxRunner` + the shared `tmuxSessionName` — no worktree back-dependency — so
 * `app.ts` can pass it to the worktree orchestrator without introducing a dependency cycle (even
 * though session *launch* depends on the worktree service, the thing the worktree orchestrator
 * consumes has no back-edge).
 */
export function createSessionProbe(tmuxRunner: TmuxRunner): SessionProbe {
  return {
    hasActiveSession: (repoId, wtId) => tmuxRunner.hasSession(tmuxSessionName(repoId, wtId)),
  };
}
