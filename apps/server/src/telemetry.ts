import { type Context, SpanKind, SpanStatusCode, type Tracer } from '@opentelemetry/api';
import {
  ConsoleSpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
  type ReadableSpan,
  type Span,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
  ATTR_SERVER_ADDRESS,
  ATTR_URL_PATH,
  ATTR_URL_SCHEME,
} from '@opentelemetry/semantic-conventions';
import type { MiddlewareHandler } from 'hono';
import type { AppConfig } from '@switchboard/shared';
import type { AppEnv } from './app.js';

const REDACTED = '[REDACTED]';

/**
 * Attribute KEYS that are masked outright (design Decision 5): auth headers, bearer/PAT,
 * clone/remote/repo URLs, branch/ref names, command args, filesystem paths, and GitHub error
 * bodies.
 *
 * Branch/ref names cannot be detected by VALUE alone — a branch is just an arbitrary string
 * (`main`, `release/2.0`) indistinguishable from any other text — so curated KEY classification
 * is the correct mechanism for them. The application controls its own attribute keys, so a
 * curated sensitive-key set (case-insensitive, covering branch/ref/clone/remote/repo/url
 * variants) reliably masks them. Clone URLs, by contrast, ARE recognizable by shape and are
 * additionally masked by value below (see CLONE_URL_PATTERNS), regardless of key.
 */
const KEY_BLOCKLIST: readonly RegExp[] = [
  /authorization/i,
  /\bbearer\b/i,
  /token/i,
  /\bpat\b/i,
  /password|passwd/i,
  /secret/i,
  /credential/i,
  /clone[._-]?url/i,
  /(?:remote|repo|repository|vcs|git)[._-]?url/i,
  /branch/i,
  // worktree-management Decision 7: the `<wt-id>` slug can echo a branch, so the id, its slug,
  // and worktree paths are masked outright (the branch is already covered above).
  /worktree/i,
  /\bwt[._-]?id\b/i,
  /\bslug\b/i,
  /(?:^|[._-])refs?(?:$|[._-])/i,
  /arg(?:s|v)?\b/i,
  /command|cmdline/i,
  /\bcmd\b/i,
  /github.*(?:error|body)|(?:error|body).*github/i,
  /(?:file|fs|dir|local|abs|disk)[._-]?path/i,
  /(?:^|[._-])path$/i,
  /workspace[._-]?root|\bcwd\b/i,
];

/**
 * Semconv keys explicitly kept (never key-masked); their values are still value-scrubbed.
 * Intentionally exact (not a broad `http.*` prefix) so header attributes such as
 * `http.request.header.authorization` are NOT spared from the blocklist.
 */
const KEY_ALLOWLIST: readonly RegExp[] = [
  /^http\.request\.method$/i,
  /^http\.response\.status_code$/i,
  /^http\.route$/i,
  /^url\.(?:path|scheme|query|full)$/i,
  /^server\.(?:address|port)$/i,
  /^network\.(?:protocol|peer)\b/i,
];

/**
 * Git remote/clone URL shapes. These are masked by VALUE (regardless of attribute key) because
 * a clone URL is reliably recognizable by shape — unlike a branch name. Covers HTTP(S) URLs for
 * known VCS hosts, scp-like SSH (`git@host:owner/repo`), and `ssh://` URLs.
 */
const CLONE_URL_PATTERNS: readonly RegExp[] = [
  /\bhttps?:\/\/(?:[^\s/@]+@)?(?:[a-z0-9-]+\.)*(?:github\.com|gitlab\.com|bitbucket\.org|dev\.azure\.com|codeberg\.org|git\.sr\.ht)(?::\d+)?\/[^\s'"<>]+/gi,
  /\bgit@[a-z0-9.-]+:[^\s'"<>]+/gi,
  /\bssh:\/\/[^\s'"<>]+/gi,
];

/** Scrub clone URLs/secrets/PATs/embedded credentials/absolute filesystem paths out of free text. */
function scrubValue(value: string): string {
  let scrubbed = value;
  for (const pattern of CLONE_URL_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, '[REDACTED_URL]');
  }
  return scrubbed
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\bgh[posru]_[A-Za-z0-9]{16,}\b/g, '[REDACTED_PAT]')
    .replace(/[A-Za-z0-9._-]+:[^\s/@]+@/g, '[REDACTED_CREDENTIALS]@')
    .replace(/\/(?:Users|home|var|tmp|opt|etc|private|root|srv)\/[^\s'"]+/g, '[REDACTED_PATH]');
}

type AttrValue = string | number | boolean | Array<string | number | boolean | null | undefined>;

function scrubAttributeValue(value: AttrValue): AttrValue {
  if (typeof value === 'string') return scrubValue(value);
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? scrubValue(v) : v));
  }
  return value;
}

