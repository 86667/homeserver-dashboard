import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminService } from '@/services/admin/admin';
import type { SignupToken, SignupTokenState } from '@/services/admin/admin.types';

const getService = () => new AdminService();
/** Codes per request, and the most ever read: the homeserver pages by code, not by date, so all are read to sort them. */
const PAGE_SIZE = 1000;
const MAX_CODES = 5000;

/** Newest first; the homeserver's own order is by code, which means nothing to a person. */
const byNewest = (a: SignupToken, b: SignupToken) => b.created_at.localeCompare(a.created_at);

/**
 * The homeserver's invite codes in `state`, newest first (admin
 * `GET /signup_tokens`). Changing `state` or `refreshKey` reads them again.
 */
export function useSignupTokens(state: SignupTokenState, refreshKey = 0) {
  const [items, setItems] = useState<SignupToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  const load = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    const current = () => isMountedRef.current && fetchId === fetchIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const all: SignupToken[] = [];
      let cursor: string | undefined;
      do {
        const page = await getService().getSignupTokens(state, PAGE_SIZE, cursor);
        all.push(...page.items);
        cursor = page.next_cursor ?? undefined;
      } while (cursor && all.length < MAX_CODES);
      if (!current()) return;
      setItems(all.sort(byNewest));
    } catch (err) {
      if (!current()) return;
      setError(err instanceof Error ? err : new Error('Failed to load invite codes'));
    } finally {
      if (current()) setIsLoading(false);
    }
  }, [state]);

  useEffect(() => {
    isMountedRef.current = true;
    void load();
    return () => {
      isMountedRef.current = false;
    };
  }, [load, refreshKey]);

  return { items, isLoading, error, refetch: load };
}
