set shell := ["bash", "-uc"]

# List recipes by default.
default:
    @just --list

# Install all workspace dependencies.
install:
    pnpm install

# Build every workspace package (tsc for shared/server, tsup for the cli bin, vite for web).
build:
    pnpm -r build

# Runs the supervised API server against the real ~/.switchboard (config + repos/ + operations/ +
# .github-token all live there) and the Vite web app pointed at it. The server's loopback URL is
# read from its stdout and the bearer token from ~/.switchboard/config.json, so it works whether the
# port is fixed or ephemeral. Web/UI hot-reloads; the server runs from built dist, so SERVER code
# changes need a `just run` restart. Ctrl-C stops both.
#
# Run the full stack locally: API server (loopback) + web UI (localhost:5173).
run:
    #!/usr/bin/env bash
    set -euo pipefail
    root="{{justfile_directory()}}"
    config="$HOME/.switchboard/config.json"

    # Build the CLI bin the server runs from (+ its shared/server deps; incremental after the first).
    pnpm --filter "@switchboard/cli..." build

    # Start the supervised server (it uses/creates ~/.switchboard). Tee stdout so its loopback URL is
    # both visible and capturable; logs stay on stderr. The trap stops it when the recipe exits.
    url_log="$(mktemp)"
    node "$root/apps/cli/dist/index.js" start > >(tee "$url_log") &
    server_pid=$!
    trap 'kill "$server_pid" 2>/dev/null || true; rm -f "$url_log"' EXIT INT TERM

    # Wait for the direct loopback URL — the web app's API base.
    server_url=""
    for _ in $(seq 1 100); do
      server_url="$(grep -oE 'https?://127\.0\.0\.1:[0-9]+' "$url_log" | tail -1 || true)"
      [ -n "$server_url" ] && break
      sleep 0.2
    done
    [ -n "$server_url" ] || { echo "just run: server never reported a loopback URL — see logs above" >&2; exit 1; }

    # Bearer token comes from the config the server just used; warn (don't fail) if the browser
    # origin isn't allow-listed, since CORS would otherwise block the app with a confusing error.
    token="$(node -e 'process.stdout.write((require(process.argv[1]).bearerToken)||"")' "$config")"
    node -e 'const o=(require(process.argv[1]).cors?.allowedOrigins)||[];if(!o.includes("http://localhost:5173"))console.error("just run: add \"http://localhost:5173\" to cors.allowedOrigins in "+process.argv[1]+" or the browser will be blocked by CORS.")' "$config"

    # Web app in the foreground, pointed at the server with its bearer token.
    VITE_SERVER_URL="$server_url" VITE_BEARER_TOKEN="$token" pnpm --filter @switchboard/web dev

# Lint (ESLint flat config) and check formatting (Prettier).
lint:
    pnpm exec eslint .
    pnpm exec prettier --check .

# Type-check every TS project via project references.
typecheck:
    pnpm exec tsc -b

# Run unit tests (Vitest).
test:
    pnpm exec vitest run

# Run end-to-end tests (Playwright). Assumes `just build` has run (resolves built packages).
e2e:
    pnpm exec playwright test
