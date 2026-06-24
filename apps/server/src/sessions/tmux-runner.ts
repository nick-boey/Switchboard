/**
 * The tmux subprocess seam (design Decision 3), mirroring `repos/git-runner.ts`. Claude sessions
 * run DETACHED inside a `tmux` session rooted at a worktree; this seam is how the session slice
 * talks to the host's `tmux`. Production spawns `tmux` via `child_process` (the system runner,
 * below); tests inject the controllable fake (`apps/server/src/testing/tmux-runner.ts`). The
 * minimal surface is launch + the three liveness/teardown reads the slice needs.
 *
 * Every method takes / returns an opaque, already-derived tmux session NAME — the seam never
 * decodes a name back into a branch or worktree identity (forward-derivation only, Decision 1).
 */
export interface TmuxRunner {
  /**
   * Launch a DETACHED tmux session `name` rooted at `cwd` running `command` as argv (no shell):
   * `tmux new-session -d -s <name> -c <cwd> -- <command...>`. The argv form is what keeps an
   * adversarial branch-derived path/name out of a shell line (spec: the launch is argv, not a
   * shell line).
   */
  newSession(name: string, cwd: string, command: string[]): Promise<void>;
  /** True when a live tmux session named `name` exists (`tmux has-session`). */
  hasSession(name: string): Promise<boolean>;
  /** The live `sb-`-prefixed Switchboard session names (`tmux list-sessions`). */
  listSessions(): Promise<string[]>;
  /** Kill the tmux session `name`; idempotent — a no-op when the session is already absent. */
  killSession(name: string): Promise<void>;
}
