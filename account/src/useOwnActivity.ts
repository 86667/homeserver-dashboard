import { useCallback, useEffect, useRef, useState } from 'react';
import type { HomeserverClient } from './homeserver-client';
import type { FeedEvent } from './model';

/** Events per page: the first read, and each "load more". */
export const OWN_PAGE = 10;

export type OwnActivity = {
  status: 'idle' | 'loading' | 'done' | 'failed';
  /** Newest first. */
  events: FeedEvent[];
  /** Whether an older page may exist. */
  more: boolean;
  loadingMore: boolean;
  message?: string;
  loadMore: () => void;
};

/**
 * A signed-in person's own newest public changes, one page at a time, from
 * the event stream's batch mode: one request per page. Idle until there is a
 * client, a pubky and the tab is open.
 */
export function useOwnActivity(client: HomeserverClient | null, pubky: string | null, enabled: boolean): OwnActivity {
  const [state, setState] = useState<Omit<OwnActivity, 'loadMore'>>(IDLE);
  const cursor = useRef<string | null>(null);
  // Which sign-in the pages belong to; a result for an older one is dropped.
  const owner = useRef<string | null>(null);

  useEffect(() => {
    if (!client || !pubky || !enabled) {
      setState(IDLE);
      owner.current = null;
      return;
    }
    if (owner.current === pubky) return;
    owner.current = pubky;
    cursor.current = null;
    setState({ ...IDLE, status: 'loading' });
    client
      .ownEvents(pubky, null, OWN_PAGE)
      .then((page) => {
        if (owner.current !== pubky) return;
        cursor.current = page.cursor;
        setState({ status: 'done', events: page.events, more: page.events.length === OWN_PAGE, loadingMore: false });
      })
      .catch((error) => {
        if (owner.current === pubky) setState({ ...IDLE, status: 'failed', message: messageOf(error) });
      });
  }, [client, pubky, enabled]);

  const loadMore = useCallback(() => {
    if (!client || !pubky || state.status !== 'done' || !state.more || state.loadingMore) return;
    setState((current) => ({ ...current, loadingMore: true }));
    client
      .ownEvents(pubky, cursor.current, OWN_PAGE)
      .then((page) => {
        if (owner.current !== pubky) return;
        cursor.current = page.cursor ?? cursor.current;
        setState((current) => ({
          ...current,
          events: [...current.events, ...page.events],
          more: page.events.length === OWN_PAGE,
          loadingMore: false,
        }));
      })
      .catch((error) => {
        if (owner.current === pubky)
          setState((current) => ({ ...current, loadingMore: false, message: messageOf(error) }));
      });
  }, [client, pubky, state.status, state.more, state.loadingMore]);

  return { ...state, loadMore };
}

const IDLE: Omit<OwnActivity, 'loadMore'> = { status: 'idle', events: [], more: false, loadingMore: false };
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
