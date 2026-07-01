# Running Switchboard

Switchboard ships as the `switchboard` CLI (npm) that supervises the API server, and as a container
image that additionally brings up Tailscale so the app is reachable from your phone over your
tailnet. This guide covers both: a **local run** for development, and the **Docker run on the
tailnet** for everyday use.

> Security model in one line: the API binds **loopback only**. The **direct loopback ingress is
> bearer-only**; a **dedicated, non-host-published serve ingress** (reached only via `tailscale
> serve`) is the one place a Tailscale identity can be trusted — and only inside the container,
> where no API port is published to the host. See [Access model](#access-model).

## Local run (npm)

Requires Node `>=26`.

```sh
# one-off
npx switchboard start

# or install globally
npm i -g switchboard
switchboard start
```

On first run the CLI **bootstraps** `~/.switchboard`:

- `config.json` (mode `600`) with a generated **bearer token** and `trustServeIdentity: false`;
- `secrets/` and `run/` directories (mode `700`).

It prints the bound loopback URL(s) to stdout (logs go to stderr):

```
Switchboard listening (direct) on http://127.0.0.1:51764
```

A local run is **bearer-only** — there is no Tailscale in front of it, so authenticate every request
with the bearer token from `~/.switchboard/config.json`:

```sh
curl -H "Authorization: Bearer $(jq -r .bearerToken ~/.switchboard/config.json)" \
  http://127.0.0.1:51764/api/echo -d '{"message":"hi"}' -H 'content-type: application/json'
```

`GET /health` is unauthenticated. Press Ctrl-C to shut down gracefully; the supervisor restarts the
server on an unexpected crash with bounded backoff and gives up (non-zero exit) after repeated rapid
failures.

> A local `switchboard start` may NOT enable serve-identity trust on a serve ingress. The host
> serve port would be reachable from the host and is therefore never identity-eligible, so bootstrap
> **rejects** `trustServeIdentity` paired with a serve ingress unless you run with `--docker` (which
> asserts the serve port is not host-published). Use the bearer token locally.

## Run on the tailnet (Docker)

The container runs `switchboard start --docker`: the CLI is the in-container supervisor. It brings
up, in order, **userspace `tailscaled`** → `tailscale up` (mounted auth key) → the server on a
**dedicated loopback serve port** → the pinned `tailscale serve --bg --https=443
http://127.0.0.1:<servePort>` (after asserting Tailscale **>= v1.50.0**), and supervises both
`tailscaled` and the server for the container's lifetime. **No API port is published to the host** —
`tailscale serve` is the sole ingress.

The image also **bundles the built web SPA**, so the server serves the app itself over the serve
ingress — there is no separate web host. Once the container is up, open
`https://switchboard.<your-tailnet>.ts.net/` on your phone to use Switchboard.

### Prerequisites (Tailscale)

1. A Tailscale **auth key** — https://login.tailscale.com/admin/settings/keys (a reusable or
   ephemeral key works; it is mounted as a secret, never baked into the image).
2. **MagicDNS** enabled on your tailnet, and **HTTPS certificates** enabled (Admin console → DNS →
   HTTPS Certificates). `tailscale serve --https=443` needs these to terminate TLS and inject the
   authenticated identity.

### Build the image

```sh
docker build -t switchboard .
```

### Run

```sh
docker run -d --name switchboard \
  -e TS_AUTHKEY="tskey-auth-..." \
  -v switchboard-tsstate:/var/lib/tailscale \
  -v switchboard-config:/root/.switchboard \
  -v switchboard-claude:/root/.claude \
  switchboard
```

Notes:

- **No `-p` / published port.** Publishing the serve port would re-expose an identity-eligible
  ingress to the host and break the isolation the trust model depends on. The only way in is
  `tailscale serve` over the tailnet: `https://switchboard.<your-tailnet>.ts.net/`.
- **Named volumes** persist across restarts (Decision 7):
  - `/var/lib/tailscale` — Tailscale node state, so a restart **reconnects without re-auth**;
  - `/root/.switchboard` — `config.json` + `secrets/` + `run/`, so the **bearer token persists**;
  - `/root/.claude` — Claude credentials (see below).
