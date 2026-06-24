import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { systemProcessProbe } from '../operations/seams.js';
import { fakeClock, fakeProcessProbe, makeServerTestContext } from './operation-scaffolding.js';

/**
 * Smoke test for the operation scaffolding (task 1.4): a temp `~/.switchboard` workspace, a
 * controllable clock, and a controllable process probe (plus the real one) — the seams the
 * ledger (group 3) and clone (group 6) drive for concurrency, mid-flight kill, and reconcile.
 */
describe('operation test scaffolding', () => {
  it('provides a RuntimeContext rooted at a fresh temp workspace with telemetry capture', () => {
    const { ctx, telemetry } = makeServerTestContext();
    expect(existsSync(ctx.workspaceRoot)).toBe(true);
    ctx.telemetry.startSpan('probe', { note: 'hello' }).end();
    expect(telemetry.spans()).toHaveLength(1);
  });

  it('fakeClock only advances when told', () => {
    const clock = fakeClock(1000);
    expect(clock.now()).toBe(1000);
    clock.advance(500);
    expect(clock.now()).toBe(1500);
    clock.set(42);
    expect(clock.now()).toBe(42);
  });

  it('fakeProcessProbe reports liveness per pid and can kill', () => {
    const probe = fakeProcessProbe();
    expect(probe.isAlive(123)).toBe(false);
    probe.setAlive(123, true);
    expect(probe.isAlive(123)).toBe(true);
    probe.kill(123);
    expect(probe.isAlive(123)).toBe(false);
  });

  it('systemProcessProbe sees this live process and not an impossible pid', () => {
    expect(systemProcessProbe.isAlive(process.pid)).toBe(true);
    expect(systemProcessProbe.isAlive(2_147_483_646)).toBe(false);
  });
});
