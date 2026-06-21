import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { makeTestContext } from './runtime-context';

describe('makeTestContext', () => {
  const created: string[] = [];

  afterEach(() => {
    for (const path of created) rmSync(path, { recursive: true, force: true });
    created.length = 0;
  });

  it('returns a RuntimeContext populated with safe fakes', () => {
    const ctx = makeTestContext();
    created.push(ctx.workspaceRoot);

    expect(existsSync(ctx.workspaceRoot)).toBe(true);
    expect(ctx.identity).toEqual({ login: null, source: 'none' });
    expect(() => ctx.logger.info('hello', { k: 'v' })).not.toThrow();

    const span = ctx.telemetry.startSpan('unit');
    expect(() => span.end()).not.toThrow();
  });

  it('applies overrides over the defaults', () => {
    const ctx = makeTestContext({
      workspaceRoot: '/tmp/switchboard-fixed-root',
      identity: { login: 'nick-boey@github', source: 'serve' },
    });

    expect(ctx.workspaceRoot).toBe('/tmp/switchboard-fixed-root');
    expect(ctx.identity).toEqual({ login: 'nick-boey@github', source: 'serve' });
  });
});
