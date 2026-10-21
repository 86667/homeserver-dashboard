import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HomeserverClient } from './homeserver-client';
import type { PublicFile } from './model';
import { summarize, usePublicFiles } from './usePublicFiles';

const ALICE = 'whgxto9xtroaih7ict9chtuxh1xmbpmci5qd71jsen3ow3bscipy';
const file = (path: string): PublicFile => ({ url: `pubky://${ALICE}/pub/${path}`, path, app: path.split('/')[0] });

function client(files: PublicFile[], sizes: Record<string, number | Error>, more = false) {
  return {
    listPublicFiles: vi.fn(async () => ({ files: files.map((f) => ({ ...f })), more })),
    fileStats: vi.fn(async (f: PublicFile) => {
      const size = sizes[f.path];
      if (size instanceof Error) throw size;
      return { size, modifiedAt: new Date('2026-10-01T00:00:00Z'), contentType: 'text/plain' };
    }),
  } as unknown as HomeserverClient;
}

describe('usePublicFiles', () => {
  it('is idle without a client or a pubky', () => {
    const { result } = renderHook(() => usePublicFiles(null, ALICE));
    expect(result.current).toEqual({ status: 'idle' });
  });

  it('lists, then measures every file, then is done', async () => {
    const c = client([file('a/1'), file('a/2'), file('b/3')], { 'a/1': 10, 'a/2': 20, 'b/3': 30 });
    const { result } = renderHook(() => usePublicFiles(c, ALICE));
    await waitFor(() => expect(result.current.status).toBe('done'));
    const state = result.current;
    if (state.status !== 'done') throw new Error('expected done');
    expect(state.measured).toBe(3);
    expect(state.files.map((f) => f.size)).toEqual([10, 20, 30]);
    expect(state.files[0].modifiedAt).toEqual(new Date('2026-10-01T00:00:00Z'));
    expect(c.listPublicFiles).toHaveBeenCalledWith(ALICE);
  });

  it('keeps going when one file cannot be measured', async () => {
    const c = client([file('a/1'), file('a/2')], { 'a/1': new Error('gone'), 'a/2': 5 });
    const { result } = renderHook(() => usePublicFiles(c, ALICE));
    await waitFor(() => expect(result.current.status).toBe('done'));
    const state = result.current;
    if (state.status !== 'done') throw new Error('expected done');
    expect(state.files.map((f) => f.size)).toEqual([undefined, 5]);
    expect(state.measured).toBe(2);
  });

  it('reports a failed listing', async () => {
    const c = { listPublicFiles: vi.fn(async () => Promise.reject(new Error('nope'))) } as unknown as HomeserverClient;
    const { result } = renderHook(() => usePublicFiles(c, ALICE));
    await waitFor(() => expect(result.current).toEqual({ status: 'failed', message: 'nope' }));
  });

  it('goes back to idle, and stops updating, when the person signs out', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const c = client([file('a/1')], { 'a/1': 1 });
    vi.mocked(c.fileStats).mockImplementation(async () => {
      await gate;
      return { size: 1 };
    });
    const { result, rerender } = renderHook(({ pubky }: { pubky: string | null }) => usePublicFiles(c, pubky), {
      initialProps: { pubky: ALICE as string | null },
    });
    await waitFor(() => expect(result.current.status).toBe('measuring'));
    rerender({ pubky: null });
    expect(result.current).toEqual({ status: 'idle' });
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: 'idle' });
  });
});

describe('summarize', () => {
  it('totals known sizes by app and overall', () => {
    const files: PublicFile[] = [
      { ...file('pubky.app/profile.json'), size: 140 },
      { ...file('pubky.app/posts/1'), size: 60 },
      { ...file('notes/x') },
    ];
    const summary = summarize(files);
    expect(summary.bytes).toBe(200);
    expect(summary.sized).toBe(2);
    expect([...summary.byApp.entries()]).toEqual([
      ['pubky.app', { files: 2, bytes: 200 }],
      ['notes', { files: 1, bytes: 0 }],
    ]);
  });
});
