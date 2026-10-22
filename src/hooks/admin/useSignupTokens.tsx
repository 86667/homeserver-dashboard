import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminService } from '@/services/admin/admin';
import type { SignupToken, SignupTokenState } from '@/services/admin/admin.types';

const getService = () => new AdminService();
const PAGE_SIZE = 20;

/**
 * Pages through the homeserver's invite codes (admin `GET /signup_tokens`),
 * filtered by `state`. Changing `state` or `refreshKey` reloads from the start.
 */
export function useSignupTokens(state: SignupTokenState, refreshKey = 0) {
  const [items, setItems] = useState<SignupToken[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  const loadFirstPage = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    const current = () => isMountedRef.current && fetchId === fetchIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await getService().getSignupTokens(state, PAGE_SIZE);
      if (!current()) return;
      setItems(response.items);
      setNextCursor(response.next_cursor);
    } catch (err) {
      if (!current()) return;
      setError(err instanceof Error ? err : new Error('Failed to load invite codes'));
    } finally {
      if (current()) setIsLoading(false);
    }
  }, [state]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    const fetchId = fetchIdRef.current;
    const current = () => isMountedRef.current && fetchId === fetchIdRef.current;
    setIsLoadingMore(true);
    try {
      const response = await getService().getSignupTokens(state, PAGE_SIZE, nextCursor);
      if (!current()) return;
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.token));
        return [...prev, ...response.items.filter((item) => !seen.has(item.token))];
      });
      setNextCursor(response.next_cursor);
    } catch (err) {
      if (!current()) return;
      setError(err instanceof Error ? err : new Error('Failed to load more invite codes'));
    } finally {
      if (isMountedRef.current) setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextCursor, state]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadFirstPage();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadFirstPage, refreshKey]);

  return { items, nextCursor, isLoading, isLoadingMore, error, refetch: loadFirstPage, loadMore };
}
