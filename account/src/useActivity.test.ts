import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HomeserverClient } from './homeserver-client';
import type { FeedEvent, Profile } from './model';
import { useActivity } from './useActivity';

const ALICE = 'whgxto9xtroaih7ict9chtuxh1xmbpmci5qd71jsen3ow3bscipy';
const BOB = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const event = (kind: 'PUT' | 'DEL', pubky: string, path: string): FeedEvent => ({
  kind,
  url: `pubky://${pubky}/pub/${path}`,
  pubky,
  path,
  app: path.includes('/') ? path.slice(0, path.indexOf('/')) : '',
});
const alice: Profile = { name: 'Alice', bio: null, status: null, links: [], avatar: null };

function client(events: FeedEvent[], overrides: Partial<Record<keyof HomeserverClient, unknown>> = {}) {
  return {
    latestEvents: vi.fn(async () => ({ events, cursor: String(events.length), total: events.length })),
    profile: vi.fn(async (pubky: string) => (pubky === ALICE ? alice : null)),
    ...overrides,
  } as unknown as HomeserverClient;
}

describe('useActivity', () => {
  it('is idle until enabled', () => {
    const c = client([]);
    const { result } = renderHook(() => useActivity(c, false));
    expect(result.current.feed).toEqual({ status: 'idle' });
    expect(c.latestEvents).not.toHaveBeenCalled();
  });

  it('reads the feed, groups it into bursts, and fills in names without images', async () => {
    const c = client([
      event('PUT', ALICE, 'pubky.app/profile.json'),
      event('PUT', ALICE, 'pubky.app/posts/1'),
      event('PUT', BOB, 'site/index.html'),
      event('DEL', ALICE, 'pubky.app/posts/1'),
    ]);
    const { result } = renderHook(() => useActivity(c, true));
    await waitFor(() => expect(result.current.feed.status).toBe('done'));
    expect(result.current.bursts.map((b) => [b.id, b.app, b.written, b.removed])).toEqual([
      [3, 'pubky.app', 0, 1],
      [2, 'site', 1, 0],
      [1, 'pubky.app', 2, 0],
    ]);
    expect(result.current.people).toEqual([
      { pubky: ALICE, changes: 3 },
      { pubky: BOB, changes: 1 },
    ]);
    await waitFor(() => expect(result.current.profiles).toEqual({ [ALICE]: alice, [BOB]: null }));
    expect(c.profile).toHaveBeenCalledTimes(2);
    expect(c.profile).toHaveBeenCalledWith(ALICE, false);
  });

  it('reads the feed again on refresh, asking no name twice', async () => {
    const c = client([event('PUT', ALICE, 'a/1')]);
    const { result } = renderHook(() => useActivity(c, true));
    await waitFor(() => expect(result.current.feed.status).toBe('done'));
    vi.mocked(c.latestEvents).mockResolvedValueOnce({
      events: [event('PUT', ALICE, 'a/1'), event('PUT', ALICE, 'a/2')],
      cursor: '2',
      total: 2,
    });
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.bursts[0]?.events).toHaveLength(2));
    expect(c.latestEvents).toHaveBeenCalledTimes(2);
    expect(c.profile).toHaveBeenCalledTimes(1);
  });

  it('reports a failure', async () => {
    const c = client([], { latestEvents: vi.fn(async () => Promise.reject(new Error('offline'))) });
    const { result } = renderHook(() => useActivity(c, true));
    await waitFor(() => expect(result.current.feed).toEqual({ status: 'failed', message: 'offline' }));
  });
});
