/**
 * The homeserver's public event feed, made readable. The feed (`GET /events/`)
 * is one line per public file written or removed, oldest first, with no
 * dates: `PUT pubky://<user>/pub/<path>` or `DEL …`, then `cursor: <id>`.
 */
import type { FeedEvent } from './model';

/** A run of changes one person made in one app, as the feed shows them. */
export type Burst = {
  /** The feed's position of the burst's newest event: unique and increasing. */
  id: number;
  pubky: string;
  app: string;
  /** Newest first. */
  events: FeedEvent[];
  /** Files written (new or changed) and removed. */
  written: number;
  removed: number;
};

/** The events on a page of the feed, and the cursor to ask for what follows (null when the page was empty). */
export function parseFeed(text: string): { events: FeedEvent[]; cursor: string | null } {
  const events: FeedEvent[] = [];
  let cursor: string | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('cursor: ')) {
      cursor = line.slice('cursor: '.length).trim();
      continue;
    }
    const event = parseEvent(line);
    if (event) events.push(event);
  }
  return { events, cursor };
}

function parseEvent(line: string): FeedEvent | null {
  const match = /^(PUT|DEL) (pubky:\/\/([^/]+)\/pub\/(.*))$/.exec(line);
  if (!match) return null;
  const [, kind, url, pubky, path] = match;
  return {
    kind: kind as FeedEvent['kind'],
    url,
    pubky,
    path,
    app: path.includes('/') ? path.slice(0, path.indexOf('/')) : '',
  };
}

/**
 * Consecutive events by the same person in the same app, as one burst each,
 * newest first. `events` is a window of the feed in feed order, and `offset`
 * the window's position in it, so ids stay stable as the window grows.
 */
export function groupBursts(events: FeedEvent[], offset = 0): Burst[] {
  const bursts: Burst[] = [];
  events.forEach((event, index) => {
    const last = bursts[bursts.length - 1];
    if (last && last.pubky === event.pubky && last.app === event.app) {
      last.events.unshift(event);
      last.id = offset + index;
    } else {
      bursts.push({ id: offset + index, pubky: event.pubky, app: event.app, events: [event], written: 0, removed: 0 });
    }
    const burst = bursts[bursts.length - 1];
    if (event.kind === 'PUT') burst.written += 1;
    else burst.removed += 1;
  });
  return bursts.reverse();
}

/** Who appears in the events and how often, most recently active first; likewise which apps. */
export function summarizeActivity(events: FeedEvent[]): {
  people: { pubky: string; changes: number }[];
  apps: { app: string; changes: number }[];
} {
  const people = new Map<string, number>();
  const apps = new Map<string, number>();
  for (const event of events) {
    // Re-inserting moves the key to the end, so the newest comes last.
    const changes = (people.get(event.pubky) ?? 0) + 1;
    people.delete(event.pubky);
    people.set(event.pubky, changes);
    apps.set(event.app, (apps.get(event.app) ?? 0) + 1);
  }
  return {
    people: [...people.entries()].reverse().map(([pubky, changes]) => ({ pubky, changes })),
    apps: [...apps.entries()].map(([app, changes]) => ({ app, changes })).sort((a, b) => b.changes - a.changes),
  };
}

/**
 * One person's events as `GET /events-stream` sends them in batch mode: SSE
 * blocks of `event: PUT|DEL`, then `data:` lines with the file's address,
 * `cursor: <id>` and a content hash. `cursor` is the last event's, to ask
 * for the ones before it (reverse order) or after it.
 */
export function parseEventStream(text: string): { events: FeedEvent[]; cursor: string | null } {
  const events: FeedEvent[] = [];
  let cursor: string | null = null;
  for (const block of text.split(/\r?\n\r?\n/)) {
    let kind: string | null = null;
    let url: string | null = null;
    let id: string | null = null;
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event: ')) kind = line.slice('event: '.length).trim();
      else if (line.startsWith('data: cursor: ')) id = line.slice('data: cursor: '.length).trim();
      else if (line.startsWith('data: pubky://') && !url) url = line.slice('data: '.length).trim();
    }
    const event = kind && url ? parseEvent(`${kind} ${url}`) : null;
    if (!event) continue;
    events.push(event);
    if (id) cursor = id;
  }
  return { events, cursor };
}
