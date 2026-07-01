import { describe, expect, it } from 'vitest';
import { configSchema, type RuntimeLogger, type RuntimeTelemetry } from '@switchboard/shared';
import { buildDockerContext, DEFAULT_SERVE_PORT, DEFAULT_WEB_ROOT } from './docker';

const logger: RuntimeLogger = { debug() {}, info() {}, warn() {}, error() {} };
const telemetry: RuntimeTelemetry = { startSpan: () => ({ end() {} }) };

/**
 * serve-web-spa: the `--docker` bring-up points `ctx.webRoot` at the bundled SPA image path so the
 * server serves the web app over the serve ingress, and pins the dedicated serve ingress.
 */
describe('buildDockerContext', () => {
  it('sets ctx.webRoot to the bundled image path and pins the dedicated serve ingress', () => {
    const config = configSchema.parse({ bearerToken: 'x', trustServeIdentity: true });
    const { ctx, servePort } = buildDockerContext({
      config,
      configDir: '/root/.switchboard',
      assertNoHostPublication: true,
      logger,
      telemetry,
    });
    expect(ctx.webRoot).toBe(DEFAULT_WEB_ROOT);
    expect(ctx.webRoot).toBe('/opt/switchboard/web');
    expect(ctx.assertNoHostPublication).toBe(true);
    expect(ctx.config.listen.serve).toEqual({ port: DEFAULT_SERVE_PORT });
    expect(servePort).toBe(DEFAULT_SERVE_PORT);
    // The direct ingress is kept for in-container probing.
    expect(ctx.config.listen.direct).toEqual({ port: 0 });
  });

  it('honours an explicit webRoot override', () => {
    const config = configSchema.parse({ bearerToken: 'x' });
    const { ctx } = buildDockerContext({
      config,
      configDir: '/c',
      assertNoHostPublication: true,
      logger,
      telemetry,
      webRoot: '/custom/web',
    });
    expect(ctx.webRoot).toBe('/custom/web');
  });
});
