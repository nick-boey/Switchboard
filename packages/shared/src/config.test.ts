import { describe, expect, it } from 'vitest';
import { configSchema, type AppConfig } from './config';

describe('configSchema', () => {
  it('accepts a valid config', () => {
    const parsed = configSchema.parse({
      bearerToken: 'a-token',
      trustServeIdentity: true,
      identityAllowlist: ['nick-boey@github'],
      telemetry: { exporter: 'otlp', otlpEndpoint: 'http://localhost:4318/v1/traces' },
      cors: { allowedOrigins: ['http://localhost:5173'] },
      github: null,
    });
    expect(parsed.bearerToken).toBe('a-token');
    expect(parsed.trustServeIdentity).toBe(true);
    expect(parsed.telemetry.exporter).toBe('otlp');
  });

  it('applies first-run defaults: trust off, telemetry none, allowlist seeded', () => {
    const parsed = configSchema.parse({ bearerToken: 'x' });
    expect(parsed.trustServeIdentity).toBe(false);
    expect(parsed.telemetry.exporter).toBe('none');
    expect(parsed.identityAllowlist).toContain('nick-boey@github');
    expect(parsed.github).toBeNull();
    expect(parsed.cors.allowedOrigins).toEqual([]);
  });

  it('rejects an invalid telemetry exporter with a field-named issue', () => {
    const result = configSchema.safeParse({ bearerToken: 'x', telemetry: { exporter: 'seq' } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('telemetry'))).toBe(true);
    }
  });

  it('rejects an empty bearer token', () => {
    const result = configSchema.safeParse({ bearerToken: '' });
    expect(result.success).toBe(false);
  });

  it('exposes the inferred AppConfig type', () => {
    const cfg: AppConfig = configSchema.parse({ bearerToken: 'x' });
    expect(typeof cfg.bearerToken).toBe('string');
  });
});
