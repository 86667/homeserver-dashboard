/**
 * What the public account page (/account) and its server-side config share.
 * Safe to import from the browser: nothing here touches the server.
 */

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

/** What the account page needs to talk to the homeserver, read from the server's environment. */
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
