/** The account page's shared types, and the invite code format. */

/**
 * The capability the account page asks Pubky Ring to sign. An AuthToken has
 * no audience, so this distinctive scope is what Ring shows on its consent
 * screen. It is read-only and outside `/pub/`: the page signs in at the
 * homeserver with the token to see whether the account exists, so the
 * session that opens must grant nothing there.
 */
export const ACCOUNT_CAPABILITY = '/homeserver-dashboard/account:r';

/** The homeserver's answer about an invite code, as the page shows it. */
export type InviteStatus = 'valid' | 'used' | 'unknown' | 'not_required' | 'rate_limited' | 'error';

/** What the account page needs to talk to the homeserver, from config.json. */
export type AccountConfig = {
  /** The homeserver's public key (z-base-32). */
  homeserver: string;
  /** The HTTP relay Ring answers through; null = the Pubky SDK's default. */
  relay: string | null;
  /** Development only: reach a local pubky-testnet on this host instead of mainnet. */
  testnetHost: string | null;
};

/** Who approved a Ring request, and whether they have an account on this homeserver. */
export type AccountInfo = {
  pubky: string;
  hasAccount: boolean;
};

/** One of a person's public files on this homeserver. Size and date arrive later, from a HEAD request. */
export type PublicFile = {
  /** The file's `pubky://` address. */
  url: string;
  /** Its path under `/pub/`, e.g. `pubky.app/profile.json`. */
  path: string;
  /** The first folder under `/pub/`: by convention the app that wrote the file. */
  app: string;
  size?: number;
  modifiedAt?: Date;
  contentType?: string;
};

/** A person's pubky.app profile (`/pub/pubky.app/profile.json`), as far as the page shows it. */
export type Profile = {
  name: string;
  bio: string | null;
  status: string | null;
  links: { title: string; url: string }[];
  /** The avatar as a `data:` URL, when the profile has one that could be fetched. */
  avatar: string | null;
};

const INVITE_CODE = /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/;

/**
 * Invite codes are 12 Crockford base32 characters shown as XXXX-XXXX-XXXX.
 * Normalizes what a person typed or pasted (case, spaces, missing hyphens)
 * into that shape, cutting anything past 12 characters.
 */
export function normalizeInviteCode(raw: string): string {
  const chars = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 12);
  return chars.replace(/(.{4})(?=.)/g, '$1-');
}

/** Whether `code` is a whole invite code in canonical form. */
export function isInviteCode(code: string): boolean {
  return INVITE_CODE.test(code);
}

/** One line of the homeserver's public event feed: a public file written or removed. */
export type FeedEvent = {
  kind: 'PUT' | 'DEL';
  /** The file's `pubky://` address. */
  url: string;
  /** Whose file it is (z-base-32). */
  pubky: string;
  /** Its path under `/pub/`. */
  path: string;
  /** The first folder under `/pub/`: by convention the app that wrote the file. */
  app: string;
};

/** What the homeserver says about itself on `GET /info`, and where it was reached. */
export type HomeserverInfo = {
  features: string[];
  /** The https address the homeserver's key resolved to, e.g. `https://homeserver.example.com`; null when unknown. */
  address: string | null;
};

/** One DNS record from a homeserver's signed record on the Pubky network, as text. */
export type DnsRecord = {
  /** Relative to the key's own name: `@` for the key itself, else e.g. `_pubky`. */
  name: string;
  /** `A`, `AAAA`, `TXT`, `HTTPS`, `SVCB`, `CNAME`, or `TYPE<n>` for others. */
  type: string;
  value: string;
  /** Seconds the record may be cached. */
  ttl: number;
};

/** A key's signed record (pkarr) as a relay serves it. */
export type SignedRecord = {
  /** When the key's owner signed it. */
  publishedAt: Date;
  records: DnsRecord[];
};
