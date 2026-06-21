# Throwaway runtime spike — NOT part of the Switchboard build/monorepo.
# Proves the riskiest runtime assumptions before `foundations` bakes them in.
FROM node:22-alpine

# tailscale (tailscaled + tailscale CLI), tmux for session supervision,
# git for parity with the real runtime, curl for in-container probing.
RUN apk add --no-cache tailscale tmux git curl ca-certificates

WORKDIR /app
COPY server.mjs /app/server.mjs
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# App listens on loopback only; tailscale serve is the sole ingress (mirrors the
# planned security model: loopback bind + serve-injected identity).
ENV PORT=8080
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
