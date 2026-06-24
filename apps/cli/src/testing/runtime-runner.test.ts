import { describe, expect, it } from 'vitest';
import { fakeRuntimeRunner } from './runtime-runner';

/**
 * Self-test for the orchestration runner seam (task 1.3): invocation order + argv are observable,
 * spawned processes record forwarded signals and can be driven to exit, and `run` results
 * (including the `tailscale version` report) are controllable for success/failure.
 */
describe('fakeRuntimeRunner seam', () => {
  it('records spawn and run invocations in order with their argv', async () => {
    const runner = fakeRuntimeRunner();
    runner.spawn('tailscaled', ['--tun=userspace-networking']);
    await runner.run('tailscale', ['up', '--auth-key=tskey-xxx']);
    await runner.run('tailscale', ['serve', '--bg', '--https=443', 'http://127.0.0.1:4180']);

    expect(runner.calls).toEqual([
      { method: 'spawn', command: 'tailscaled', args: ['--tun=userspace-networking'] },
      { method: 'run', command: 'tailscale', args: ['up', '--auth-key=tskey-xxx'] },
      {
        method: 'run',
        command: 'tailscale',
        args: ['serve', '--bg', '--https=443', 'http://127.0.0.1:4180'],
      },
    ]);
  });

  it('a spawned process records forwarded signals and can be driven to exit', async () => {
    const runner = fakeRuntimeRunner();
    const proc = runner.spawn('tailscaled', []);
    proc.kill('SIGTERM');
    expect(runner.spawned[0].signals).toEqual(['SIGTERM']);
    proc.exit(0);
    await expect(proc.exited).resolves.toBe(0);
  });

  it('reports the configured tailscale version (default 1.50.0)', async () => {
    expect((await fakeRuntimeRunner().run('tailscale', ['version'])).stdout).toBe('1.50.0');
    const old = fakeRuntimeRunner({ version: '1.48.0' });
    expect((await old.run('tailscale', ['version'])).stdout).toBe('1.48.0');
  });

  it('run results are controllable for failure via stubRun (later stubs win)', async () => {
    const runner = fakeRuntimeRunner();
    runner.stubRun((c) => c.args[0] === 'up', { code: 1, stdout: '' });
    expect((await runner.run('tailscale', ['up'])).code).toBe(1);
    // Unmatched runs still default to success.
    expect((await runner.run('tailscale', ['serve'])).code).toBe(0);
  });
});
