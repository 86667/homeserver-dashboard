# Account page

The public page for the people who use a Pubky homeserver. They sign up with [Pubky Ring](https://pubkyring.app/) and an invite code, or sign in to an account they already have, and the page confirms their pubky has an account on this homeserver. To invite someone, send them `https://<page>/?token=<code>`: the page fills in the code and checks it before offering sign-up. On a homeserver with open sign-ups no code is asked for.

It is a separate app from the admin dashboard in the rest of this repository, built and shipped as its own image. It is plain static files with no server side and no admin credential: the visitor's browser talks to the homeserver's public API itself. It shares only the dashboard's UI primitives and theme (see [Code layout](#code-layout)).

## Configuration

Three settings, read when the container starts and handed to the page as `config.json`. None is a secret.

| Variable                | Description                                                                                                                                               | Default                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `HOMESERVER_PUBLIC_KEY` | The homeserver's public key (the `public_key` its admin `/info` reports). The page finds the homeserver by it.                                            | unset: the page says it is not set up |
| `AUTH_RELAY`            | HTTP relay Pubky Ring answers through. Visitors' browsers wait on it, so it must be reachable from them (never `localhost`), over HTTPS when the page is. | the Pubky SDK's relay                 |
| `PUBKY_TESTNET_HOST`    | Development only: use a local pubky-testnet on this host instead of mainnet.                                                                              | unset                                 |

A value that is set but malformed stops the container at start.

## Running it

```sh
docker build -f account/Dockerfile -t homeserver-account .   # from the repository root
docker run -p 8080:8080 -e HOMESERVER_PUBLIC_KEY=<key> homeserver-account
```

The image serves the page on port 8080 with nginx, as an unprivileged user, with a strict Content Security Policy. Put it behind your TLS proxy, ideally on a sub-domain of the homeserver's domain (e.g. `account.example.com` next to `homeserver.example.com`); see the limits below for why.

## How it works

The page has three tabs, like the admin dashboard: **Account**, **Activity** and **Homeserver**. Only the first is built so far; the other two say what they will show.

- The invite code check and the "are codes required?" check are the homeserver's public `GET /signup_tokens/{code}`.
- The page asks Ring to sign the read-only capability `/homeserver-dashboard/account:r`, which is outside the user's storage and grants nothing there. For a sign-up, Ring first creates the keys and registers them on the homeserver with the invite code. Ring returns the signed token through the relay.
- The browser signs in with the token at this homeserver (`POST /session`), the way any Pubky app would. The sign-in is addressed to this homeserver's key, not wherever the person's own record points, so an account elsewhere is never mistaken for one here. An account answers with a session, which the page signs out again at once; an unknown pubky answers 404. The homeserver checks the token's signature and freshness and accepts each token only once.
- After a sign-up the page reads the code's status again: a spent code means a new account, a still-unused one means Ring approved with a key that was already signed up here.
- Once signed in, the Account tab shows the person's pubky.app profile and their public files, grouped by the app that wrote them, with the space they take. All of it comes from the homeserver's public storage API (`GET /storage/<pubky>/pub/…`): the listing names the files, and each size is a `HEAD` request, a few at a time, up to 2000 files. The profile is `pub/pubky.app/profile.json`; its image is fetched and shown as a `data:` URL, since the page's Content-Security-Policy allows no other image source. Nothing here needs a session: a person's public files are public. The storage allowance is an admin matter and is not shown.

Because every request comes from the visitor's own browser, the homeserver sees each visitor's address and applies its rate limits per visitor. The page never sees a private key and forgets everything on reload.

## Roadmap

- **Activity tab:** the homeserver's public event feed (`GET /events/`) as a day-by-day timeline of files added, changed and removed, who has been active, and which apps they use; with a signed-in visitor's own changes marked.
- **Homeserver tab:** the homeserver's public key and domain, the features it supports (`GET /info`), and when its record on the Pubky network was last published.

## Known limits

- **Disabled accounts look normal.** The homeserver lets a disabled account sign in, so the page cannot tell, and still says the person has an account.
- **Sessions can be left open.** The page signs each check's session out again, which needs the homeserver's cookie. When the page is on another site than the homeserver, that cookie is third-party, and browsers that block those (Safari, for one) leave the session open. Serve the page from a sub-domain of the homeserver's domain to keep it first-party. A session left open grants only the page's capability.
- **Polling outlives the attempt.** The SDK cannot stop waiting on the relay, so after Cancel an abandoned request keeps polling quietly until the page is closed.
- **The homeserver's rate limits trust a header.** The homeserver keys its limits on the first `X-Forwarded-For` entry a client sends, so a client talking to it directly can sidestep them. That is upstream behaviour, not something this page adds.

## Development

```sh
cd account
npm install
HOMESERVER_PUBLIC_KEY=<key> npm run dev     # the dev server serves config.json from the environment
npm test                                    # unit tests (Vitest)
npm run typecheck
npm run build                               # static files in dist/
```

`npm run e2e` drives the page in Chrome against a local pubky-testnet, with the Pubky SDK playing Ring; it skips when no testnet answers. See the header of `e2e/account.spec.mjs` for its settings.

## Code layout

| Path                       | What                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/components/`          | The page: `AccountFlow` (the tabs) and the Account tab's steps and cards; `ActivityTab` and `HomeserverTab` are placeholders. |
| `src/useAccountFlow.ts`    | The sign-up/sign-in steps as a state machine.                                                                                 |
| `src/usePublicFiles.ts`    | A signed-in person's public files, with sizes read a few at a time.                                                           |
| `src/useProfile.ts`        | Their pubky.app profile.                                                                                                      |
| `src/homeserver-client.ts` | The only module that loads the Pubky SDK: invite checks, Ring requests, sign-in checks, public file and profile reads.        |
| `src/config.ts`            | Loads and checks `config.json`.                                                                                               |
| `docker/`                  | nginx config, security headers, and the start-up script that writes `config.json`.                                            |

From the rest of the repository the page uses only `src/components/ui`, `src/hooks/useCopyFeedback.ts`, `src/lib/utils.ts`, `src/lib/pubky-ring.ts`, `src/app/theme.css` and `public/`, through the aliases in `vite.config.ts` (`SHARED`). Nothing else of the admin app is reachable from here, and the image is built from those files only (`Dockerfile.dockerignore`).
