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

export const configSchema = z.object({
  /** Bearer token for the always-available bearer auth path; generated on first run. */
  bearerToken: z.string().min(1),
  /**
   * Trust the Tailscale serve identity headers. Defaults OFF — only enabled in a deployment
   * guaranteeing `tailscale serve` is the exclusive ingress (design Decision 3). When off,
   * `tailscale-user-*` headers are ignored regardless of markers.
   */
  trustServeIdentity: z.boolean().default(false),
  /** Allowlisted serve identities admitted without a bearer token (when trust is on). */
  identityAllowlist: z.array(z.string()).default(['nick-boey@github']),
  telemetry: telemetryConfigSchema,
  cors: corsConfigSchema,
  /**
   * RESERVED slot for the GitHub PAT / credential helper config — populated by the
   * `repo-clone-browse` change, not here (design Non-Goals). Kept `null` for now.
   */
  github: z.null().default(null),
});

export type AppConfig = z.infer<typeof configSchema>;
