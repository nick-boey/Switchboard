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
   * GitHub PAT / API config (repo-clone-browse). Unset/`null` ⇒ GitHub features disabled
   * (the "not configured" state). See `githubConfigSchema`.
   */
  github: githubConfigSchema,
});

export type AppConfig = z.infer<typeof configSchema>;
export type GithubConfig = z.infer<typeof githubConfigSchema>;
