# Switchboard runtime image (`runtime-cli-docker` Decisions 6/7) — productionizes spikes/runtime/.
#
# The CLI is the container entrypoint/supervisor: `switchboard start --docker` brings up userspace
# `tailscaled` -> `tailscale up` (mounted auth key) -> the supervised server on a dedicated loopback
# serve port -> the pinned `tailscale serve --bg --https=443 http://127.0.0.1:<servePort>` (after
# asserting Tailscale >= v1.50.0). NO API port is published to the host — `tailscale serve` is the
# SOLE ingress, so the serve port is reachable only inside the container's network namespace. That
# container network isolation is what makes the serve ingress serve-exclusive and identity-eligible
# (the bind-time trust property, Decision 3). Real bring-up is validated by the manual runtime check
# (tasks.md 11.1 / docs/user/running-switchboard.md), not CI.

# ---- builder: install + build the whole workspace, then deploy the CLI standalone ----------------
# Base matches the repo Node engine (package.json engines.node ">=26"; tsup target node26).
FROM node:26-alpine AS builder
# corepack is no longer bundled in the Node images, so install it before enabling it; it then reads
# the pinned pnpm from package.json `packageManager` (the single source of truth for the version).
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@11.4.0 --activate
WORKDIR /repo
COPY . .
# Build every package (tsc for shared/server, tsup for the cli bin), then `pnpm deploy` the CLI into
# a self-contained tree with its workspace deps (@switchboard/server, @switchboard/shared) and their
# transitive runtime deps (hono, @hono/node-server, zod, the OpenTelemetry SDK) resolved under it.
RUN pnpm install --frozen-lockfile \
 && pnpm -r build \
 && pnpm --filter @switchboard/cli --prod --legacy deploy /opt/switchboard

# ---- runtime: minimal image with tailscale + tmux + git + the deployed CLI -----------------------
FROM node:26-alpine AS runtime
# tailscaled + tailscale CLI (userspace networking — see ENTRYPOINT), tmux for session supervision,
# git for clones, ripgrep for Claude Code's file search, ca-certificates for TLS. The CLI asserts
# `tailscale >= v1.50.0` at bring-up; the Alpine `tailscale` package is a current stable release
# at/above that pinned floor.
RUN apk add --no-cache tailscale tmux git ripgrep ca-certificates

# The Claude Code CLI (`claude`) — the session orchestrator spawns it by BARE NAME for
# `--remote-control` launches (apps/server/src/sessions/orchestrator.ts), and the in-container login
# populates the /root/.claude volume. Pinned for reproducible builds (bump deliberately). npm 11 skips
# dependency lifecycle scripts by default, so this package's postinstall is explicitly allow-listed.
RUN npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code@2.1.196

# Keep the pinned CLI immutable + Alpine-correct:
#   DISABLE_AUTOUPDATER — stop the launch-time background self-update. Left on, it mutates/migrates
#     the bundled `claude.exe` at runtime, which transiently broke `claude` resolution across
#     container restarts and violates "the install is baked at build time, never a runtime download".
#   USE_BUILTIN_RIPGREP=0 — use the musl `ripgrep` apk-installed above, not Claude Code's glibc-built
#     bundled copy (which is unreliable under musl).
ENV DISABLE_AUTOUPDATER=1 \
    USE_BUILTIN_RIPGREP=0

# Build-time smoke: fail the image build loudly if the pinned `claude` (or its search tool) is not
# runnable — turns the "a runnable claude CLI is baked into the image" promise into a build invariant
# rather than a manual post-build check.
RUN claude --version && rg --version

# The deployed, self-contained CLI (its workspace + transitive deps resolved by `pnpm deploy`).
COPY --from=builder /opt/switchboard /opt/switchboard
# Expose the bin on PATH (the tsup banner gives dist/index.js a `#!/usr/bin/env node` shebang).
RUN chmod +x /opt/switchboard/dist/index.js \
 && ln -s /opt/switchboard/dist/index.js /usr/local/bin/switchboard

# tailscaled's state + control-socket dirs (the --docker bring-up points tailscaled at these).
RUN mkdir -p /var/lib/tailscale /var/run/tailscale

# --- Named volumes (Decision 7): a restart reconnects without re-auth and keeps config/credentials.
#   /var/lib/tailscale — Tailscale node state (reconnect to the tailnet without re-authenticating)
#   /root/.switchboard — config.json (600) + secrets/ + run/ (the generated bearer token persists)
#   /root/.claude      — Claude credentials, populated by an IN-CONTAINER `claude` login (a mounted
#                        macOS host ~/.claude does NOT carry a working login; spike Q4)
VOLUME ["/var/lib/tailscale", "/root/.switchboard", "/root/.claude"]

# --- Mounted secrets (Decision 7) — NEVER baked into an image layer and NEVER logged (redaction):
#   * Tailscale auth key  -> env TS_AUTHKEY (env-file / --env) OR file
#                            /root/.switchboard/secrets/tailscale-authkey
#   * GitHub PAT          -> /root/.switchboard config (`github.token`, file mode 600)
#
# --- Networking default = USERSPACE (no elevated capabilities). The ENTRYPOINT runs tailscaled with
#     `--tun=userspace-networking`, so the container needs NEITHER `NET_ADMIN` NOR `/dev/net/tun`.
#     Documented kernel-TUN fallback (only if userspace proves unreliable):
#       docker run --cap-add=NET_ADMIN --device=/dev/net/tun ...
#     (userspace remains the default; see docs/user/running-switchboard.md for the full run command.)
#
# NO EXPOSE / no `-p` published API port: `tailscale serve` (HTTPS/443) is the only path in
# (Decision 3/6). Publishing the serve port would re-expose an identity-eligible ingress to the host.
ENTRYPOINT ["switchboard", "start", "--docker"]
