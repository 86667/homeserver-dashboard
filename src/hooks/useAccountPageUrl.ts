import { useEffect, useState } from 'react';

/**
 * The public address of the account page (ACCOUNT_PAGE_URL on the server), or
 * null while loading and when none is configured.
 */
export function useAccountPageUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account-page', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<{ url: string | null }>) : { url: null }))
      .then((body) => {
        if (!cancelled) setUrl(body.url);
      })
      .catch(() => {
        // No link then; invites still work by code and QR.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return url;
}
