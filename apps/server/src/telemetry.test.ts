import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConsoleSpanExporter,
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ATTR_HTTP_REQUEST_METHOD, ATTR_URL_PATH } from '@opentelemetry/semantic-conventions';
import { configSchema, idForBranch } from '@switchboard/shared';
import { makeTestContext } from '@switchboard/shared/testing';
import {
  RedactingSpanProcessor,
  createSpanExporter,
  redactAttributes,
  telemetryMiddleware,
} from './telemetry';
import { createApp } from './app';

describe('redactAttributes (blocklist)', () => {
  it('masks blocklisted attribute keys', () => {
    const out = redactAttributes({
      'http.request.header.authorization': 'Bearer abc123',
      'auth.bearer_token': 'super-secret',
      'github.pat': 'ghp_aaaaaaaaaaaaaaaaaaaa',
      'git.clone_url': 'https://x-access-token:ghp_zzz@github.com/o/r.git',
      'git.branch': 'feature/secret-stuff',
      'fs.path': '/Users/nboey/secret.txt',
      'process.command_args': 'git clone https://token@github.com/o/r',
      'github.error.body': '{"message":"Bad credentials"}',
    });
    for (const v of Object.values(out)) {
      expect(v).toBe('[REDACTED]');
    }
  });

  it('preserves semconv HTTP/url attributes', () => {
    const out = redactAttributes({
      [ATTR_HTTP_REQUEST_METHOD]: 'GET',
      [ATTR_URL_PATH]: '/echo',
    });
    expect(out[ATTR_HTTP_REQUEST_METHOD]).toBe('GET');
    expect(out[ATTR_URL_PATH]).toBe('/echo');
  });

  it('scrubs secrets/PATs/clone-creds/abs-paths embedded in free-text values', () => {
    const out = redactAttributes({
      'log.message':
        'cloned /Users/nboey/work/repo using Bearer abcdef123456 and ghp_bbbbbbbbbbbbbbbbbbbb from https://user:pw@github.com/o/r',
    });
    const v = String(out['log.message']);
    expect(v).not.toContain('abcdef123456');
    expect(v).not.toContain('ghp_bbbbbbbbbbbbbbbbbbbb');
    expect(v).not.toContain('/Users/nboey/work/repo');
    expect(v).not.toContain('user:pw@');
  });

  it('masks plain clone URLs by value regardless of the attribute key (https + ssh forms)', () => {
    const out = redactAttributes({
      // Generic, non-`clone_url` keys — must be caught by VALUE shape, not the key.
      'rpc.request.payload': 'https://github.com/org/private.git',
      'custom.note': 'cloning git@github.com:org/private.git into place',
      'span.detail': 'fetching ssh://git@gitlab.com/org/private.git now',
    });
    expect(String(out['rpc.request.payload'])).not.toContain('github.com/org/private');
    expect(String(out['custom.note'])).not.toContain('git@github.com:org/private');
    expect(String(out['span.detail'])).not.toContain('ssh://git@gitlab.com/org/private');
  });

  it('masks branch/ref names under curated VCS keys (key-based)', () => {
    const out = redactAttributes({
      'git.branch': 'feature/secret-stuff',
      'vcs.ref': 'release/2.0',
      'switchboard.branch': 'main',
    });
    expect(out['git.branch']).toBe('[REDACTED]');
    expect(out['vcs.ref']).toBe('[REDACTED]');
    expect(out['switchboard.branch']).toBe('[REDACTED]');
  });
});

describe('RedactingSpanProcessor', () => {
  it('scrubs blocklisted attributes before they reach the exporter', async () => {
    const memory = new InMemorySpanExporter();
    const provider = new NodeTracerProvider({
      spanProcessors: [new RedactingSpanProcessor(new SimpleSpanProcessor(memory))],
    });
    const tracer = provider.getTracer('test');

    const span = tracer.startSpan('op');
    span.setAttribute('http.request.header.authorization', 'Bearer leak-me');
    span.setAttribute('git.branch', 'feature/leak');
    // Clone URL under a GENERIC key — must be value-masked before any exporter sees it.
    span.setAttribute('rpc.payload', 'https://github.com/org/private.git');
    span.setAttribute(ATTR_HTTP_REQUEST_METHOD, 'POST');
    span.end();

    await provider.forceFlush();
    const [recorded] = memory.getFinishedSpans();
    expect(recorded.attributes['http.request.header.authorization']).toBe('[REDACTED]');
    expect(recorded.attributes['git.branch']).toBe('[REDACTED]');
    expect(String(recorded.attributes['rpc.payload'])).not.toContain('github.com/org/private');
    expect(recorded.attributes[ATTR_HTTP_REQUEST_METHOD]).toBe('POST');
    await provider.shutdown();
  });
});

