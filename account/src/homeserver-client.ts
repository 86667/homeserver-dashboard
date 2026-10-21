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
import type { AuthToken, Capabilities, Pubky } from '@synonymdev/pubky';
import {
  ACCOUNT_CAPABILITY,
  type AccountConfig,
  type AccountInfo,
  type InviteStatus,
  type Profile,
  type PublicFile,
} from './model';
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
  startRequest(kind: RingRequestKind, inviteCode: string | null): RingRequest {
    // The SDK's type admits only /pub/ and /priv/ paths; the protocol takes any
    // absolute path, and this one is deliberately outside the user's storage.
    const flow = this.pubky.startCookieAuthFlow(
      ACCOUNT_CAPABILITY as Capabilities,
      this.flowKind(kind, inviteCode),
      this.config.relay,
    );
    const account = flow.awaitToken().then((token) => this.confirmAccount(token));
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
   * Signs in at this homeserver with Ring's token, the way any Pubky app
   * would, then signs out again at once: an account answers with a session,
   * an unknown pubky with 404. The sign-in is addressed to this homeserver's
   * key, not wherever the person's own record points, so an account on
   * another homeserver is never mistaken for one here. The homeserver checks
   * the token's signature and freshness, and accepts each token only once.
   */
  private async confirmAccount(token: AuthToken): Promise<AccountInfo> {
    const pubky = token.publicKey.z32();
    const response = await this.homeserverFetch('/session', { method: 'POST', body: new Uint8Array(token.toBytes()) });
    if (response.status === 404) return { pubky, hasAccount: false };
    if (!response.ok) throw new Error(await reasonOf(response));
    await signOut(response.url, pubky);
    return { pubky, hasAccount: true };
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

  /** The person's pubky.app profile, or null when they have none here. */
  async profile(pubky: string): Promise<Profile | null> {
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
      avatar: typeof raw.image === 'string' && raw.image ? await this.avatar(raw.image).catch(() => null) : null,
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

  private homeserverFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return this.pubky.client.fetch(`https://${this.config.homeserver}${path}`, { ...init, credentials: 'include' });
  }
}

/**
 * Ends the session a sign-in just opened, at the address that sign-in went to
 * (`sessionUrl`, the `/session` the SDK resolved), naming the person whose
 * session it is in `pubky-host`. The browser's own fetch is used because the
 * SDK's sets `pubky-host` itself, to the homeserver.
 *
 * Best effort: a browser that does not send the homeserver's cookie (it is
 * third-party when the page is on another site) leaves the session open, and
 * that session grants only ACCOUNT_CAPABILITY.
 */
async function signOut(sessionUrl: string, pubky: string): Promise<void> {
  try {
    await fetch(sessionUrl, { method: 'DELETE', headers: { 'pubky-host': pubky }, credentials: 'include' });
  } catch {
    // See above: nothing to do about it here.
  }
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

/** The homeserver's reason for refusing a sign-in, e.g. "AuthToken already used". */
async function reasonOf(response: Response): Promise<string> {
  const text = (await response.text().catch(() => '')).trim().slice(0, 200);
  return text || `The homeserver refused the sign-in (${response.status})`;
}
