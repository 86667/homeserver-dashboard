import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HomeserverClient } from './homeserver-client';
import { useHomeserver } from './useHomeserver';

const info = { features: ['webdav-locks'], address: 'https://hs.example.com' };
const record = { publishedAt: new Date(0), records: [] };

describe('useHomeserver', () => {
  it('waits until enabled, then loads the info and the record', async () => {
    const c = {
      info: vi.fn(async () => info),
      homeserverRecord: vi.fn(async () => record),
    } as unknown as HomeserverClient;
    const { result, rerender } = renderHook(({ enabled }) => useHomeserver(c, enabled), {
      initialProps: { enabled: false },
    });
    expect(result.current).toEqual({ info: { status: 'loading' }, record: { status: 'loading' } });
    expect(c.info).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() =>
      expect(result.current).toEqual({
        info: { status: 'done', value: info },
        record: { status: 'done', value: record },
      }),
    );
  });

  it('reports each failure on its own', async () => {
    const c = {
      info: vi.fn(async () => Promise.reject(new Error('no info'))),
      homeserverRecord: vi.fn(async () => null),
    } as unknown as HomeserverClient;
    const { result } = renderHook(() => useHomeserver(c, true));
    await waitFor(() =>
      expect(result.current).toEqual({
        info: { status: 'failed', message: 'no info' },
        record: { status: 'done', value: null },
      }),
    );
  });
});
