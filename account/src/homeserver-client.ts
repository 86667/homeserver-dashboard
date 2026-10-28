/**
 * The account page's link to the homeserver and to Pubky Ring, from the
 * visitor's own browser. The page has no server side: every request here goes
 * from the browser to the homeserver's public API, so the homeserver sees each
 * visitor's own address and applies its rate limits per visitor, and no admin
 * credential is involved anywhere.
 *
 * This is the only module that loads the Pubky SDK. It is loaded on demand in
 * the browser: it is large, and its Node build must never run in the server.
 */
import type { Capabilities, GrantSession, Pubky, Session } from '@synonymdev/pubky';
import { parseHomeserverTime } from './account';
import { parseEventStream, parseFeed } from './activity';
import {
  type AccountConfig,
  type AccountInfo,
  type AccountRecord,
  type FeedEvent,
  type HomeserverInfo,
  type InviteStatus,
  type Profile,
  type PublicFile,
  ACCOUNT_CAPABILITY,
  readsRoot,
  type SignedRecord,
} from './model';
import { parseSignedRecord } from './pkarr';
import { withTimeout } from './with-timeout';

type Sdk = typeof import('@synonymdev/pubky');

export type RingRequestKind = 'signup' | 'signin';

export type RingRequest = {
  /** The `pubkyauth://` link to show as a QR code and to open on this device. */
  authUrl: string;
  /** Resolves once Ring's approval has been checked against this homeserver; rejects when the request expires. */
  awaitAccount: () => Promise<AccountInfo>;
};

/**
 * The account as the SDK's `GrantSession.account()` returns it, with the
 * method itself optional: SDK releases up to 0.17.1 do not have it.
 */
type SdkAccount = {
  createdAt: string;
  disabled: boolean;
  usedBytes: number;
  quota: AccountRecord['quota'];
};
type GrantView = GrantSession & { account?: () => Promise<SdkAccount> };

/** The SDK's error for a homeserver's refusal names the pubky it could not place. */
const UNRESOLVED_HOMESERVER = /could not resolve homeserver for ([a-z0-9]{52})/;

/**
 * How long a request waits for Ring. Long enough to install Ring and create a
 * key first, for a sign-up. The SDK cannot stop waiting on the relay, so an
 * abandoned request keeps polling until the page is closed; it is ignored.
 */
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

/** A syntactically valid code no homeserver issues; asks whether codes are required. */
const PROBE_INVITE_CODE = '0000-0000-0000';

/** Files per listing request; the homeserver pages beyond that with a cursor. */
const LIST_PAGE = 1000;
/** An avatar larger than this is not shown. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
/** Events per feed request: the homeserver's maximum. */
const FEED_PAGE = 1000;
/** Where a key's signed record is read from: the Pubky SDK's default relay, or the testnet's. */
const PKARR_RELAY = 'https://pkarr.pubky.app';
const TESTNET_PKARR_PORT = 15411;

export class HomeserverClient {
  private constructor(
    private readonly sdk: Sdk,
    private readonly pubky: Pubky,
    private readonly config: AccountConfig,
  ) {}

  static async connect(config: AccountConfig): Promise<HomeserverClient> {
    const sdk = await import('@synonymdev/pubky');
    const pubky = config.testnetHost ? sdk.Pubky.testnet(config.testnetHost) : new sdk.Pubky();
    return new HomeserverClient(sdk, pubky, config);
  }

  /** `code` must be a whole invite code. Never throws: a failure is 'error'. */
  async inviteStatus(code: string): Promise<InviteStatus> {
    try {
      const response = await this.homeserverFetch(`/signup_tokens/${encodeURIComponent(code)}`);
      return await statusOf(response);
    } catch {
      return 'error';
    }
  }

  /** Whether sign-up needs an invite code; null when the homeserver gave no clear answer. */
  async isInviteRequired(): Promise<boolean | null> {
    const status = await this.inviteStatus(PROBE_INVITE_CODE);
    if (status === 'not_required') return false;
    if (status === 'error' || status === 'rate_limited') return null;
    return true;
  }

