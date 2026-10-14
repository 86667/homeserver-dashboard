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
import { ACCOUNT_CAPABILITY, type AccountConfig, type AccountInfo, type InviteStatus } from '@/lib/account';
import { withTimeout } from '@/lib/with-timeout';

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

/** The homeserver's reason for refusing a sign-in, e.g. "AuthToken already used". */
async function reasonOf(response: Response): Promise<string> {
  const text = (await response.text().catch(() => '')).trim().slice(0, 200);
  return text || `The homeserver refused the sign-in (${response.status})`;
}
