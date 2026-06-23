import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createOperationLedger,
  type OperationHandler,
  type OperationLedger,
  type OperationRecord,
} from './ledger.js';
import {
  fakeClock,
  fakeProcessProbe,
  type FakeProcessProbe,
} from '../testing/operation-scaffolding.js';

/**
 * Failing-first tests for the operation ledger + per-key lock (task 3.1, design Decision 3).
 * Exercises the record shape, idempotency, per-key serialization, abort + cleanup, the
 * abort-races-completion single-terminal-transition under the lock (both winners), and
 * restart recovery of a `running` op whose process is dead.
 */

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('operation ledger + lock', () => {
  let root: string;
  let probe: FakeProcessProbe;
  /** Keys whose durable completion marker is "present". */
  let completeKeys: Set<string>;
  /** Keys whose cleanup ran. */
  let cleaned: string[];
  let handler: OperationHandler;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'op-ledger-'));
    probe = fakeProcessProbe();
    completeKeys = new Set();
    cleaned = [];
    handler = {
      isComplete: (record) => completeKeys.has(record.key),
      cleanup: (record) => {
        cleaned.push(record.key);
      },
    };
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function makeLedger(): OperationLedger {
    return createOperationLedger({
      root,
      clock: fakeClock(1000),
      processProbe: probe,
      handlers: { clone: handler },
    });
  }

  it('records the documented fields and reaches succeeded', async () => {
    const ledger = makeLedger();
    const work = deferred<void>();
    const op = await ledger.start({ type: 'clone', key: 'a/b', run: () => work.promise });
    expect(op).toMatchObject({ type: 'clone', key: 'a/b', state: 'running', startedAt: 1000 });
    expect(typeof op.id).toBe('string');

    work.resolve();
    const settled = await ledger.whenSettled('a/b');
    expect(settled?.state).toBe('succeeded');
    expect(settled?.finishedAt).toBe(1000);
    expect((await ledger.get('a/b'))?.state).toBe('succeeded');
  });

  it('is idempotent: an in-flight or succeeded key returns the existing operation', async () => {
    const ledger = makeLedger();
    let runs = 0;
    const work = deferred<void>();
    const run = () => {
      runs += 1;
      return work.promise;
    };
    const first = await ledger.start({ type: 'clone', key: 'a/b', run });
    const dupInFlight = await ledger.start({ type: 'clone', key: 'a/b', run });
    expect(dupInFlight.id).toBe(first.id);
    expect(runs).toBe(1);

    work.resolve();
    await ledger.whenSettled('a/b');
    const dupDone = await ledger.start({ type: 'clone', key: 'a/b', run });
    expect(dupDone.id).toBe(first.id);
    expect(dupDone.state).toBe('succeeded');
    expect(runs).toBe(1);
  });

  it('serializes concurrent starts on the same key to a single operation', async () => {
    const ledger = makeLedger();
    let runs = 0;
    const work = deferred<void>();
    const run = () => {
      runs += 1;
      return work.promise;
    };
    const [a, b] = await Promise.all([
      ledger.start({ type: 'clone', key: 'a/b', run }),
      ledger.start({ type: 'clone', key: 'a/b', run }),
    ]);
    expect(a.id).toBe(b.id);
    expect(runs).toBe(1);
    work.resolve();
    await ledger.whenSettled('a/b');
  });

  it('abort transitions to aborted, cancels the worker, and cleans the incomplete target', async () => {
    const ledger = makeLedger();
    const work = deferred<void>();
    let sawAbort = false;
    await ledger.start({
      type: 'clone',
      key: 'a/b',
      run: ({ signal }) => {
        signal.addEventListener('abort', () => {
          sawAbort = true;
          work.reject(new Error('killed'));
        });
        return work.promise;
      },
    });
    const aborted = await ledger.abort('a/b');
    expect(aborted?.state).toBe('aborted');
    expect(sawAbort).toBe(true);
    expect(cleaned).toEqual(['a/b']);
    await ledger.whenSettled('a/b');
    expect((await ledger.get('a/b'))?.state).toBe('aborted');
  });

  it('abort that races a completion: completion wins → succeeded, no cleanup', async () => {
    const ledger = makeLedger();
    const work = deferred<void>();
    await ledger.start({ type: 'clone', key: 'a/b', run: () => work.promise });
    // The subprocess finished and wrote its completion marker, but finalization has not run yet.
    completeKeys.add('a/b');
    const result = await ledger.abort('a/b');
    expect(result?.state).toBe('succeeded');
    expect(cleaned).toEqual([]);
    work.resolve();
    await ledger.whenSettled('a/b');
    expect((await ledger.get('a/b'))?.state).toBe('succeeded');
  });

  it('abort that races a completion: abort wins → aborted, cleanup gated on the marker', async () => {
    const ledger = makeLedger();
    const work = deferred<void>();
    await ledger.start({
      type: 'clone',
      key: 'a/b',
      run: ({ signal }) => {
        signal.addEventListener('abort', () => work.reject(new Error('killed')));
        return work.promise;
      },
    });
    // Marker absent → abort wins and cleans exactly once.
    const result = await ledger.abort('a/b');
    expect(result?.state).toBe('aborted');
    expect(cleaned).toEqual(['a/b']);
    await ledger.whenSettled('a/b');
  });

  it('abort → immediate retry: a late-settling stale worker must not orphan the retry controller', async () => {
    const ledger = makeLedger();

    // op1's worker observes its abort but its (killed) git process emits `close` LATE: `work1`
    // stays pending after `abort` returns, exactly as a real SIGTERM'd subprocess does.
    const work1 = deferred<void>();
    let op1Aborted = false;
    const op1 = await ledger.start({
      type: 'clone',
      key: 'a/b',
      run: ({ signal }) => {
        signal.addEventListener('abort', () => {
          op1Aborted = true;
        });
        return work1.promise;
      },
    });

    const aborted1 = await ledger.abort('a/b');
    expect(aborted1?.state).toBe('aborted');
    expect(op1Aborted).toBe(true);
    expect(cleaned).toEqual(['a/b']);

    // Immediate retry of the SAME repo installs a fresh running op with its own controller.
    const work2 = deferred<void>();
    let op2Aborted = false;
    const retry = await ledger.start({
      type: 'clone',
      key: 'a/b',
      run: ({ signal }) => {
        signal.addEventListener('abort', () => {
          op2Aborted = true;
          work2.reject(new Error('killed'));
        });
        return work2.promise;
      },
    });
    expect(retry.state).toBe('running');
    expect(retry.id).not.toBe(op1.id);

    // Now op1's killed process finally emits `close`; its worker settles, late. This path is
    // microtask-bound (no async I/O — the id check fails so no finalize/cleanup runs), so a single
    // macrotask boundary deterministically drains op1's worker, including its `finally`.
    work1.reject(new Error('late close'));
    await new Promise((r) => setTimeout(r, 0));

    // The late stale worker must not have flipped the retry's record nor orphaned its controller.
    const live = await ledger.get('a/b');
    expect(live?.id).toBe(retry.id);
    expect(live?.state).toBe('running');

    // Aborting the retry MUST terminate its live subprocess (its abort signal must fire) and clean
    // exactly the still-incomplete target.
    const aborted2 = await ledger.abort('a/b');
    expect(op2Aborted).toBe(true);
    expect(aborted2?.id).toBe(retry.id);
    expect(aborted2?.state).toBe('aborted');
    expect(cleaned).toEqual(['a/b', 'a/b']);

    await ledger.whenSettled('a/b');
  });

  it('reconciles a running operation whose process is dead on restart', async () => {
    const ledger1 = makeLedger();
    const work = deferred<void>();
    await ledger1.start({
      type: 'clone',
      key: 'a/b',
      run: async ({ setPid }) => {
        await setPid(4242);
        return work.promise;
      },
    });
    // Let setPid persist.
    await new Promise((r) => setTimeout(r, 0));

    // Simulate a restart: a fresh ledger over the same store; the pid is no longer alive.
    probe.kill(4242);
    const ledger2 = makeLedger();
    await ledger2.reconcile();

    const record = await ledger2.get('a/b');
    expect(record?.state).toBe('failed');
    expect(cleaned).toContain('a/b');

    work.resolve();
  });

  it('a record persisted as running with no pid reconciles to failed', async () => {
    const stale: OperationRecord = {
      id: 'stale-1',
      type: 'clone',
      key: 'x/y',
      state: 'running',
      startedAt: 1,
    };
    writeFileSync(join(root, `${encodeURIComponent('x/y')}.json`), JSON.stringify(stale));
    const ledger = makeLedger();
    await ledger.reconcile();
    expect((await ledger.get('x/y'))?.state).toBe('failed');
  });
});
