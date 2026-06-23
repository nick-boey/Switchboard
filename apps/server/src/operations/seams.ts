/**
 * Injectable seams for the operation ledger (design Decision 3). The ledger reads time through
 * a `Clock` and tests process liveness through a `ProcessProbe` so concurrency, mid-flight kill,
 * and restart/reconcile can be driven deterministically from tests (the controllable fakes live
 * in `../testing/operation-scaffolding.ts`). Production wires the system implementations below.
 */

/** A monotonic-enough time source (epoch milliseconds). */
export interface Clock {
  now(): number;
}

/** Tests whether a process id is still alive (restart-recovery reconciliation). */
export interface ProcessProbe {
  isAlive(pid: number): boolean;
}

/** Production clock — wall-clock epoch milliseconds. */
export const systemClock: Clock = {
  now: () => Date.now(),
};

/** Production process probe — `kill(pid, 0)` succeeds iff the process exists and is signalable. */
export const systemProcessProbe: ProcessProbe = {
  isAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      // ESRCH = no such process (dead); EPERM = exists but not ours (alive).
      return (err as NodeJS.ErrnoException).code === 'EPERM';
    }
  },
};
