import type { AccountConfig } from '@/lib/account';

/** A public key in z-base-32: 52 characters of its alphabet. The SDK checks it is a real key. */
const Z32_KEY = /^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/;

const nonEmpty = (value: string | undefined): string | null => value?.trim() || null;

/**
 * The account page's config from the environment, or null when
 * HOMESERVER_PUBLIC_KEY is unset or not a key: without it the page cannot
 * find the homeserver, and shows that it is not set up.
 *
 * The key is configured, not read from the homeserver, because only the
 * admin API reports it and the account page never uses the admin API.
 */
export function readAccountConfig(env: Record<string, string | undefined> = process.env): AccountConfig | null {
  const raw = nonEmpty(env.HOMESERVER_PUBLIC_KEY);
  const homeserver = raw?.replace(/^pubky(?=.{52}$)/, '') ?? null;
  if (!homeserver || !Z32_KEY.test(homeserver)) return null;
  return {
    homeserver,
    relay: nonEmpty(env.AUTH_RELAY),
    testnetHost: nonEmpty(env.PUBKY_TESTNET_HOST),
  };
}