  /** Starts a Ring request; `inviteCode` only for a sign-up on a homeserver that needs one. */
  async startRequest(kind: RingRequestKind, inviteCode: string | null): Promise<RingRequest> {
    const flow = await this.pubky.startGrantAuthFlow(
      ACCOUNT_CAPABILITY as Capabilities,
      this.flowKind(kind, inviteCode),
      {
        clientId: clientId(),
        relay: this.config.relay,
      },
    );
    const account = flow.awaitApproval().then(
      (session) => this.confirmAccount(session),
      (error: unknown) => noAccountOf(error),
    );
    // An abandoned request may still fail later; nobody is waiting for it then.
    account.catch(() => undefined);
    return {
      authUrl: flow.authorizationUrl,
      awaitAccount: () => withTimeout(account, APPROVAL_TIMEOUT_MS, 'This request expired. Start again.'),
    };
  }

  private flowKind(kind: RingRequestKind, inviteCode: string | null) {
    const { AuthFlowKind, PublicKey } = this.sdk;
    return kind === 'signup'
      ? AuthFlowKind.signup(PublicKey.from(this.config.homeserver), inviteCode)
      : AuthFlowKind.signin();
  }

  /**
   * Ring's approval opened a session at the person's homeserver: the one
   * their own record names, or, for a sign-up, this one. Reads the account
   * through it, then revokes the grant: the page keeps no session. A session
   * at another homeserver means no account here, whatever is there.
   */
  private async confirmAccount(session: Session): Promise<AccountInfo> {
    const pubky = session.info.publicKey.z32();
    try {
      const grant = session.grant as GrantView | undefined;
      if (!grant) throw new Error('The sign-in did not open a grant session');
      const info = await grant.sessionInfo();
      const homeserver = info.homeserver.z32();
      if (homeserver !== this.config.homeserver) return { pubky, hasAccount: false, otherHomeserver: homeserver };
      if (!info.capabilities.some(readsRoot)) return { pubky, hasAccount: true, partialGrant: true };
      const account = await readAccount(grant);
      return account ? { pubky, hasAccount: true, account } : { pubky, hasAccount: true };
    } finally {
      // Best effort: a grant left behind expires on its own.
      await session.signout().catch(() => undefined);
    }
  }

