import { makeTestContext } from '@switchboard/shared/testing';
import type { RuntimeContext } from '@switchboard/shared';
import type { Clock, ProcessProbe } from '../operations/seams.js';
import { createTelemetryCapture, type TelemetryCapture } from './no-leak.js';

/**
 * Operation test scaffolding (task 1.4). A temp `~/.switchboard` workspace via `RuntimeContext`
 * plus controllable `Clock`/`ProcessProbe` seams so the ledger tests (group 3) and clone tests
 * (group 6) can simulate concurrency, a mid-flight kill, and a restart/reconcile without real
 * time or real process lifetimes.
 */

export interface ServerTestContext {
  ctx: RuntimeContext;
  /** Captures telemetry (with redaction) so no-leak assertions can inspect emitted spans. */
  telemetry: TelemetryCapture;
}

/**
 * A `RuntimeContext` rooted at a fresh temp workspace (the stand-in for `~/.switchboard`), with a
 * telemetry capture wired onto `ctx.telemetry`. Override any context field via `overrides`.
 */
export function makeServerTestContext(overrides: Partial<RuntimeContext> = {}): ServerTestContext {
  const telemetry = createTelemetryCapture();
  const ctx = makeTestContext({ telemetry: telemetry.telemetry, ...overrides });
  return { ctx, telemetry };
}

/** A `Clock` whose time only moves when the test advances it. */
export interface FakeClock extends Clock {
  advance(ms: number): void;
  set(ms: number): void;
}

export function fakeClock(start = 1_700_000_000_000): FakeClock {
  let current = start;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
    },
    set(ms) {
      current = ms;
    },
  };
}

/** A `ProcessProbe` whose liveness is set explicitly per pid (default: dead/unknown). */
export interface FakeProcessProbe extends ProcessProbe {
  setAlive(pid: number, alive: boolean): void;
  /** Mark a pid dead — the mid-flight-kill / crashed-process simulation. */
  kill(pid: number): void;
}

export function fakeProcessProbe(): FakeProcessProbe {
  const alive = new Map<number, boolean>();
  return {
    isAlive: (pid) => alive.get(pid) ?? false,
    setAlive(pid, value) {
      alive.set(pid, value);
    },
    kill(pid) {
      alive.set(pid, false);
    },
  };
}
