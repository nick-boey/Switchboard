import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createKeyedLock, type KeyedLock } from './lock.js';
import { systemClock, systemProcessProbe, type Clock, type ProcessProbe } from './seams.js';

/**
 * The filesystem-backed operation ledger + per-key lock (design Decision 3). The clone is its
 * first consumer; `worktree-management` / `claude-session-launch` reuse it. It keeps one durable
 * JSON record per key under `~/.switchboard/operations` and guarantees:
 *
 * - **idempotency** — a start for an in-flight or succeeded key returns the existing operation;
 * - **serialization** — the per-key lock means concurrent starts launch a single worker;
 * - **cancellation** — abort and worker-completion resolve as a single terminal transition under
 *   the lock; the abort path re-checks the type's completion marker before cleaning;
 * - **recovery** — on restart a `running` op whose process is dead reconciles to `failed`.
 */

export type OperationState = 'pending' | 'running' | 'succeeded' | 'failed' | 'aborted';
/** Additive: `worktree` joins `clone` (design Decision 3 / worktree-management Decision 3). */
export type OperationType = 'clone' | 'worktree';

export interface OperationError {
  kind: string;
  message?: string;
}

export interface OperationRecord {
  id: string;
  type: OperationType;
  key: string;
  state: OperationState;
  startedAt: number;
  finishedAt?: number;
  /** The worker subprocess pid, recorded for restart recovery. */
  pid?: number;
  error?: OperationError;
  /**
   * Durable, non-sensitive operation metadata. The worktree create records the **exact requested
   * branch** here so idempotent reuse can be gated on branch equality (a same-key/different-branch
   * truncated-hash collision is rejected, not aliased — worktree-management Decision 3).
   */
  metadata?: Record<string, string>;
}

/** Per-type behaviour the ledger needs to resolve a record without the live worker closure. */
export interface OperationHandler {
  /** True when the operation's durable success marker exists for this record. */
  isComplete(record: OperationRecord): boolean | Promise<boolean>;
  /** Remove the operation's incomplete target (the caller gates this on `isComplete`). */
  cleanup(record: OperationRecord): void | Promise<void>;
}

/** Context handed to a worker so it can observe cancellation and report its pid. */
export interface OperationWorkerContext {
  signal: AbortSignal;
  setPid(pid: number): Promise<void>;
}

export interface StartOptions {
  type: OperationType;
  key: string;
  /** Durable non-sensitive metadata stored on a NEW record (e.g. the worktree's exact branch). */
  metadata?: Record<string, string>;
  /** The live worker. Resolves on success, rejects on failure; cancelled via `signal`. */
  run: (worker: OperationWorkerContext) => Promise<void>;
}

export interface OperationLedger {
  start(options: StartOptions): Promise<OperationRecord>;
  abort(key: string): Promise<OperationRecord | null>;
  get(key: string): Promise<OperationRecord | null>;
  list(): Promise<OperationRecord[]>;
  /** Resolve once the current worker for `key` has settled (test/orchestration aid). */
  whenSettled(key: string): Promise<OperationRecord | null>;
  /** Restart recovery: reconcile any `running` op whose process is no longer alive. */
  reconcile(): Promise<void>;
}

export interface OperationLedgerConfig {
  /** Directory the records live in (e.g. `~/.switchboard/operations`). */
  root: string;
  /**
   * Per-type handlers. **Partial** so each orchestrator registers only the types it owns (the
   * clone and worktree orchestrators share one on-disk store but each handles its own records); a
   * record whose type has no handler here is left untouched by this ledger's abort/reconcile.
   */
  handlers: Partial<Record<OperationType, OperationHandler>>;
  clock?: Clock;
  processProbe?: ProcessProbe;
  lock?: KeyedLock;
}

const TERMINAL: ReadonlySet<OperationState> = new Set(['succeeded', 'failed', 'aborted']);
const ACTIVE: ReadonlySet<OperationState> = new Set(['pending', 'running', 'succeeded']);

