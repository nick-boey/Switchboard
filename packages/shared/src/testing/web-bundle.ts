import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A throwaway built-web-bundle fixture for SPA static-serving + history-fallback tests (task 1.1). */
export interface WebBundleFixture {
  /** Absolute path to use as `RuntimeContext.webRoot`. */
  webRoot: string;
  /** The marker text embedded in `index.html` (assert it in history-fallback responses). */
  indexMarker: string;
  /** An existing asset path relative to the web root, e.g. `/assets/app.js`. */
  assetPath: string;
  /** The asset's body text (assert it when the asset is served). */
  assetBody: string;
  /** Remove the fixture directory. */
  cleanup(): void;
}

/**
 * Create a minimal built-SPA bundle on disk: `index.html` (the history-fallback shell) plus one
 * `/assets/<file>` (a real static asset). Mirrors the shape of `apps/web/dist` so the server's
 * static serving + `index.html` history fallback are assertable in unit/integration tests without
 * a real Vite build. Pass `{ omitIndex: true }` to model a configured-but-missing bundle (the
 * `503` case).
 */
export function makeWebBundleFixture(options: { omitIndex?: boolean } = {}): WebBundleFixture {
  const webRoot = mkdtempSync(join(tmpdir(), 'switchboard-web-bundle-'));
  const indexMarker = '<!-- switchboard-spa-shell -->';
  const assetBody = 'export const marker = "switchboard-asset";\n';
  const assetPath = '/assets/app.js';

  if (!options.omitIndex) {
    writeFileSync(
      join(webRoot, 'index.html'),
      `<!doctype html><html><head><title>Switchboard</title></head><body>${indexMarker}<div id="root"></div><script type="module" src="${assetPath}"></script></body></html>\n`,
    );
  }
  mkdirSync(join(webRoot, 'assets'), { recursive: true });
  writeFileSync(join(webRoot, 'assets', 'app.js'), assetBody);

  return {
    webRoot,
    indexMarker,
    assetPath,
    assetBody,
    cleanup: () => rmSync(webRoot, { recursive: true, force: true }),
  };
}
