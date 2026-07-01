import { z } from 'zod';

/**
 * The `~/.switchboard/config.json` schema (design Decision 6). `packages/shared` owns this
 * so the server, CLI, and Playwright all parse identical config. `loadConfig()` (see
 * `./load-config.ts`) reads + validates a file against this schema; `start(ctx)` then runs
 * with the already-parsed `AppConfig` on its `RuntimeContext` and performs no file I/O.
 */

/** Telemetry exporter selection (design Decision 5). `none` is the secure default. */
export const telemetryExporterSchema = z.enum(['none', 'console', 'otlp']);
export type TelemetryExporter = z.infer<typeof telemetryExporterSchema>;

export const telemetryConfigSchema = z
  .object({
    exporter: telemetryExporterSchema.default('none'),
    /** Required when `exporter` is `otlp`; ignored otherwise. */
    otlpEndpoint: z.string().url().optional(),
  })
  .default({ exporter: 'none' });

export const corsConfigSchema = z
  .object({
    /** Explicitly allowed browser origins (in addition to same-origin). No wildcard. */
    allowedOrigins: z.array(z.string()).default([]),
  })
  .default({ allowedOrigins: [] });

/**
 * GitHub integration config (repo-clone-browse, design Decision 8). The PAT is sourced from
 * `~/.switchboard` out-of-band; `apiBaseUrl` defaults to the public API and is overridable so
 * the E2E can point the provider at the fake GitHub. Unset/`null` ⇒ GitHub features disabled
 * (the "not configured" state), keeping an existing config backward-compatible.
 */
export const githubConfigSchema = z
  .object({
    /** Fine-grained PAT read from `~/.switchboard` (perms `600`). */
    token: z.string().min(1),
    /** GitHub REST base URL; overridden in tests/E2E. */
    apiBaseUrl: z.string().url().default('https://api.github.com'),
  })
  .nullable()
  .default(null);

/**
 * The runtime **listen specification** (`runtime-cli-docker` Decision 2/4). Describes which
 * loopback-TCP ingresses `start(ctx)` binds:
 *
 * - `direct` — the direct/local loopback-TCP ingress (bearer-only). `port: 0` is ephemeral (the
 *   prior default shape).
 * - `serve` — the OPTIONAL dedicated loopback-TCP serve ingress on its own port: the
 *   serve-exclusive ingress that `tailscale serve` proxies to (`http://127.0.0.1:<port>`), bound
 *   only inside the container's network namespace and never published to the host.
 *
 * The server ALWAYS binds loopback (`127.0.0.1`) for both — the host is not configurable, so the
 * "loopback bind only" invariant cannot be weakened by config. The schema is **mode-agnostic**:
 * it carries no host/container assertion (that is a CLI bootstrap input — Decision 4). Defaults
 * to the prior loopback-TCP-only shape (direct ingress, ephemeral port) for back-compat.
 */
export const directIngressSchema = z.object({
  /** Direct/local loopback-TCP port; `0` (the default) binds an ephemeral port. */
  port: z.number().int().min(0).max(65535).default(0),
});
export const serveIngressSchema = z.object({
  /** Dedicated serve-ingress loopback-TCP port; `0` binds an ephemeral port (resolved at bind). */
  port: z.number().int().min(0).max(65535),
});
export const listenConfigSchema = z
  .object({
    direct: directIngressSchema.optional(),
    serve: serveIngressSchema.optional(),
  })
  .superRefine((listen, ctx) => {
    // A direct ingress and a serve ingress pinned to the SAME fixed (non-ephemeral) port can never
    // both bind — the second listener always hits EADDRINUSE, leaking the first. Reject the
    // impossible spec at validation rather than half-binding at runtime. Port 0 is ephemeral (the
    // OS assigns each listener a distinct port), so two ephemeral ingresses are fine.
    const direct = listen.direct?.port;
    const serve = listen.serve?.port;
    if (direct !== undefined && serve !== undefined && direct !== 0 && direct === serve) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['serve', 'port'],
        message:
          'serve port must differ from the direct port — the same fixed port cannot bind two listeners',
      });
    }
  })
  .default({ direct: { port: 0 } });
export type ListenConfig = z.infer<typeof listenConfigSchema>;

export const configSchema = z.object({
  /** Bearer token for the always-available bearer auth path; generated on first run. */
  bearerToken: z.string().min(1),
  /**
   * Trust the Tailscale serve identity headers. Defaults OFF — only enabled in a deployment
   * guaranteeing `tailscale serve` is the exclusive ingress (design Decision 3). When off,
   * `tailscale-user-*` headers are ignored regardless of markers.
   */
  trustServeIdentity: z.boolean().default(false),
  /**
   * Allowlisted serve identities admitted without a bearer token (when trust is on). Defaults
   * **empty** (serve-web-spa F1): no baked-in identity, so even with `trustServeIdentity` on
   * (the `--docker` first-run default) nobody is admitted (`403`) until the operator adds their
   * own tailnet login. Affects fresh bootstraps only; an existing config's persisted allowlist
   * is preserved.
   */
  identityAllowlist: z.array(z.string()).default([]),
  /**
   * The runtime listen specification (`runtime-cli-docker` Decision 2/4). Defaults to the prior
   * loopback-TCP-only shape (direct ingress, ephemeral port) so existing configs stay valid.
   */
  listen: listenConfigSchema,
  telemetry: telemetryConfigSchema,
  cors: corsConfigSchema,
  /**
   * GitHub PAT / API config (repo-clone-browse). Unset/`null` ⇒ GitHub features disabled
   * (the "not configured" state). See `githubConfigSchema`.
   */
  github: githubConfigSchema,
});

export type AppConfig = z.infer<typeof configSchema>;
export type GithubConfig = z.infer<typeof githubConfigSchema>;
export type DirectIngressConfig = z.infer<typeof directIngressSchema>;
export type ServeIngressConfig = z.infer<typeof serveIngressSchema>;
