import { describe, expect, it } from 'vitest';
import { fakeTmuxRunner } from './tmux-runner.js';

/**
 * The controllable in-memory fake `TmuxRunner` (task 1.1) — the GitRunner fake is the precedent.
 * Proves the default degrades to "no sessions", that liveness is independently controllable per
 * session name, and that `newSession` calls are recorded (name, cwd, command) so launch wiring +
 * redaction can be asserted by the orchestrator / no-leak tests.
 */
describe('fake TmuxRunner', () => {
  it('defaults to no live sessions', async () => {
    const tmux = fakeTmuxRunner();
    expect(await tmux.hasSession('sb-anything--0123456789ab')).toBe(false);
    expect(await tmux.listSessions()).toEqual([]);
  });

  it('records newSession calls (name, cwd, command) and marks the session live', async () => {
    const tmux = fakeTmuxRunner();
    await tmux.newSession('sb-feat--0123456789ab', '/wt/path', ['claude', '--remote-control']);
    expect(tmux.calls).toEqual([
      { name: 'sb-feat--0123456789ab', cwd: '/wt/path', command: ['claude', '--remote-control'] },
    ]);
    expect(await tmux.hasSession('sb-feat--0123456789ab')).toBe(true);
    expect(await tmux.listSessions()).toEqual(['sb-feat--0123456789ab']);
  });

  it('is independently controllable per session name via setSession', async () => {
    const tmux = fakeTmuxRunner();
    tmux.setSession('sb-a--0123456789ab', true);
    tmux.setSession('sb-b--0123456789ab', true);
    expect(await tmux.hasSession('sb-a--0123456789ab')).toBe(true);
    expect(await tmux.hasSession('sb-b--0123456789ab')).toBe(true);
    tmux.setSession('sb-a--0123456789ab', false);
    expect(await tmux.hasSession('sb-a--0123456789ab')).toBe(false);
    expect(await tmux.hasSession('sb-b--0123456789ab')).toBe(true);
  });

  it('killSession removes a live session and is a no-op when already absent', async () => {
    const tmux = fakeTmuxRunner(['sb-live--0123456789ab']);
    expect(await tmux.hasSession('sb-live--0123456789ab')).toBe(true);
    await tmux.killSession('sb-live--0123456789ab');
    expect(await tmux.hasSession('sb-live--0123456789ab')).toBe(false);
    // Idempotent: killing an absent session does not throw.
    await expect(tmux.killSession('sb-live--0123456789ab')).resolves.toBeUndefined();
  });
});
