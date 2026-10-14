import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, parseConfig } from './config';

const KEY = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseConfig', () => {
  it('reads the key, relay and testnet host', () => {
    expect(
      parseConfig({
        homeserverPublicKey: ` ${KEY} `,
        relay: 'https://relay.example.com/inbox',
        testnetHost: '10.0.0.2',
      }),
    ).toEqual({ homeserver: KEY, relay: 'https://relay.example.com/inbox', testnetHost: '10.0.0.2' });
  });

  it('accepts the pubky prefix', () => {
    expect(parseConfig({ homeserverPublicKey: `pubky${KEY}` })?.homeserver).toBe(KEY);
  });

  it('leaves the relay and testnet host to their defaults when unset or blank', () => {
    expect(parseConfig({ homeserverPublicKey: KEY, relay: ' ', testnetHost: null })).toEqual({
      homeserver: KEY,
      relay: null,
      testnetHost: null,
    });
  });

  it.each([undefined, null, 'x', {}, { homeserverPublicKey: 'not-a-key' }, { homeserverPublicKey: KEY.toUpperCase() }])(
    'is null without a usable key (%j)',
    (raw) => {
      expect(parseConfig(raw)).toBeNull();
    },
  );
});

describe('loadConfig', () => {
  it('fetches config.json fresh and checks it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ homeserverPublicKey: KEY })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadConfig()).resolves.toEqual({ homeserver: KEY, relay: null, testnetHost: null });
    expect(fetchMock).toHaveBeenCalledWith('config.json', { cache: 'no-store' });
  });

  it.each([
    ['a missing file', () => Promise.resolve(new Response('Not Found', { status: 404 }))],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a file that is not JSON', () => Promise.resolve(new Response('<html>'))],
  ])('is null for %s', async (_label, answer) => {
    vi.stubGlobal('fetch', vi.fn(answer));
    await expect(loadConfig()).resolves.toBeNull();
  });
});
