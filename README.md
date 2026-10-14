# Homeserver Dashboard

A small web-based admin dashboard for Pubky homeservers. Built with **Next.js (App Router)**, **React**, and **Tailwind + shadcn/ui**.

The UI lives under a single route: **`/dashboard`** (the home page redirects there).

## Current UI

The dashboard has 6 tabs:

- **Overview**: Shows homeserver stats from `GET /info` including connection status, public key, addresses, version, and user/storage statistics
- **Users**: Disable / enable a user by pubkey via `POST /users/{pubkey}/disable` and `POST /users/{pubkey}/enable`. The disabled-users list is fetched live from the `/users/disabled` admin endpoint.
- **Invites**: Generate signup tokens via `GET /generate_signup_token` with QR code display for easy mobile app signup; view invite statistics (total generated, used, unused)
- **Files**: Full WebDAV file browser (list/read/write/delete/move/create directories) using the `/dav/*` endpoint (Basic Auth). Includes admin "Delete from path" for removing entries by path
- **Logs**: Tails the homeserver's JSON-line log file (level filter, line count). Requires `HOMESERVER_LOG_PATH`; the tab shows as unavailable when it is not set
- **API**: API Explorer for admin/client/metrics endpoints (manual requests)

The navbar **Settings** (gear) button opens **Settings** with two tabs: **Config** (view AND edit the real `config.toml`, with sensitive fields redacted, optimistic-concurrency checks, and atomic writes; falls back to read-only when the file is not writable) and **Cloudflare** (expose the homeserver publicly without port forwarding: a guided **Connect Cloudflare account** flow, an **API token** flow, a manual token/domain form, and a temporary **Preview** tunnel).

## Prerequisites

- Node.js 24+ and npm (matches the `engines` field, CI, and the Docker base image)
- A running Pubky homeserver - every UI section above is wired to live admin endpoints

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env.local` (or create `.env.local` manually):

```bash
cp .env.example .env.local
```

Edit `.env.local` with your homeserver details:

```bash
# Homeserver admin endpoint (server-only variables)
ADMIN_BASE_URL=http://localhost:6288
ADMIN_TOKEN=your-admin-password
```

**Note:** These are server-only environment variables (not prefixed with `NEXT_PUBLIC_*`) to keep sensitive credentials secure. They are only accessible in API routes and server-side code, never exposed to the client browser.

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

### 4. Build for Production

```bash
npm run build
npm start
```

## Docker Deployment

The dashboard can be deployed using Docker, either standalone or as part of an Umbrel app.

### Standalone Docker

Build the Docker image:

```bash
docker build -t homeserver-dashboard .
```

Run the container:

```bash
docker run -d \
  -p 8080:8080 \
  -e PORT=8080 \
  -e ADMIN_BASE_URL=http://homeserver:6288 \
  -e ADMIN_TOKEN=your-admin-password \
  homeserver-dashboard
```

### Umbrel Deployment

The dashboard is included in the `pubky-homeserver` Umbrel app. When deployed via Umbrel:

- The dashboard runs as the `web` service in `docker-compose.yml`
- Environment variables (`ADMIN_BASE_URL`, `ADMIN_TOKEN`) are automatically configured
- The dashboard connects to the homeserver service via Docker networking (`http://homeserver:6288`)
- Access is provided through Umbrel's app proxy (no direct port exposure needed)

The Dockerfile uses Next.js standalone output for optimal image size and includes:

- Multi-stage build for smaller production image
- Non-root user for security
- Proper handling of server-only environment variables

## Configuration

### Environment Variables

All variables are server-only (no `NEXT_PUBLIC_*` prefix) and read lazily at request time.

