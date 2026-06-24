import type { TmuxRunner } from '../sessions/tmux-runner.js';

/**
 * Controllable in-memory fake `TmuxRunner` (task 1.1) — the GitRunner fake is the precedent. A
 * `Set` of live session names backs `hasSession`/`listSessions`/`killSession`; `newSession` records
 * its (name, cwd, command) so launch wiring + telemetry redaction can be asserted, and marks the
 * session live. `setSession` flips a name's liveness directly so a test can simulate an external
 * kill (a session killed outside Switchboard) or a pre-existing session. The default instance
 * degrades to "no sessions".
 */
export interface FakeTmuxRunner extends TmuxRunner {
  /** Recorded `newSession` calls — assert the detached launch's name, cwd, and argv. */
  readonly calls: ReadonlyArray<{ name: string; cwd: string; command: string[] }>;
  /** Set a session name live (true) or dead (false) directly — e.g. an external kill. */
  setSession(name: string, present: boolean): void;
}

export function fakeTmuxRunner(initial: readonly string[] = []): FakeTmuxRunner {
  const live = new Set<string>(initial);
  const calls: { name: string; cwd: string; command: string[] }[] = [];
  return {
    calls,
    async newSession(name, cwd, command) {
      calls.push({ name, cwd, command: [...command] });
      live.add(name);
    },
    async hasSession(name) {
      return live.has(name);
    },
    async listSessions() {
      return [...live];
    },
    async killSession(name) {
      live.delete(name);
    },
    setSession(name, present) {
      if (present) live.add(name);
      else live.delete(name);
    },
  };
}
