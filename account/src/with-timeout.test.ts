import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from './with-timeout';

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('passes on a result that arrives in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'late')).resolves.toBe('ok');
  });

  it('passes on a rejection that arrives in time', async () => {
    await expect(withTimeout(Promise.reject(new Error('no')), 1000, 'late')).rejects.toThrow('no');
  });

  it('rejects with the message once the time is up', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 1000, 'too late');
    vi.advanceTimersByTime(1000);
    await expect(pending).rejects.toThrow('too late');
  });

  it('clears its timer when the promise settles first', async () => {
    vi.useFakeTimers();
    await withTimeout(Promise.resolve(1), 1000, 'late');
    expect(vi.getTimerCount()).toBe(0);
  });
});
