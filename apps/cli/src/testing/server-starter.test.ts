import { describe, expect, it } from 'vitest';
import { fakeServerStarter, type FakeServerHandle } from './server-starter';

/**
 * Self-test for the supervisor server-starter seam (task 1.2): it is controllable per scenario —
 * resolve a stay-up handle, drive an unexpected close, or reject the start — and records `close()`.
 */
describe('fakeServerStarter seam', () => {
  it('stay-up (default): resolves a handle whose whenClosed pends; close() does NOT settle it', async () => {
    const fake = fakeServerStarter();
    const handle = (await fake.start()) as FakeServerHandle;
    expect(fake.startCalls).toBe(1);

    let settled = false;
    void handle.whenClosed?.then(
      () => (settled = true),
      () => (settled = true),
    );
    await handle.close();
    expect(handle.closeCalls).toBe(1);
    // A microtask turn: a graceful close must NOT have settled whenClosed.
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it('crash: the handle whenClosed settles on its own (an unexpected stop)', async () => {
    const fake = fakeServerStarter([{ kind: 'crash' }]);
    const handle = (await fake.start()) as FakeServerHandle;
    await expect(handle.whenClosed).resolves.toBeUndefined();
  });

  it('triggerCrash drives an unexpected close after the handle is handed out', async () => {
    const fake = fakeServerStarter();
    const handle = (await fake.start()) as FakeServerHandle;
    let settled = false;
    const watch = handle.whenClosed?.then(() => (settled = true));
    expect(settled).toBe(false);
    handle.triggerCrash();
    await watch;
    expect(settled).toBe(true);
  });

  it('reject: the start() call itself rejects (the server failed to come up)', async () => {
    const boom = new Error('boot failed');
    const fake = fakeServerStarter([{ kind: 'reject', error: boom }]);
    await expect(fake.start()).rejects.toBe(boom);
    expect(fake.startCalls).toBe(1);
    expect(fake.handles).toHaveLength(0);
  });

  it('follows the script in order, then defaults to stay-up', async () => {
    const fake = fakeServerStarter([{ kind: 'crash' }, { kind: 'reject' }]);
    await expect(fake.start()).resolves.toBeDefined(); // crash handle
    await expect(fake.start()).rejects.toBeInstanceOf(Error); // reject
    await expect(fake.start()).resolves.toBeDefined(); // default stay-up
    expect(fake.startCalls).toBe(3);
    expect(fake.handles).toHaveLength(2); // the rejected start produced no handle
  });
});