- **Networking default is userspace** (`--tun=userspace-networking`) — no elevated capabilities
  needed. If userspace networking proves unreliable, fall back to **kernel TUN**:

  ```sh
  docker run -d --name switchboard \
    --cap-add=NET_ADMIN --device=/dev/net/tun \
    -e TS_AUTHKEY="tskey-auth-..." \
    -v switchboard-tsstate:/var/lib/tailscale \
    -v switchboard-config:/root/.switchboard \
    -v switchboard-claude:/root/.claude \
    switchboard
  ```

### Admit your tailnet identity (one step)

The served SPA reaches its API **same-origin and tokenless** — no secret rides in the browser;
your **Tailscale serve identity** authorises each `/api` call. For that to work the container must
admit your login:

- Under `--docker`, a **first-run** config is created with `trustServeIdentity: true` and an
  **empty `identityAllowlist`**. Trust is on, but the empty allowlist admits **nobody** (`403`) —
  a safe default — until you add your own login.
- **Add your tailnet login once.** Set `identityAllowlist` in
  `/root/.switchboard/config.json` (mode `600`) to your Tailscale login, e.g.:

  ```jsonc
  { "identityAllowlist": ["you@github"] } // your `tailscale-user-login`
  ```

  then `docker restart switchboard`. The web app now loads and its API calls succeed under your
  identity — no bearer token needed.
- **Upgrading an existing container?** A config provisioned before this change is **never silently
  upgraded**: its persisted `trustServeIdentity` and `identityAllowlist` are respected as-is (an
  absent trust field reads as **off**). To adopt the served-SPA model, set `trustServeIdentity: true`
  and add your login explicitly, then restart.

### Secrets

Mounted, never baked into the image and never logged:

- **Tailscale auth key** — `TS_AUTHKEY` (env / `--env-file`), or a file at
  `/root/.switchboard/secrets/tailscale-authkey`. Precedence: an explicit `TS_AUTHKEY_FILE` path
  wins; otherwise a raw `TS_AUTHKEY` / `TAILSCALE_AUTHKEY` value is materialised to the default
  secret file (atomic, mode `600`) and takes precedence over any stale persisted file — so rotating
  the env key recovers cleanly across restarts of the persistent config volume; otherwise the
  existing secret file is used.
- **GitHub PAT** — set `github.token` (a fine-grained PAT) in `/root/.switchboard/config.json`
  (mode `600`).

### Claude credentials (`~/.claude`)

`claude --remote-control` (the session-launch slice) needs a working `claude` login inside the
container. **Mounting a macOS host's `~/.claude` does not work** — on macOS the OAuth token lives in
the Keychain, not in `~/.claude/.credentials.json`. So:

1. Authenticate **once inside the container**, with `/root/.claude` mounted as a named volume:

   ```sh
   docker exec -it switchboard claude   # complete the login flow once
   ```

   The credential is written to the `switchboard-claude` volume and **persists across restarts**.

2. Alternatively, run on a **Linux host** where `~/.claude/.credentials.json` exists and mount that.

Without a working login, `claude` launches fail at runtime as a typed launch error (surfaced in the
session-launch slice), not a crash.

## Access model

| Ingress                          | Reachable from         | Auth                                                            |
| -------------------------------- | ---------------------- | -------------------------------------------------------------- |
| Direct loopback (`127.0.0.1`)    | the host / local dev   | **bearer token only** — `tailscale-user-*` headers are ignored |
| Dedicated **serve** ingress      | only via `tailscale serve` (tailnet) | Tailscale **identity** (when `trustServeIdentity` + container isolation) **or** bearer |

Identity eligibility is a **bind-time** property of *which listener* accepted the connection, not
anything read from a request header. The serve ingress is identity-eligible **only** in the
container runtime (where no API port is host-published); a forged `tailscale-user-*` header on the
direct loopback ingress — or on a host-reachable serve port — grants **nothing**. Allowlist trusted
identities via `identityAllowlist` in `config.json`; trust defaults **off** in the mode-agnostic
schema, but a first-run `--docker` config enables it (with an **empty** allowlist, so nobody is
admitted until you add a login — see [Admit your tailnet identity](#admit-your-tailnet-identity-one-step)).

Only the reserved **`/api/*`** namespace is gated; every other path is the **public web SPA** (static
assets + the `index.html` history fallback), served without auth because the bundle carries no
secrets. The served SPA therefore calls `/api` **tokenless** (authorised by serve identity), while a
local `switchboard start` (bearer-only, no SPA) is reached with the bearer token from `~/.switchboard`.