/**
 * Redact a set of span attributes against the blocklist BEFORE export (design Decision 5).
 * Blocklisted keys are masked entirely; other string values are scrubbed for embedded
 * secrets. This is telemetry-span redaction only — subprocess/PAT redaction is a later
 * change (see design Non-Goals).
 */
export function redactAttributes(
  attributes: Record<string, AttrValue | undefined>,
): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    const allowlisted = KEY_ALLOWLIST.some((r) => r.test(key));
    if (!allowlisted && KEY_BLOCKLIST.some((r) => r.test(key))) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = scrubAttributeValue(value);
  }
  return out;
}

/**
 * A span processor that redacts blocklisted attributes on the live span at `onEnd`, before
 * delegating to the wrapped processor/exporter (design Decision 5). Redaction runs ahead of
 * ANY exporter, so secrets never leave the process.
 */
export class RedactingSpanProcessor implements SpanProcessor {
  constructor(private readonly inner: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.inner.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    // `span.attributes` is the live attribute bag in the OTel SDK; mutate it in place so the
    // wrapped exporter only ever sees the redacted values.
    const mutable = span.attributes as Record<string, AttrValue>;
    const redacted = redactAttributes(mutable);
    for (const key of Object.keys(mutable)) delete mutable[key];
    Object.assign(mutable, redacted);
    this.inner.onEnd(span);
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }
}

/** Select the raw span exporter from config (design Decision 5). `none` → no export. */
export function createSpanExporter(config: AppConfig): SpanExporter | null {
  switch (config.telemetry.exporter) {
    case 'none':
      return null;
    case 'console':
      return new ConsoleSpanExporter();
    case 'otlp':
      return new OTLPTraceExporter(
        config.telemetry.otlpEndpoint ? { url: config.telemetry.otlpEndpoint } : {},
      );
  }
}

export interface Telemetry {
  tracer: Tracer;
  shutdown(): Promise<void>;
}

/**
 * Build the tracer provider from config: the selected exporter is always wrapped in the
 * redacting processor. For `none`, the provider has no exporting processor (spans are still
 * recorded by the SDK but nothing leaves the process).
 */
export function createTelemetry(config: AppConfig): Telemetry {
  const exporter = createSpanExporter(config);
  const spanProcessors = exporter
    ? [new RedactingSpanProcessor(new SimpleSpanProcessor(exporter))]
    : [];
  const provider = new NodeTracerProvider({ spanProcessors });
  return {
    tracer: provider.getTracer('@switchboard/server'),
    shutdown: () => provider.shutdown(),
  };
}

/**
 * Hono middleware that records one semconv HTTP SERVER span per handled request
 * (design Decision 5). Attributes follow OTel semantic conventions; the redacting processor
 * scrubs anything sensitive before export.
 *
 * The span name and `url.path` use the matched route **TEMPLATE** (e.g.
 * `/worktrees/:owner/:repo/:wtId/status`), never the concrete request path. The concrete path can
 * embed a worktree `<wt-id>` whose slug echoes a (sensitive) branch name; that low-cardinality
 * template carries no concrete id/slug, so it cannot leak — and span NAMES are not scrubbed by the
 * redacting processor (worktree-management no-leak guarantee). Hono resolves `c.req.routePath` to
 * the deepest matched handler's registered pattern once `next()` has run, so the template is read
 * after the downstream handlers complete.
 */
export function telemetryMiddleware(tracer: Tracer): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const method = c.req.method;
    const url = new URL(c.req.url);
    // Name starts as the bare method; it is refined to `<METHOD> <route-template>` in `finally`
    // once the matched route is known (the concrete path is never used).
    const span = tracer.startSpan(method, {
      kind: SpanKind.SERVER,
      attributes: {
        [ATTR_HTTP_REQUEST_METHOD]: method,
        [ATTR_URL_SCHEME]: url.protocol.replace(':', ''),
        [ATTR_SERVER_ADDRESS]: url.host,
      },
    });
    try {
      await next();
      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, c.res.status);
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      // The matched route template (low-cardinality, no concrete id/slug). Falls back to the
      // method alone if no route matched (e.g. a 404 with no registered pattern).
      const route = c.req.routePath;
      if (route) {
        span.updateName(`${method} ${route}`);
        span.setAttribute(ATTR_URL_PATH, route);
        span.setAttribute(ATTR_HTTP_ROUTE, route);
      }
      span.end();
    }
  };
}
