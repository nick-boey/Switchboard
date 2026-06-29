import { describe, expect, it } from 'vitest';
import { buildLaunchArgv } from './orchestrator.js';

/**
 * Launch-argv builder (task 3.1, plan Decision 10 / design Decision 2). `--session-id <uuid>` is the
 * bridge-id resolver's ONLY exact join key, so the builder is a testable invariant, not a
 * coordination note: a rebase (e.g. the `name-sessions` `-n/--name` flag) that silently dropped or
 * reordered `--session-id` would kill every "open in Claude web" link. These tests pin that the two
 * required flags compose, the UUID rides as `--session-id`'s argument, and an added flag can never
 * displace `--session-id` (the drop-guard invariant).
 */
describe('buildLaunchArgv', () => {
  const uuid = '42ec9f7f-0000-4000-8000-000000000000';

  it('composes claude with --session-id <uuid> and --remote-control, as argv (no shell line)', () => {
    const argv = buildLaunchArgv({ sessionId: uuid });
    expect(argv[0]).toBe('claude');
    expect(argv).toContain('--remote-control');
    // `--session-id` is immediately followed by the UUID (a flag/value pair, never concatenated).
    const i = argv.indexOf('--session-id');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(argv[i + 1]).toBe(uuid);
  });

  it('keeps --session-id <uuid> present and paired when other flags compose around it (drop-guard)', () => {
    // The `name-sessions` coordination point: adding the name flag must not drop --session-id.
    const argv = buildLaunchArgv({ sessionId: uuid, name: 'feature-login' });
    expect(argv).toContain('--remote-control');
    expect(argv).toContain('--name');
    expect(argv[argv.indexOf('--name') + 1]).toBe('feature-login');
    const i = argv.indexOf('--session-id');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(argv[i + 1]).toBe(uuid);
  });
});
