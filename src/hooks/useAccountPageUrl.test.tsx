import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAccountPageUrl } from './useAccountPageUrl';

describe('useAccountPageUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the configured address once loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ url: 'https://dashboard.example.com/' })),
    );
    const { result } = renderHook(() => useAccountPageUrl());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('https://dashboard.example.com/'));
    expect(fetch).toHaveBeenCalledWith('/api/account-page', { cache: 'no-store' });
  });

  it.each([
    ['none is configured', async () => Response.json({ url: null })],
    ['the request fails', async () => new Response(null, { status: 503 })],
    ['the network is down', async () => Promise.reject(new Error('offline'))],
  ])('stays null when %s', async (_case, reply) => {
    vi.stubGlobal('fetch', vi.fn(reply));
    const { result } = renderHook(() => useAccountPageUrl());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBeNull();
  });
});
