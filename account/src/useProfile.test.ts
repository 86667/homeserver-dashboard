import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HomeserverClient } from './homeserver-client';
import { useProfile } from './useProfile';

const ALICE = 'whgxto9xtroaih7ict9chtuxh1xmbpmci5qd71jsen3ow3bscipy';
const profile = { name: 'Alice', bio: null, status: null, links: [], avatar: null };

describe('useProfile', () => {
  it('is idle without a client or a pubky', () => {
    const { result } = renderHook(() => useProfile(null, ALICE));
    expect(result.current).toEqual({ status: 'idle' });
  });

  it('loads the profile, or its absence', async () => {
    const c = { profile: vi.fn(async () => profile) } as unknown as HomeserverClient;
    const { result } = renderHook(() => useProfile(c, ALICE));
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current).toEqual({ status: 'done', profile }));
    const none = { profile: vi.fn(async () => null) } as unknown as HomeserverClient;
    const { result: r2 } = renderHook(() => useProfile(none, ALICE));
    await waitFor(() => expect(r2.current).toEqual({ status: 'done', profile: null }));
  });

  it('reports a failure', async () => {
    const c = { profile: vi.fn(async () => Promise.reject(new Error('offline'))) } as unknown as HomeserverClient;
    const { result } = renderHook(() => useProfile(c, ALICE));
    await waitFor(() => expect(result.current).toEqual({ status: 'failed', message: 'offline' }));
  });
});
