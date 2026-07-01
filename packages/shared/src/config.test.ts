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
    expect(parsed.identityAllowlist).toEqual(['nick-boey@github']); // an explicit allowlist is preserved
    expect(parsed.telemetry.exporter).toBe('otlp');
  });

  it('applies first-run defaults: trust off, telemetry none, allowlist EMPTY (no baked-in identity)', () => {
    const parsed = configSchema.parse({ bearerToken: 'x' });
    expect(parsed.trustServeIdentity).toBe(false);
    expect(parsed.telemetry.exporter).toBe('none');
    // serve-web-spa F1: the default allowlist is empty — no baked-in identity. Nobody is admitted
    // until the operator adds their own login (what makes default-on `--docker` trust safe).
    expect(parsed.identityAllowlist).toEqual([]);
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

describe('listen specification (runtime-cli-docker Decision 2/4)', () => {
  it('back-compat: a config with no listen spec defaults to the loopback-TCP-only shape', () => {
    const parsed = configSchema.parse({ bearerToken: 'x' });
    // The prior shape: a direct/local loopback-TCP ingress on an ephemeral port, no serve ingress.
    expect(parsed.listen.direct).toEqual({ port: 0 });
    expect(parsed.listen.serve).toBeUndefined();
  });

  it('parses a direct-only spec', () => {
    const parsed = configSchema.parse({ bearerToken: 'x', listen: { direct: { port: 3000 } } });
    expect(parsed.listen.direct).toEqual({ port: 3000 });
    expect(parsed.listen.serve).toBeUndefined();
  });

  it('parses a serve-only spec (no direct ingress)', () => {
    const parsed = configSchema.parse({ bearerToken: 'x', listen: { serve: { port: 8080 } } });
    expect(parsed.listen.serve).toEqual({ port: 8080 });
    expect(parsed.listen.direct).toBeUndefined();
  });

  it('parses a dual spec (direct + dedicated serve ingress)', () => {
    const parsed = configSchema.parse({
      bearerToken: 'x',
      listen: { direct: { port: 0 }, serve: { port: 8080 } },
    });
    expect(parsed.listen.direct).toEqual({ port: 0 });
    expect(parsed.listen.serve).toEqual({ port: 8080 });
  });

  it('rejects an out-of-range serve port with a field-named issue', () => {
    const result = configSchema.safeParse({ bearerToken: 'x', listen: { serve: { port: 70000 } } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p === 'listen.serve.port')).toBe(true);
    }
  });

  it('rejects a negative direct port with a field-named issue', () => {
    const result = configSchema.safeParse({ bearerToken: 'x', listen: { direct: { port: -1 } } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p === 'listen.direct.port')).toBe(true);
    }
  });

  it('rejects direct and serve pinned to the SAME fixed port (impossible dual bind)', () => {
    const result = configSchema.safeParse({
      bearerToken: 'x',
      listen: { direct: { port: 8080 }, serve: { port: 8080 } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p === 'listen.serve.port')).toBe(true);
    }
  });

  it('allows direct and serve both ephemeral (port 0) — distinct ports are assigned at bind', () => {
    const parsed = configSchema.parse({
      bearerToken: 'x',
      listen: { direct: { port: 0 }, serve: { port: 0 } },
    });
    expect(parsed.listen.direct).toEqual({ port: 0 });
    expect(parsed.listen.serve).toEqual({ port: 0 });
  });

  it('allows distinct fixed direct and serve ports', () => {
    const parsed = configSchema.parse({
      bearerToken: 'x',
      listen: { direct: { port: 3000 }, serve: { port: 4180 } },
    });
    expect(parsed.listen.direct).toEqual({ port: 3000 });
    expect(parsed.listen.serve).toEqual({ port: 4180 });
  });
});