describe('createSpanExporter (config-driven selection)', () => {
  it('returns null for the default `none` exporter (nothing external)', () => {
    const cfg = configSchema.parse({ bearerToken: 'x' });
    expect(createSpanExporter(cfg)).toBeNull();
  });

  it('returns a ConsoleSpanExporter for `console`', () => {
    const cfg = configSchema.parse({ bearerToken: 'x', telemetry: { exporter: 'console' } });
    expect(createSpanExporter(cfg)).toBeInstanceOf(ConsoleSpanExporter);
  });

  it('returns an OTLPTraceExporter for `otlp` with an endpoint', () => {
    const cfg = configSchema.parse({
      bearerToken: 'x',
      telemetry: { exporter: 'otlp', otlpEndpoint: 'http://localhost:4318/v1/traces' },
    });
    expect(createSpanExporter(cfg)).toBeInstanceOf(OTLPTraceExporter);
  });
});

describe('telemetryMiddleware (semconv span per request)', () => {
  let provider: NodeTracerProvider | undefined;

  afterEach(async () => {
    if (provider) await provider.shutdown();
    provider = undefined;
    vi.restoreAllMocks();
  });

  it('records a semconv HTTP span for each handled request', async () => {
    const memory = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new RedactingSpanProcessor(new SimpleSpanProcessor(memory))],
    });
    const tracer = provider.getTracer('test');

    const app = createApp(makeTestContext(), { tracer });
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    await provider.forceFlush();
    const spans = memory.getFinishedSpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);
    const span = spans[0];
    expect(span.attributes[ATTR_HTTP_REQUEST_METHOD]).toBe('GET');
    expect(span.attributes[ATTR_URL_PATH]).toBe('/health');
  });

  it('uses the matched route TEMPLATE for the span name and url.path (never a concrete <wt-id>/slug)', async () => {
    const memory = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new RedactingSpanProcessor(new SimpleSpanProcessor(memory))],
    });
    const tracer = provider.getTracer('test');
    const app = createApp(makeTestContext(), { tracer });

    // A worktree id whose slug echoes a sensitive branch name — the no-leak guarantee treats the
    // branch (and the slug derived from it) as secret, so it must NOT appear in any exported span.
    const branch = 'fix/CVE-2026-private-embargo';
    const wtId = idForBranch(branch); // `<slug>--<hash>` — slug = `fix-cve-2026-private-embargo`
    const slug = wtId.split('--')[0];

    const res = await app.request(`/worktrees/acme/infra/${wtId}/status`, {
      headers: { Authorization: 'Bearer test-bearer-token' },
    });
    // No such operation on disk → 404, but the request is still traced.
    expect(res.status).toBe(404);

    await provider.forceFlush();
    const spans = memory.getFinishedSpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);

    // NEITHER the span name NOR any attribute value may carry the wt-id / slug.
    const haystack = spans
      .flatMap((s) => [s.name, ...Object.values(s.attributes).map((v) => String(v))])
      .join('\n');
    expect(haystack).not.toContain(slug);
    expect(haystack).not.toContain(wtId);
    // The low-cardinality template IS recorded (proves the route was traced, not dropped).
    expect(spans.some((s) => s.name === 'GET /worktrees/:owner/:repo/:wtId/status')).toBe(true);
  });

  it('console export writes spans to the console (and not elsewhere)', async () => {
    const dir = vi.spyOn(console, 'dir').mockImplementation(() => undefined);
    provider = new NodeTracerProvider({
      spanProcessors: [
        new RedactingSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter())),
      ],
    });
    const tracer = provider.getTracer('test');
    const app = createApp(makeTestContext(), { tracer });
    await app.request('/health');
    await provider.forceFlush();
    expect(dir).toHaveBeenCalled();
  });
});

describe('telemetry middleware export wiring', () => {
  it('uses telemetryMiddleware to attach spans', () => {
    // Sanity: the factory returns a middleware function.
    const memory = new InMemorySpanExporter();
    const provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(memory)],
    });
    const mw = telemetryMiddleware(provider.getTracer('t'));
    expect(typeof mw).toBe('function');
    void provider.shutdown();
  });
});
