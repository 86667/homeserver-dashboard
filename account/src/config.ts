import type { AccountConfig } from './model';

/** A public key in z-base-32: 52 characters of its alphabet. The SDK checks it is a real key. */
const Z32_KEY = /^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/;

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * The page's config from config.json (written from the environment when the
 * container starts, see docker/write-config.sh), or null when it has no
 * usable homeserver key: without one the page cannot find the homeserver, and
 * shows that it is not set up.
 */
export function parseConfig(raw: unknown): AccountConfig | null {
  const fields = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const homeserver = text(fields.homeserverPublicKey)?.replace(/^pubky(?=.{52}$)/, '') ?? null;
  if (!homeserver || !Z32_KEY.test(homeserver)) return null;
  return { homeserver, relay: text(fields.relay), testnetHost: text(fields.testnetHost) };
}

/** Fetches and checks config.json; null when it is missing, unreadable or not usable. */
export async function loadConfig(url = 'config.json'): Promise<AccountConfig | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    return response.ok ? parseConfig(await response.json()) : null;
  } catch {
    return null;
  }
}