  /**
   * Every file under `pubky`'s `/pub/` on this homeserver, oldest path first,
   * without sizes: the listing names files only. At most `max` files; more
   * than that is reported by the caller as "and more". Public data: it needs no session.
   */
  async listPublicFiles(
    pubky: string,
    max = 5000,
    pageSize = LIST_PAGE,
  ): Promise<{ files: PublicFile[]; more: boolean }> {
    const files: PublicFile[] = [];
    let cursor: string | null = null;
    while (files.length < max) {
      const limit = Math.min(pageSize, max - files.length);
      const query = `limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const response = await this.homeserverFetch(`/storage/${pubky}/pub/?${query}`);
      if (response.status === 404) break; // nothing stored yet
      if (!response.ok) throw new Error(`The homeserver could not list the files (${response.status})`);
      const page = parseListing(await response.text());
      files.push(...page);
      if (page.length < limit) return { files, more: false };
      cursor = page[page.length - 1].url;
    }
    return { files, more: files.length >= max };
  }

  /** The file's size, modification time and type, from a HEAD request. */
  async fileStats(file: PublicFile): Promise<Pick<PublicFile, 'size' | 'modifiedAt' | 'contentType'>> {
    const response = await this.homeserverFetch(storagePath(file.url), { method: 'HEAD' });
    if (!response.ok) throw new Error(`The homeserver could not describe ${file.path} (${response.status})`);
    const modified = response.headers.get('last-modified');
    const modifiedAt = modified ? new Date(modified) : undefined;
    return {
      size: Number(response.headers.get('content-length') ?? NaN) || 0,
      modifiedAt: modifiedAt && !Number.isNaN(modifiedAt.getTime()) ? modifiedAt : undefined,
      contentType: response.headers.get('content-type') ?? undefined,
    };
  }

  /** The person's pubky.app profile, or null when they have none here. `withAvatar` false skips the image. */
  async profile(pubky: string, withAvatar = true): Promise<Profile | null> {
    const response = await this.homeserverFetch(`/storage/${pubky}/pub/pubky.app/profile.json`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`The homeserver could not read the profile (${response.status})`);
    const raw = (await response.json()) as Record<string, unknown>;
    if (typeof raw.name !== 'string') return null;
    return {
      name: raw.name,
      bio: typeof raw.bio === 'string' && raw.bio.trim() ? raw.bio : null,
      status: typeof raw.status === 'string' && raw.status.trim() ? raw.status : null,
      links: Array.isArray(raw.links) ? raw.links.filter(isLink) : [],
      avatar:
        withAvatar && typeof raw.image === 'string' && raw.image
          ? await this.avatar(raw.image).catch(() => null)
          : null,
    };
  }

  /**
   * A profile image as a `data:` URL, or null. pubky.app stores an image as a
   * `pubky://…/pub/pubky.app/files/<id>` record whose `src` names the blob; a
   * plain https URL is fetched as it is. A data URL because the page's
   * Content-Security-Policy allows no other image source.
   */
  private async avatar(image: string): Promise<string | null> {
    let source = image;
    if (image.startsWith('pubky://') && image.includes('/pub/pubky.app/files/')) {
      const record = (await this.readPublic(image).then((r) => r.json())) as { src?: unknown };
      if (typeof record.src !== 'string') return null;
      source = record.src;
    }
    const response = await this.readPublic(source);
    const size = Number(response.headers.get('content-length') ?? 0);
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.startsWith('image/') || size > MAX_AVATAR_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_AVATAR_BYTES) return null;
    return `data:${type};base64,${toBase64(bytes)}`;
  }

  /** Reads a public resource: a `pubky://` address wherever its owner's homeserver is, or an https URL. */
  private readPublic(url: string): Promise<Response> {
    return url.startsWith('pubky://')
      ? this.pubky.publicStorage.get(url as `pubky://${string}/pub/${string}`)
      : this.pubky.client.fetch(url);
  }

  /** What the homeserver says about itself, and the address its key resolved to. */
  async info(): Promise<HomeserverInfo> {
    const response = await this.homeserverFetch('/info');
    if (!response.ok) throw new Error(`The homeserver did not describe itself (${response.status})`);
    const raw = (await response.json()) as { features?: unknown };
    const features = Array.isArray(raw.features) ? raw.features.filter((f): f is string => typeof f === 'string') : [];
    return { features, address: originOf(response.url) };
  }

  /** The homeserver's signed record on the Pubky network, or null when the relay has none. */
  async homeserverRecord(): Promise<SignedRecord | null> {
    const relay = this.config.testnetHost ? `http://${this.config.testnetHost}:${TESTNET_PKARR_PORT}` : PKARR_RELAY;
    const response = await fetch(`${relay}/${this.config.homeserver}`, { cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`The relay could not serve the record (${response.status})`);
    return parseSignedRecord(new Uint8Array(await response.arrayBuffer()), this.config.homeserver);
  }

  /**
   * One person's newest public events, newest first, at most `limit`; with a
   * `cursor` (from the previous page) the ones before it. One request each:
   * the event stream answers a batch and closes.
   */
  async ownEvents(
    pubky: string,
    cursor: string | null,
    limit: number,
  ): Promise<{ events: FeedEvent[]; cursor: string | null }> {
    const user = cursor ? `${pubky}:${encodeURIComponent(cursor)}` : pubky;
    const response = await this.homeserverFetch(`/events-stream?user=${user}&reverse=true&limit=${limit}`);
    if (!response.ok) throw new Error(`The homeserver could not list your changes (${response.status})`);
    return parseEventStream(await response.text());
  }

  /** The public events after `cursor` ('0' for the start of the feed), oldest first, at most `limit`. */
  async eventsAfter(cursor: string, limit: number): Promise<{ events: FeedEvent[]; cursor: string | null }> {
    const response = await this.homeserverFetch(`/events/?cursor=${encodeURIComponent(cursor)}&limit=${limit}`);
    if (!response.ok) throw new Error(`The homeserver could not list its events (${response.status})`);
    return parseFeed(await response.text());
  }

  /**
   * The newest `max` public events, oldest first, with the cursor to poll
   * for more and, when the whole feed fit in one page, how long it is. A
   * longer feed is reached from its end: a few one-line probes find the
   * last event's position, then one request reads the window before it.
   */
  async latestEvents(max: number): Promise<{ events: FeedEvent[]; cursor: string; total: number | null }> {
    const first = await this.eventsAfter('0', FEED_PAGE);
    if (first.events.length < FEED_PAGE) {
      return { events: first.events.slice(-max), cursor: first.cursor ?? '0', total: first.events.length };
    }
    const end = await this.feedEnd(Number(first.cursor));
    const window = await this.eventsAfter(String(Math.max(0, end - max)), max);
    return { events: window.events, cursor: window.cursor ?? String(end), total: null };
  }

  /** The position of the feed's last event, knowing the event at `known` exists. Positions grow by one per event. */
  private async feedEnd(known: number): Promise<number> {
    // The first event after `position`, or null when there is none.
    const next = async (position: number) => {
      const page = await this.eventsAfter(String(position), 1);
      return page.cursor === null ? null : Number(page.cursor);
    };
    let low = known;
    let high = known * 2;
    for (let found = await next(high); found !== null; found = await next(high)) {
      low = found;
      high *= 2;
    }
    // Now the last event is at low or later, and none is after high.
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const found = await next(middle);
      if (found === null) high = middle;
      else low = found;
    }
    return low;
  }

  private homeserverFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return this.pubky.client.fetch(`https://${this.config.homeserver}${path}`, { ...init, credentials: 'include' });
  }
}

