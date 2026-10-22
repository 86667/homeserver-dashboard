import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSignupTokens } from './useSignupTokens';

const UNUSED = { token: 'AAAA-BBBB-CCCC', created_at: '2026-10-14T13:00:00', used_at: null, used_by: null };
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.searchParams.get('cursor'))
      return json({ items: [{ ...UNUSED, token: 'GGGG-HHHH-JJJJ' }], next_cursor: null });
    return json({ items: [UNUSED], next_cursor: UNUSED.token });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSignupTokens', () => {
  it('loads the first page for the state, then more from the cursor', async () => {
    const { result } = renderHook(() => useSignupTokens('unused'));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((i) => i.token)).toEqual([UNUSED.token]);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/admin/signup_tokens?state=unused&limit=20');
    await act(() => result.current.loadMore());
    expect(result.current.items.map((i) => i.token)).toEqual([UNUSED.token, 'GGGG-HHHH-JJJJ']);
    expect(result.current.nextCursor).toBeNull();
    expect(String(fetchMock.mock.calls[1][0])).toContain('cursor=AAAA-BBBB-CCCC');
  });

  it('reloads from the start when the state or the refresh key changes', async () => {
    const { result, rerender } = renderHook(({ state, key }) => useSignupTokens(state, key), {
      initialProps: { state: 'unused' as const, key: 0 },
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender({ state: 'unused', key: 1 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    rerender({ state: 'used' as 'unused', key: 1 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(String(fetchMock.mock.calls[2][0])).toContain('state=used');
  });

  it('reports a failure', async () => {
    fetchMock.mockResolvedValue(new Response('db down', { status: 500 }));
    const { result } = renderHook(() => useSignupTokens('used'));
    await waitFor(() => expect(result.current.error?.message).toBe('db down'));
    expect(result.current.items).toEqual([]);
  });
});
