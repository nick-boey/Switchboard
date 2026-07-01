/**
 * Runtime configuration the web shell needs to reach its server (design Decision 7).
 *
 * The server runs on a loopback port that is only known once `start(ctx)` has booted, and the
 * bearer token is a per-install secret — neither can be baked into the static bundle. So the
 * app reads them at runtime from a global the host page injects (`window.__SWITCHBOARD_CONFIG__`),
 * falling back to Vite env vars for local `vite dev`. NO secret is committed: the E2E generates
 * a throwaway token and injects it via `page.addInitScript`, and a real deployment injects the
 * install's token the same way.
 */
export interface SwitchboardRuntimeConfig {
  /** Base URL of the `start(ctx)` server, e.g. `http://127.0.0.1:54123`. */
  serverUrl: string;
  /** Bearer token for the always-available bearer auth path (Decision 3). */
  bearerToken: string;
}

interface InjectedWindow {
  __SWITCHBOARD_CONFIG__?: Partial<SwitchboardRuntimeConfig>;
}

export function readRuntimeConfig(): SwitchboardRuntimeConfig {
  const injected =
    typeof window === 'undefined'
      ? undefined
      : (window as unknown as InjectedWindow).__SWITCHBOARD_CONFIG__;

  const env = import.meta.env;
  return {
    // serve-web-spa: default to the page ORIGIN when nothing is injected — the served SPA is
    // same-origin, so `hc` always has a valid base (never empty). Injected config / Vite env
    // (the local `just run` dev path) still take precedence.
    serverUrl:
      injected?.serverUrl ??
      env.VITE_SERVER_URL ??
      (typeof window === 'undefined' ? '' : window.location.origin),
    // Empty ⇒ tokenless (serve identity authorises). The dev path injects a bearer token.
    bearerToken: injected?.bearerToken ?? env.VITE_BEARER_TOKEN ?? '',
  };
}
