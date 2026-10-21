import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Burst, groupBursts, summarizeActivity } from './activity';
import type { HomeserverClient } from './homeserver-client';
import type { FeedEvent, Profile } from './model';

/** Events read from the end of the feed. */
const WINDOW = 300;
/** People whose profile (their name) is read, most recently active first. */
const PEOPLE_WITH_NAMES = 12;
/** One empty list for every render without a feed, so nothing downstream recomputes. */
const NO_EVENTS: FeedEvent[] = [];

export type Feed =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'done';
      /** Oldest first. */
      events: FeedEvent[];
      /** The feed position of `events[0]`; unique, growing ids for bursts. */
      offset: number;
      /** The feed's length when it was read whole; null when only its end was. */
      total: number | null;
      checkedAt: Date;
    }
  | { status: 'failed'; message: string };

export type Activity = {
  feed: Feed;
  /** Newest first. */
  bursts: Burst[];
  people: { pubky: string; changes: number }[];
  apps: { app: string; changes: number }[];
  /** By pubky; absent while not read, null for someone without a profile. */
  profiles: Record<string, Profile | null>;
  /** Reads the feed again. */
  refresh: () => void;
};

/**
 * The whole homeserver's recent public activity: the end of the feed, read
 * once `enabled` and again on `refresh`, with names for the most recently
 * active people as they arrive. Kept cheap on purpose: one feed request and
 * a few small profile reads, no images, no dates.
 */
export function useActivity(client: HomeserverClient | null, enabled: boolean): Activity {
  const [feed, setFeed] = useState<Feed>({ status: 'idle' });
  const [profiles, setProfiles] = useState<Record<string, Profile | null>>({});
  const [reads, setReads] = useState(0);
  // Whose name is being read already, so a re-render does not ask twice.
  const asked = useRef(new Set<string>());

  useEffect(() => {
    if (!client || !enabled) return;
    let cancelled = false;
    setFeed((current) => (current.status === 'done' ? current : { status: 'loading' }));
    client
      .latestEvents(WINDOW)
      .then(({ events, cursor, total }) => {
        if (cancelled) return;
        const offset = total === null ? Math.max(0, Number(cursor) - events.length) : total - events.length;
        setFeed({ status: 'done', events, offset, total, checkedAt: new Date() });
      })
      .catch((error) => {
        if (!cancelled) setFeed({ status: 'failed', message: messageOf(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [client, enabled, reads]);

  const refresh = useCallback(() => setReads((n) => n + 1), []);

  const events = feed.status === 'done' ? feed.events : NO_EVENTS;
  const offset = feed.status === 'done' ? feed.offset : 0;
  const bursts = useMemo(() => groupBursts(events, offset), [events, offset]);
  const { people, apps } = useMemo(() => summarizeActivity(events), [events]);

  useEffect(() => {
    if (!client) return;
    for (const { pubky } of people.slice(0, PEOPLE_WITH_NAMES)) {
      if (asked.current.has(pubky)) continue;
      asked.current.add(pubky);
      client
        .profile(pubky, false)
        .catch(() => null)
        .then((profile) => setProfiles((current) => ({ ...current, [pubky]: profile })));
    }
  }, [client, people]);

  return { feed, bursts, people, apps, profiles, refresh };
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