export function createOperationLedger(config: OperationLedgerConfig): OperationLedger {
  const clock = config.clock ?? systemClock;
  const processProbe = config.processProbe ?? systemProcessProbe;
  const lock = config.lock ?? createKeyedLock();
  const { root, handlers } = config;

  mkdirSync(root, { recursive: true });

  const controllers = new Map<string, AbortController>();
  const settled = new Map<string, Promise<void>>();

  const pathFor = (key: string): string => join(root, `${encodeURIComponent(key)}.json`);

  const read = (key: string): OperationRecord | null => {
    const file = pathFor(key);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as OperationRecord;
  };
  const write = (record: OperationRecord): void => {
    writeFileSync(pathFor(record.key), JSON.stringify(record, null, 2));
  };

  const finalizeFailure = async (record: OperationRecord, err: unknown): Promise<void> => {
    record.state = 'failed';
    record.finishedAt = clock.now();
    // Carry a typed `kind` if the worker supplied one; never store the raw message (no-leak).
    const kind =
      err && typeof err === 'object' && 'kind' in err && typeof err.kind === 'string'
        ? err.kind
        : 'git-failure';
    record.error = { kind };
    write(record);
    const handler = handlers[record.type];
    if (handler && !(await handler.isComplete(record))) await handler.cleanup(record);
  };

  const launch = (record: OperationRecord, run: StartOptions['run']): void => {
    const controller = new AbortController();
    controllers.set(record.key, controller);

    const setPid = (pid: number): Promise<void> =>
      lock.run(record.key, async () => {
        const cur = read(record.key);
        if (cur && cur.id === record.id && cur.state === 'running') {
          cur.pid = pid;
          write(cur);
        }
      });

    const task = (async () => {
      try {
        await run({ signal: controller.signal, setPid });
        await lock.run(record.key, async () => {
          const cur = read(record.key);
          if (cur && cur.id === record.id && cur.state === 'running') {
            cur.state = 'succeeded';
            cur.finishedAt = clock.now();
            write(cur);
          }
        });
      } catch (err) {
        await lock.run(record.key, async () => {
          const cur = read(record.key);
          // Only the worker's own still-running record may transition to failed; an abort or a
          // completion that won the lock first leaves its terminal state untouched.
          if (cur && cur.id === record.id && cur.state === 'running') {
            await finalizeFailure(cur, err);
          }
        });
      } finally {
        // Retract the controller only if it is still the one this worker installed. After an
        // abort + immediate retry on the same key, the retry installs a fresh controller under
        // this key; a late-settling stale worker (its killed git process emitting `close` after
        // the retry started) must NOT delete the retry's controller, or the retry becomes
        // un-abortable — a later abort would mark the ledger aborted and run cleanup without ever
        // terminating the live subprocess.
        if (controllers.get(record.key) === controller) controllers.delete(record.key);
      }
    })();
    settled.set(record.key, task);
  };

  return {
    async start({ type, key, metadata, run }) {
      return lock.run(key, async () => {
        const existing = read(key);
        if (existing && ACTIVE.has(existing.state)) return existing;
        const record: OperationRecord = {
          id: randomUUID(),
          type,
          key,
          state: 'running',
          startedAt: clock.now(),
          ...(metadata ? { metadata } : {}),
        };
        write(record);
        launch(record, run);
        return record;
      });
    },

    async abort(key) {
      return lock.run(key, async () => {
        const record = read(key);
        if (!record) return null;
        if (TERMINAL.has(record.state)) return record; // already finished (succeeded = completion-wins)

        const handler = handlers[record.type];
        controllers.get(key)?.abort();

        if (handler && (await handler.isComplete(record))) {
          // The worker finished and wrote its marker before we won the lock: completion wins.
          record.state = 'succeeded';
          record.finishedAt = clock.now();
          write(record);
          return record;
        }

        record.state = 'aborted';
        record.finishedAt = clock.now();
        write(record);
        if (handler && !(await handler.isComplete(record))) await handler.cleanup(record);
        return record;
      });
    },

    async get(key) {
      return read(key);
    },

    async list() {
      if (!existsSync(root)) return [];
      return readdirSync(root)
        .filter((name) => name.endsWith('.json'))
        .map((name) => JSON.parse(readFileSync(join(root, name), 'utf8')) as OperationRecord);
    },

    async whenSettled(key) {
      await settled.get(key)?.catch(() => undefined);
      return read(key);
    },

    async reconcile() {
      const records = await this.list();
      for (const record of records) {
        if (record.state !== 'running') continue;
        // Only reconcile records this ledger owns a handler for (the shared store also holds the
        // other orchestrator's records, which it must not touch).
        if (!handlers[record.type]) continue;
        await lock.run(record.key, async () => {
          const cur = read(record.key);
          if (!cur || cur.state !== 'running') return;
          // A durably-recorded pid that is still alive: the worker survived; leave it running.
          if (cur.pid !== undefined && processProbe.isAlive(cur.pid)) return;
          cur.state = 'failed';
          cur.finishedAt = clock.now();
          cur.error = { kind: 'git-failure', message: 'interrupted before completion' };
          write(cur);
          // Destructive cleanup is gated on KNOWING the worker is gone (restart-recovery). With no
          // recorded pid we cannot rule out a still-live git child — a crash that landed in the
          // tiny window between spawn and the durable pid write — so we mark the op failed/
          // needs-attention but never delete around a possibly-live mutation. Only a pid that was
          // persisted AND is no longer alive clears the op for cleanup. Any ownership marker this
          // no-pid path leaves behind is operation-scoped (its token is THIS record's token), so it
          // can never match a future operation's token and thus can never re-authorize a delete.
          if (cur.pid === undefined) return;
          const handler = handlers[cur.type];
          // `cur` carries the failed op's own metadata (including its token), so a type whose
          // cleanup is token-gated deletes only a destination this exact operation provably created.
          if (handler && !(await handler.isComplete(cur))) await handler.cleanup(cur);
        });
      }
    },
  };
}