/**
 * The account as the homeserver reports it, or undefined when it does not:
 * a homeserver from before `GET /account` takes the path for a storage read
 * and refuses it (403 on 0.17, 404 otherwise), and an SDK from before
 * `account()` cannot ask. Any other failure is reported.
 */
async function readAccount(grant: GrantView): Promise<AccountRecord | undefined> {
  if (typeof grant.account !== 'function') return undefined;
  try {
    return toAccountRecord(await grant.account());
  } catch (error) {
    if (statusCodeOf(error) === 404 || statusCodeOf(error) === 403) return undefined;
    throw error;
  }
}

function toAccountRecord(account: SdkAccount): AccountRecord {
  return {
    createdAt: parseHomeserverTime(account.createdAt),
    disabled: account.disabled,
    usedBytes: account.usedBytes,
    quota: { effective: { ...account.quota.effective }, overrides: { ...account.quota.overrides } },
  };
}

/**
 * A failed approval that means "no account", or the failure itself. The
 * homeserver answers 404 for a pubky it does not know; a pubky whose record
 * names no homeserver at all cannot be placed by the SDK. Who approved is
 * only known in the second case, from the SDK's message.
 */
function noAccountOf(error: unknown): AccountInfo {
  if (statusCodeOf(error) === 404) return { pubky: null, hasAccount: false };
  const unresolved = UNRESOLVED_HOMESERVER.exec(messageOf(error));
  if (unresolved) return { pubky: unresolved[1], hasAccount: false };
  throw error;
}

/** The HTTP status in a Pubky SDK error, if it carries one. */
function statusCodeOf(error: unknown): number | null {
  const data = (error as { data?: unknown } | null)?.data;
  const status = typeof data === 'object' && data !== null ? (data as { statusCode?: unknown }).statusCode : undefined;
  return typeof status === 'number' ? status : null;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** How the page names itself in Ring's list of grants: its host. */
function clientId(): string {
  const host = typeof location === 'undefined' ? '' : location.hostname;
  return host || 'homeserver-account';
}

async function statusOf(response: Response): Promise<InviteStatus> {
  // 400 is also the answer to a malformed code, which callers rule out first.
  if (response.status === 400) return 'not_required';
  if (response.status === 404) return 'unknown';
  if (response.status === 429) return 'rate_limited';
  if (!response.ok) return 'error';
  const body = (await response.json()) as { status?: unknown };
  if (body.status === 'used' || body.status === 'valid') return body.status;
  return 'error';
}

/** The files in a listing: one `pubky://` address per line; folders end with `/` and are skipped. */
function parseListing(text: string): PublicFile[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('pubky://') && !line.endsWith('/'))
    .map((url) => {
      const path = url.slice(url.indexOf('/pub/') + '/pub/'.length);
      return { url, path, app: path.includes('/') ? path.slice(0, path.indexOf('/')) : '' };
    });
}

/** `https://host[:port]` of a response's URL, or null when it is not an http(s) URL. */
function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

/** `pubky://<user>/pub/x` as this homeserver's path-addressed route, `/storage/<user>/pub/x`. */
function storagePath(url: string): string {
  return `/storage/${url.slice('pubky://'.length)}`;
}

const isLink = (value: unknown): value is { title: string; url: string } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { title?: unknown }).title === 'string' &&
  typeof (value as { url?: unknown }).url === 'string';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
