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

The page is laid out like the admin dashboard (same width, header with a sign-in pill, or a sign-out pill once signed in, footer) with three tabs: **Account**, **Activity** and **Homeserver**. Each tab's data is read when it is first opened.

- The invite code check and the "are codes required?" check are the homeserver's public `GET /signup_tokens/{code}`.
- The page asks Ring for a grant (the SDK's `startGrantAuthFlow`) with the capability `/:r`: read everything, write nothing. The root scope is needed because the homeserver reports an account (`GET /account`, pubky-core #749) only to a grant that reads the root, an account not being scoped to any path. The page says so before the QR code. For a sign-up, Ring first creates the keys and registers them on the homeserver with the invite code, then approves the grant; Ring returns the approval through the relay.
- The SDK exchanges the approved grant for a session at the person's homeserver: the one their own record on the Pubky network names (for a sign-up, this one). The page checks that the session is at this homeserver; one elsewhere means no account here, and the page names the other homeserver. A pubky this homeserver does not know answers 404, and one with no record at all cannot be placed: both are "no account here".
- Through the session the page reads the account (`session.grant.account()`): when it signed up, whether it is disabled, the storage used against the allowance, and the download and upload limits and writable paths that apply, each marked when it was set for this account in particular. Then it revokes the grant (`session.signout()`), so nothing stays authorised. A homeserver from before `GET /account` refuses the read (403 on 0.17.x, where the path falls to the storage routes; 404 otherwise) and the page says it does not report account details; so does the page when its SDK is older than `account()` (releases up to 0.17.1). If Ring granted less than reading everything, the homeserver is not asked and the page says why; a grant that reads the root with more (`/:rw`) also counts.
- After a sign-up the page reads the code's status again: a spent code means a new account, a still-unused one means Ring approved with a key that was already signed up here.
- Once signed in, the Account tab also shows the person's pubky.app profile and their public files, grouped by the app that wrote them, with the space they take. All of it comes from the homeserver's public storage API (`GET /storage/<pubky>/pub/…`): the listing names the files, and each size is a `HEAD` request, a few at a time, up to 2000 files. The profile is `pub/pubky.app/profile.json`; its image is fetched and shown as a `data:` URL, since the page's Content-Security-Policy allows no other image source. Nothing here needs a session: a person's public files are public.

- The Activity tab is for signed-in account holders only; visitors are sent to the Account tab. It shows the person's own newest public changes (files written and removed) from the event stream's batch mode, ten at a time: `GET /events-stream?user=<pubky>&reverse=true&limit=10`, one request per page, "Load more" asking for the ten before the last cursor. On request ("See all activity") it also shows everyone's: the newest 300 lines of the public feed (`GET /events/`; one request when the feed is short, otherwise a few one-line probes find its end first) as bursts, consecutive changes by one person in one app, newest first, with who has been active and which apps, and the person's own bursts marked. Names come from people's `profile.json` where they have one (a dozen small reads, no images), otherwise a shortened pubky; there are no dates, since the feed carries none and asking the files would cost a request each. Nothing polls; a button reads the feed again.
- The Homeserver tab is the admin dashboard's "Server & Connection" card, from public sources: `GET /info` (whether the homeserver answers, the address its key resolved to, the features it announces), the sign-up mode from the invite check, and the homeserver's signed record on the Pubky network, read from the pkarr relay (`https://pkarr.pubky.app/<key>`, or the testnet's) and decoded in the browser: the Pubky address (IP and port) it publishes, when it was published, and a "View" dialog with its DNS records. The homeserver's version is admin-only and not shown.

Because every request comes from the visitor's own browser, the homeserver sees each visitor's address and applies its rate limits per visitor. The page never sees a private key and forgets everything on reload.

## Known limits

- **The sign-in asks to read everything.** Ring shows a request for `/:r`, because `GET /account` requires a grant on the root scope. The page holds that access for one read and revokes it, but a person has only the page's word for it. Homeservers up to pubky-core #749 require `/:rw` and refuse `/:r` with 403, which the page reports as the homeserver not reporting account details.
- **A sign-in follows the person's record.** The grant is exchanged at the homeserver the pubky's own record names. Someone with an account here whose record points elsewhere is told they have no account here.
- **A grant can be left behind.** Revoking the grant is best effort; one that is not revoked (the browser was closed first, say) is listed in Ring and expires on its own.
- **Disabled accounts are only reported by newer homeservers.** Up to 0.17.1 the homeserver lets a disabled account sign in and reports nothing about it, so the page says the person has an account and nothing more.
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

| Path                       | What                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/`          | The page: `AccountFlow` (the tabs), the Account tab's steps and cards, `ActivityTab` and `HomeserverTab`.                      |
| `src/useAccountFlow.ts`    | The sign-up/sign-in steps as a state machine.                                                                                  |
| `src/usePublicFiles.ts`    | A signed-in person's public files, with sizes read a few at a time.                                                            |
| `src/useProfile.ts`        | Their pubky.app profile.                                                                                                       |
| `src/useActivity.ts`       | The event feed as bursts, with names and dates filled in as they arrive, polled while watched; `activity.ts` is the pure part. |
| `src/useHomeserver.ts`     | `/info` and the homeserver's signed network record; `pkarr.ts` decodes the record.                                             |
| `src/homeserver-client.ts` | The only module that loads the Pubky SDK: invite checks, Ring requests, sign-in checks, public file, profile and feed reads.   |
| `src/config.ts`            | Loads and checks `config.json`.                                                                                                |
| `docker/`                  | nginx config, security headers, and the start-up script that writes `config.json`.                                             |

From the rest of the repository the page uses only `src/components/ui`, `src/hooks/useCopyFeedback.ts`, `src/lib/utils.ts`, `src/lib/pubky-ring.ts`, `src/app/theme.css` and `public/`, through the aliases in `vite.config.ts` (`SHARED`). Nothing else of the admin app is reachable from here, and the image is built from those files only (`Dockerfile.dockerignore`).
