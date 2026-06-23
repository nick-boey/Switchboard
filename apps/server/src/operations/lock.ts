/**
 * In-process per-key lock (design Decision 3). Serializes the ledger's short state transitions
 * for a given key (e.g. a `<owner>/<repo>` repo-id) by chaining their promises, so a start, an
 * abort, a worker finalization, and a reconcile for the same key never interleave. The server is
 * a single process (loopback-bound), so an in-memory mutex is sufficient for the concurrent-HTTP
 * case the spec describes; the durable record under `~/.switchboard` is what survives a restart.
 */
export interface KeyedLock {
  run<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

export function createKeyedLock(): KeyedLock {
  const chains = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const prev = chains.get(key) ?? Promise.resolve();
      // Run `fn` after the previous holder settles, regardless of how it settled.
      const next: Promise<T> = prev.then(
        () => fn(),
        () => fn(),
      );
      // The tail the next caller waits on must never reject (a rejected tail would reject them).
      chains.set(
        key,
        next.then(
          () => undefined,
          () => undefined,
        ),
      );
      return next;
    },
  };
}
