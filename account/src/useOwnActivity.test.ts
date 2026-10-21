import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HomeserverClient } from './homeserver-client';
import type { FeedEvent } from './model';
import { OWN_PAGE, useOwnActivity } from './useOwnActivity';

const ALICE = 'whgxto9xtroaih7ict9chtuxh1xmbpmci5qd71jsen3ow3bscipy';
const event = (n: number): FeedEvent => ({
  kind: 'PUT',
  url: `pubky://${ALICE}/pub/a/${n}`,
  pubky: ALICE,
  path: `a/${n}`,
  app: 'a',
});
/** A homeserver with `total` events, served newest first in pages. */
function client(total: number) {
  return {
    ownEvents: vi.fn(async (_pubky: string, cursor: string | null, limit: number) => {
      const from = cursor === null ? total : Number(cursor) - 1;
      const events = Array.from({ length: Math.max(0, Math.min(limit, from)) }, (_, i) => event(from - i));
      return { events, cursor: events.length ? String(events[events.length - 1].path.slice(2)) : null };
    }),
  } as unknown as HomeserverClient;
}

describe('useOwnActivity', () => {
  it('is idle until there is a pubky and the tab is open', () => {
    const c = client(5);
    const { result } = renderHook(() => useOwnActivity(c, ALICE, false));
    expect(result.current.status).toBe('idle');
    expect(c.ownEvents).not.toHaveBeenCalled();
  });

  it('reads one page, then more on request, and knows when there is no more', async () => {
    const c = client(OWN_PAGE + 3);
    const { result } = renderHook(() => useOwnActivity(c, ALICE, true));
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.events).toHaveLength(OWN_PAGE);
    expect(result.current.events[0].path).toBe(`a/${OWN_PAGE + 3}`);
    expect(result.current.more).toBe(true);
    expect(c.ownEvents).toHaveBeenCalledWith(ALICE, null, OWN_PAGE);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.events).toHaveLength(OWN_PAGE + 3));
    expect(c.ownEvents).toHaveBeenLastCalledWith(ALICE, '4', OWN_PAGE);
    expect(result.current.more).toBe(false);
    expect(result.current.events[OWN_PAGE + 2].path).toBe('a/1');
  });

  it('starts over for another person, and empties on sign-out', async () => {
    const c = client(2);
    const { result, rerender } = renderHook(({ pubky }) => useOwnActivity(c, pubky, true), {
      initialProps: { pubky: ALICE as string | null },
    });
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    rerender({ pubky: null });
    expect(result.current.status).toBe('idle');
    expect(result.current.events).toHaveLength(0);
  });

  it('reports a failure', async () => {
    const c = { ownEvents: vi.fn(async () => Promise.reject(new Error('offline'))) } as unknown as HomeserverClient;
    const { result } = renderHook(() => useOwnActivity(c, ALICE, true));
    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.message).toBe('offline');
  });
});
