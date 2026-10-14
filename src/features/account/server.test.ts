import { describe, expect, it } from 'vitest';
import { readAccountConfig } from './server';

const KEY = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo';

describe('readAccountConfig', () => {
  it('reads the key, relay and testnet host', () => {
    expect(
      readAccountConfig({
        HOMESERVER_PUBLIC_KEY: ` ${KEY} `,
        AUTH_RELAY: 'https://relay.example.com/inbox',
        PUBKY_TESTNET_HOST: '10.0.0.2',
      }),
    ).toEqual({ homeserver: KEY, relay: 'https://relay.example.com/inbox', testnetHost: '10.0.0.2' });
  });

  it('accepts the pubky prefix', () => {
    expect(readAccountConfig({ HOMESERVER_PUBLIC_KEY: `pubky${KEY}` })?.homeserver).toBe(KEY);
  });

  it('leaves the relay and testnet host to their defaults when unset or blank', () => {
    expect(readAccountConfig({ HOMESERVER_PUBLIC_KEY: KEY, AUTH_RELAY: ' ' })).toEqual({
      homeserver: KEY,
      relay: null,
      testnetHost: null,
    });
  });

  it.each([undefined, '', 'not-a-key', `${KEY}x`, KEY.toUpperCase(), `${KEY.slice(0, 51)}l`])(
    'is null without a usable key (%j)',
    (value) => {
      expect(readAccountConfig({ HOMESERVER_PUBLIC_KEY: value })).toBeNull();
    },
  );
});
