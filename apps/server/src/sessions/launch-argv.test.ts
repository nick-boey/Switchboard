import { describe, expect, it } from 'vitest';
import { buildLaunchArgv } from './orchestrator.js';

/**
 * Launch-argv builder (task 3.1, plan Decision 10 / design Decision 2). `--session-id <uuid>` is the
 * bridge-id resolver's ONLY exact join key, so the builder is a testable invariant, not a
 * coordination note: a rebase (e.g. the merged `name-sessions` naming flags) that silently dropped or
 * reordered `--session-id` would kill every "open in Claude web" link. These tests pin that the join
 * key and the `name-sessions` naming on both surfaces compose, the UUID rides as `--session-id`'s
 * argument, and the name flags can never displace `--session-id` (the drop-guard invariant).
 */
describe('buildLaunchArgv', () => {
  const uuid = '42ec9f7f-0000-4000-8000-000000000000';
  const name = 'widget-factory/feature-login';

  it('composes the resolver join key with name-sessions naming on both surfaces, as argv (no shell line)', () => {
    const argv = buildLaunchArgv({ sessionId: uuid, name });
    expect(argv[0]).toBe('claude');
    // The resolver join key, as a flag/value pair (never concatenated).
    expect(argv[argv.indexOf('--session-id') + 1]).toBe(uuid);
    // name-sessions: the Remote Control label (the `=` form is required) AND the display name.
    expect(argv).toContain(`--remote-control=${name}`);
    expect(argv[argv.indexOf('--name') + 1]).toBe(name);
  });

  it('keeps --session-id <uuid> present and paired when the name flags compose around it (drop-guard)', () => {
    const argv = buildLaunchArgv({ sessionId: uuid, name });
    const i = argv.indexOf('--session-id');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(argv[i + 1]).toBe(uuid);
    // Exactly one join key, never dropped or duplicated as the name flags are added around it.
    expect(argv.filter((a) => a === '--session-id')).toHaveLength(1);
  });
});