| Variable                  | Description                                                                                         | Required       | Default                                | What breaks without it                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| `ADMIN_BASE_URL`          | Homeserver admin API base URL                                                                       | Yes\*          | -                                      | Admin proxy, invites, users, file browser all fail                                 |
| `ADMIN_TOKEN`             | Admin password/token                                                                                | Yes\*          | -                                      | Same as above, plus the password reveal in Settings                                |
| `CLIENT_BASE_URL`         | Homeserver client API base URL                                                                      | No             | `http://homeserver:6286`               | API explorer's client group proxies to the wrong host                              |
| `HOMESERVER_PUBLIC_KEY`   | The homeserver's public key; the `/account` page finds the homeserver by it                         | For `/account` | unset                                  | `/account` says it is not set up                                                   |
| `AUTH_RELAY`              | HTTP relay the `/account` page's Pubky Ring requests use; must be reachable from visitors' browsers | No             | the Pubky SDK's relay                  | -                                                                                  |
| `PUBKY_TESTNET_HOST`      | Development only: `/account` uses a local pubky-testnet on this host instead of mainnet             | No             | unset                                  | -                                                                                  |
| `METRICS_BASE_URL`        | Homeserver metrics base URL                                                                         | No             | `http://homeserver:6289`               | API explorer's metrics group proxies to the wrong host                             |
| `HOMESERVER_CONFIG_PATH`  | Path to homeserver `config.toml`                                                                    | No             | `/app/homeserver-data/config.toml`     | Settings config editor, Cloudflare disconnect reset, restart-pending detection     |
| `HOMESERVER_LOG_PATH`     | Path to homeserver JSON-line log file                                                               | No             | unset (logs disabled)                  | `/api/logs` answers 503; the Logs tab shows as unavailable                         |
| `CLOUDFLARE_CONFIG_DIR`   | Cloudflare state dir (token, domain, ...)                                                           | No             | `/app/cloudflare-config`               | Cloudflare tab reports the feature as unsupported                                  |
| `CLOUDFLARED_BIN`         | cloudflared binary path                                                                             | No             | `/usr/local/bin/cloudflared`           | Connect (browser-auth) and Preview (quick tunnel) flows cannot spawn cloudflared   |
| `CLOUDFLARED_RUNTIME_DIR` | Config dir path as seen by the runtime cloudflared container                                        | No             | `/etc/cloudflared-config`              | Generated `config.yml` points at the wrong `credentials-file` path                 |
| `PREVIEW_INSTANT_ORIGIN`  | Origin the instant preview tunnel forwards to                                                       | No             | `http://homeserver:6286`               | Preview's instant tunnel forwards to the wrong origin                              |
| `CF_API_BASE`             | Cloudflare API base URL                                                                             | No             | `https://api.cloudflare.com/client/v4` | Tests/e2e override only; leave unset in production                                 |
| `ADMIN_PASSWORD_MANAGED`  | Set `true` on managed platforms (Umbrel)                                                            | No             | unset                                  | When unset, `admin_password` stays editable; Umbrel sets it to protect the pairing |
| `PLATFORM`                | `umbrel` on the Umbrel app; unset/anything else = standalone                                        | No             | unset (standalone)                     | See "Standalone vs Umbrel" below                                                   |
| `PORT` / `HOSTNAME`       | Next.js standalone server binding                                                                   | No             | `8080` / `0.0.0.0` (Dockerfile)        | Server binds elsewhere                                                             |

### Standalone vs Umbrel

The same image serves both deployments; `PLATFORM` selects the experience:

- **`PLATFORM=umbrel`** (set by the Umbrel app): shows the Cloudflare setup tab and flows, umbrelOS backup guidance, and "restart the app from Umbrel" copy.
- **unset / standalone**: the Cloudflare _setup_ UI and its `/cloudflare-guide` are hidden, and the Cloudflare setup API routes return `404 not_supported` — the dashboard doesn't run the cloudflared containers a standalone deployment lacks, so the tunnel can't be established here. The read-only status views (public address, reachability, the pkarr "Pubky network" check) stay, so if you front the homeserver with your own reverse proxy or tunnel you can still see whether it's reachable and correctly published. Restart copy and the backup note are generic.

### Account page for users

