// Node-only surface of @switchboard/shared, exposed at `@switchboard/shared/node` (kept out
// of the browser-facing barrel so Vite never externalizes `node:*`). Holds the config loader,
// which reads + writes `~/.switchboard/config.json` via `node:fs/os/path/crypto` (Codex
// finding 10.3). The CLI and server import `loadConfig` from here.
export { loadConfig } from './load-config.js';
export type { LoadConfigOptions } from './load-config.js';