`/account` is the page for the people who use this homeserver. They sign up with [Pubky Ring](https://pubkyring.app/) and an invite code, or sign in to an account they already have, and the page confirms their pubky has an account here. To invite someone, send them `/account?token=<code>`: the page fills in the code and checks it with the homeserver before offering sign-up. On a homeserver with open sign-ups no code is asked for.

It needs `HOMESERVER_PUBLIC_KEY` (the `public_key` the admin `/info` reports). Without it the page says it is not set up. `HOMESERVER_PUBLIC_KEY`, `AUTH_RELAY` and `PUBKY_TESTNET_HOST` are the exception to the server-only rule above: the page hands them to visitors' browsers. None of them is a secret.

**How it works.** The page has no server side beyond reading that config: the visitor's browser talks to the homeserver's public API itself, through the Pubky SDK, which finds the homeserver by its key. So the homeserver sees each visitor's own address and applies its rate limits per visitor, and no admin credential is involved anywhere.

- The invite code check and the "are codes required?" check are the homeserver's public `GET /signup_tokens/{code}`.
- The page asks Ring to sign the read-only capability `/homeserver-dashboard/account:r`, which is outside the user's storage and grants nothing there. For a sign-up, Ring first creates the keys and registers them on the homeserver with the invite code. Ring returns the signed token through the relay.
- The browser signs in with the token at this homeserver (`POST /session`), the way any Pubky app would. The sign-in is addressed to this homeserver's key, not wherever the person's own record points, so an account elsewhere is never mistaken for one here. An account answers with a session, which the page signs out again at once; an unknown pubky answers 404. The homeserver checks the token's signature and freshness and accepts each token only once.
- After a sign-up the page reads the code's status again: a spent code means a new account, a still-unused one means Ring approved with a key that was already signed up here.

The page never sees a private key and forgets everything on reload.

`AUTH_RELAY` is handed to visitors' browsers, which wait on it for Ring's answer, so it must be an address they can reach (never `localhost`), over HTTPS when the page is served over HTTPS.

**Known limits.**

- **Disabled accounts look normal.** The homeserver lets a disabled account sign in, so the page cannot tell, and still says the person has an account.
- **Sessions can be left open.** The page signs each check's session out again, which needs the homeserver's cookie. When the page is on another site than the homeserver, that cookie is third-party, and browsers that block those (Safari, for one) leave the session open. Serve the page from a sub-domain of the homeserver's domain (e.g. `account.example.com` next to `homeserver.example.com`) to keep it first-party. A session left open grants only the page's capability.
- **Polling outlives the attempt.** The SDK cannot stop waiting on the relay, so after Cancel an abandoned request keeps polling quietly until the page is closed.
- **The homeserver's rate limits trust a header.** The homeserver keys its limits on the first `X-Forwarded-For` entry a client sends, so a client talking to it directly can sidestep them. That is upstream behaviour, not something this page adds.

**Running it publicly.** The page needs no admin credentials, but the rest of the dashboard has no login of its own and holds the admin password. Serving the page from the same instance as the admin dashboard leaves the admin side one proxy misconfiguration, or one server bug, away from the internet. Run a separate instance for the public page instead, with `HOMESERVER_PUBLIC_KEY` (and optionally `AUTH_RELAY`) set and **no** `ADMIN_TOKEN`, `ADMIN_BASE_URL` or `HOMESERVER_CONFIG_PATH`, and with no access to the homeserver's `config.toml`, which holds the admin password. Expose only the page's paths, for example with Caddy:

```
account.example.com {
    @public path /account /_next/* /PubkyHomeserver.svg /pubky-favicon.svg /icon.svg
    handle @public {
        reverse_proxy 127.0.0.1:8081
    }
    handle {
        respond 404
    }
}
```

\* Required to use the real homeserver APIs

**Security Note:** These variables are server-only (not prefixed with `NEXT_PUBLIC_*`) to prevent exposing sensitive credentials to the browser. They are automatically loaded from `.env.local` in development and from environment variables in production/Docker.

**Docker Note:** In Docker/Umbrel deployments, use the homeserver service name for `ADMIN_BASE_URL` (e.g., `http://homeserver:6288`) instead of `localhost` to connect via Docker networking.

## Development

### Tech Stack

- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Styling
- **Shadcn UI** - Component library
- **Lucide React** - Icon library
- **Vitest** - Unit + integration test runner
- **ESLint / Prettier / Knip** - Repo hygiene tooling

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint (`eslint .`)
- `npm run lint:fix` - Fix lint issues (`eslint . --fix`)
- `npm run format` - Format files with Prettier
- `npm run format:check` - Check formatting (CI-friendly)
- `npm run knip` - Check for unused files/deps/exports (see `knip.json`)
- `npm test` - Run Vitest
- `npm run test:watch` - Run Vitest in watch mode
- `npm run test:coverage` - Run Vitest with coverage thresholds (CI gate)
- `npm run e2e` - Run the end-to-end suite (`scripts/e2e/`); builds and boots the real server

## Contributing

This project is maintained by the Pubky team at Synonym. Contributions are welcome via pull request. Please ensure:

- Code follows the existing patterns
- Components use Shadcn UI primitives
- TypeScript types are properly defined
- Error handling is comprehensive
- CI gates (`lint`, `typecheck`, `format:check`, `knip`, `test:coverage`, `build`, `docker`) pass before requesting review

## Related Projects

- [pubky-core](https://github.com/pubky/pubky-core) - The homeserver this dashboard manages
- [franky](https://github.com/pubky/franky) - Reference UI implementation (design system source)
