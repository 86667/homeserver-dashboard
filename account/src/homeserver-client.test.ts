import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_CAPABILITY, type AccountConfig } from './model';
import { HomeserverClient } from './homeserver-client';

const HOMESERVER = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo';
const ALICE = 'whgxto9xtroaih7ict9chtuxh1xmbpmci5qd71jsen3ow3bscipy';
const TOKEN_BYTES = new Uint8Array([1, 2, 3]);

// A stand-in for the Pubky SDK: records what the client asks of it.
const sdk = vi.hoisted(() => {
  const clientFetch = vi.fn();
  const startCookieAuthFlow = vi.fn();
  const publicGet = vi.fn();
  class Pubky {
    client = { fetch: clientFetch };
    publicStorage = { get: publicGet };
    startCookieAuthFlow = startCookieAuthFlow;
    static testnet = vi.fn(() => new Pubky());
  }
  return {
    clientFetch,
    publicGet,
    startCookieAuthFlow,
    Pubky,
    AuthFlowKind: {
      signup: vi.fn((homeserver: { key: string }, code: string | null) => ({
        kind: 'signup',
        homeserver: homeserver.key,
        code,
      })),
      signin: vi.fn(() => ({ kind: 'signin' })),
    },
    PublicKey: { from: vi.fn((key: string) => ({ key })) },
  };
});
vi.mock('@synonymdev/pubky', () => sdk);

const config: AccountConfig = { homeserver: HOMESERVER, relay: 'https://relay.example.com/inbox', testnetHost: null };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A Ring flow whose approval resolves with a token signed by ALICE. */
function flowApprovedBy(pubky = ALICE) {
  sdk.startCookieAuthFlow.mockReturnValue({
    authorizationUrl: 'pubkyauth://signin?secret=s',
    awaitToken: () => Promise.resolve({ publicKey: { z32: () => pubky }, toBytes: () => TOKEN_BYTES }),
  });
}

/** Answers the client's fetches by method and URL. */
function homeserver(routes: Record<string, () => Response | Promise<Response>>) {
  sdk.clientFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (!routes[key]) throw new Error(`unexpected request: ${key}`);
    return routes[key]();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HomeserverClient.connect', () => {
  it('uses mainnet by default, and the testnet on the configured host', async () => {
    await HomeserverClient.connect(config);
    expect(sdk.Pubky.testnet).not.toHaveBeenCalled();
    await HomeserverClient.connect({ ...config, testnetHost: '10.0.0.2' });
    expect(sdk.Pubky.testnet).toHaveBeenCalledWith('10.0.0.2');
  });
});

describe('inviteStatus', () => {
  it.each([
    [() => json({ status: 'valid' }), 'valid'],
    [() => json({ status: 'used' }), 'used'],
    [() => new Response('Token not found', { status: 404 }), 'unknown'],
    [() => new Response('Signup tokens not required', { status: 400 }), 'not_required'],
    [() => new Response('slow down', { status: 429 }), 'rate_limited'],
    [() => new Response('boom', { status: 500 }), 'error'],
    [() => json({ status: 'weird' }), 'error'],
    [() => new Response('not json'), 'error'],
  ])('maps the homeserver answer to %s', async (answer, expected) => {
    homeserver({ [`GET https://${HOMESERVER}/signup_tokens/ABCD-EFGH-JKMN`]: answer });
    const client = await HomeserverClient.connect(config);
    await expect(client.inviteStatus('ABCD-EFGH-JKMN')).resolves.toBe(expected);
  });

  it('reports a network failure as error, never throws', async () => {
    sdk.clientFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const client = await HomeserverClient.connect(config);
    await expect(client.inviteStatus('ABCD-EFGH-JKMN')).resolves.toBe('error');
  });
});

describe('isInviteRequired', () => {
  const probe = `GET https://${HOMESERVER}/signup_tokens/0000-0000-0000`;

  it.each([
    [404, true],
    [400, false],
    [429, null],
    [500, null],
  ])('a probe answered %i means %s', async (status, expected) => {
    homeserver({ [probe]: () => new Response('', { status }) });
    const client = await HomeserverClient.connect(config);
    await expect(client.isInviteRequired()).resolves.toBe(expected);
  });
});

describe('startRequest', () => {
  it('asks Ring to sign up on this homeserver with the code, for the page capability, through the relay', async () => {
    flowApprovedBy();
    const client = await HomeserverClient.connect(config);
    const request = client.startRequest('signup', 'ABCD-EFGH-JKMN');
    expect(request.authUrl).toBe('pubkyauth://signin?secret=s');
    expect(sdk.startCookieAuthFlow).toHaveBeenCalledWith(
      ACCOUNT_CAPABILITY,
      { kind: 'signup', homeserver: HOMESERVER, code: 'ABCD-EFGH-JKMN' },
      'https://relay.example.com/inbox',
    );
  });

  it('asks Ring for a plain sign-in', async () => {
    flowApprovedBy();
    const client = await HomeserverClient.connect(config);
    client.startRequest('signin', null);
    expect(sdk.startCookieAuthFlow).toHaveBeenCalledWith(ACCOUNT_CAPABILITY, { kind: 'signin' }, config.relay);
  });

  it('signs in at this homeserver with the token, then signs out where it signed in', async () => {
    flowApprovedBy();
    const signedIn = new Response(new Uint8Array([0]));
    Object.defineProperty(signedIn, 'url', { value: 'http://hs.example:6286/session' });
    homeserver({ [`POST https://${HOMESERVER}/session`]: () => signedIn });
    const browserFetch = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal('fetch', browserFetch);
    const client = await HomeserverClient.connect(config);
    await expect(client.startRequest('signin', null).awaitAccount()).resolves.toEqual({
      pubky: ALICE,
      hasAccount: true,
    });

    expect(sdk.clientFetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: TOKEN_BYTES,
      credentials: 'include',
    });
    expect(browserFetch).toHaveBeenCalledWith('http://hs.example:6286/session', {
      method: 'DELETE',
      headers: { 'pubky-host': ALICE },
      credentials: 'include',
    });
  });

  it('reports no account when the homeserver does not know the signer', async () => {
    flowApprovedBy();
    homeserver({ [`POST https://${HOMESERVER}/session`]: () => new Response('Not Found', { status: 404 }) });
    const client = await HomeserverClient.connect(config);
    await expect(client.startRequest('signin', null).awaitAccount()).resolves.toEqual({
      pubky: ALICE,
      hasAccount: false,
    });
    expect(sdk.clientFetch).toHaveBeenCalledTimes(1);
  });

  it("passes on the homeserver's reason for refusing the token", async () => {
    flowApprovedBy();
    homeserver({
      [`POST https://${HOMESERVER}/session`]: () => new Response('AuthToken already used', { status: 400 }),
    });
    const client = await HomeserverClient.connect(config);
    await expect(client.startRequest('signin', null).awaitAccount()).rejects.toThrow('AuthToken already used');
  });

  it('still reports the account when signing out fails', async () => {
    flowApprovedBy();
    homeserver({ [`POST https://${HOMESERVER}/session`]: () => new Response(new Uint8Array([0])) });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('blocked')));
    const client = await HomeserverClient.connect(config);
    await expect(client.startRequest('signin', null).awaitAccount()).resolves.toEqual({
      pubky: ALICE,
      hasAccount: true,
    });
  });

  it('gives up waiting for Ring after ten minutes', async () => {
    vi.useFakeTimers();
    sdk.startCookieAuthFlow.mockReturnValue({
      authorizationUrl: 'pubkyauth://x',
      awaitToken: () => new Promise(() => {}),
    });
    const client = await HomeserverClient.connect(config);
    const waiting = client.startRequest('signin', null).awaitAccount();
    vi.advanceTimersByTime(10 * 60 * 1000);
    await expect(waiting).rejects.toThrow('This request expired. Start again.');
  });

  it('does not leave an abandoned request failing unhandled', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    sdk.startCookieAuthFlow.mockReturnValue({
      authorizationUrl: 'pubkyauth://x',
      awaitToken: () => Promise.reject(new Error('relay gone')),
    });
    const client = await HomeserverClient.connect(config);
    client.startRequest('signin', null);
    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('listPublicFiles', () => {
  const base = `https://${HOMESERVER}/storage/${ALICE}/pub/`;
  const listing = (...paths: string[]) => new Response(paths.map((p) => `pubky://${ALICE}/pub/${p}`).join('\n'));

  it('reads the listing into files with their app folder, skipping folders', async () => {
    homeserver({ [`GET ${base}?limit=1000`]: () => listing('pubky.app/', 'pubky.app/profile.json', 'notes.txt') });
    const client = await HomeserverClient.connect(config);
    expect(await client.listPublicFiles(ALICE)).toEqual({
      files: [
        { url: `pubky://${ALICE}/pub/pubky.app/profile.json`, path: 'pubky.app/profile.json', app: 'pubky.app' },
        { url: `pubky://${ALICE}/pub/notes.txt`, path: 'notes.txt', app: '' },
      ],
      more: false,
    });
  });

  it('follows the cursor page by page and stops at the cap', async () => {
    const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => `f${from + i}.txt`);
    homeserver({
      [`GET ${base}?limit=3`]: () => listing(...page(0, 3)),
      [`GET ${base}?limit=3&cursor=${encodeURIComponent(`pubky://${ALICE}/pub/f2.txt`)}`]: () => listing(...page(3, 3)),
      [`GET ${base}?limit=1&cursor=${encodeURIComponent(`pubky://${ALICE}/pub/f5.txt`)}`]: () => listing('f6.txt'),
    });
    const client = await HomeserverClient.connect(config);
    const { files, more } = await client.listPublicFiles(ALICE, 7, 3);
    expect(files.map((f) => f.path)).toEqual(['f0.txt', 'f1.txt', 'f2.txt', 'f3.txt', 'f4.txt', 'f5.txt', 'f6.txt']);
    expect(more).toBe(true);
  });

  it('ends when a page comes back short', async () => {
    homeserver({
      [`GET ${base}?limit=2`]: () => listing('a', 'b'),
      [`GET ${base}?limit=2&cursor=${encodeURIComponent(`pubky://${ALICE}/pub/b`)}`]: () => listing('c'),
    });
    const client = await HomeserverClient.connect(config);
    const { files, more } = await client.listPublicFiles(ALICE, 4, 2);
    expect(files.map((f) => f.path)).toEqual(['a', 'b', 'c']);
    expect(more).toBe(false);
  });

  it('treats a person with nothing stored as having no files', async () => {
    homeserver({ [`GET ${base}?limit=1000`]: () => new Response('Directory Not Found', { status: 404 }) });
    const client = await HomeserverClient.connect(config);
    expect(await client.listPublicFiles(ALICE)).toEqual({ files: [], more: false });
  });

  it('reports any other failure', async () => {
    homeserver({ [`GET ${base}?limit=1000`]: () => new Response('', { status: 503 }) });
    const client = await HomeserverClient.connect(config);
    await expect(client.listPublicFiles(ALICE)).rejects.toThrow('503');
  });
});

describe('fileStats', () => {
  const file = { url: `pubky://${ALICE}/pub/pubky.app/profile.json`, path: 'pubky.app/profile.json', app: 'pubky.app' };

  it('takes size, date and type from the HEAD answer', async () => {
    homeserver({
      [`HEAD https://${HOMESERVER}/storage/${ALICE}/pub/pubky.app/profile.json`]: () =>
        new Response(null, {
          headers: {
            'Content-Length': '140',
            'Last-Modified': 'Thu, 20 Aug 2026 10:03:37 GMT',
            'Content-Type': 'application/json',
          },
        }),
    });
    const client = await HomeserverClient.connect(config);
    expect(await client.fileStats(file)).toEqual({
      size: 140,
      modifiedAt: new Date('2026-08-20T10:03:37Z'),
      contentType: 'application/json',
    });
  });

  it('copes with missing or odd headers', async () => {
    homeserver({
      [`HEAD https://${HOMESERVER}/storage/${ALICE}/pub/pubky.app/profile.json`]: () =>
        new Response(null, { headers: { 'Last-Modified': 'not a date' } }),
    });
    const client = await HomeserverClient.connect(config);
    expect(await client.fileStats(file)).toEqual({ size: 0, modifiedAt: undefined, contentType: undefined });
  });
});

describe('profile', () => {
  const url = `GET https://${HOMESERVER}/storage/${ALICE}/pub/pubky.app/profile.json`;

  it('is null for someone without a pubky.app profile', async () => {
    homeserver({ [url]: () => new Response('', { status: 404 }) });
    const client = await HomeserverClient.connect(config);
    expect(await client.profile(ALICE)).toBeNull();
  });

  it('reads name, bio, status and links, dropping what is malformed', async () => {
    homeserver({
      [url]: () =>
        json({
          name: 'Alice',
          bio: ' ',
          status: 'around',
          links: [{ title: 'Site', url: 'https://alice.example' }, { title: 'bad' }, 'junk'],
          image: null,
        }),
    });
    const client = await HomeserverClient.connect(config);
    expect(await client.profile(ALICE)).toEqual({
      name: 'Alice',
      bio: null,
      status: 'around',
      links: [{ title: 'Site', url: 'https://alice.example' }],
      avatar: null,
    });
  });

  it('turns a pubky.app image record into a data URL through its blob', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    homeserver({ [url]: () => json({ name: 'Alice', image: `pubky://${ALICE}/pub/pubky.app/files/img1` }) });
    sdk.publicGet.mockImplementation(async (address: string) => {
      if (address.endsWith('/files/img1')) return json({ src: `pubky://${ALICE}/pub/pubky.app/blobs/blob1` });
      if (address.endsWith('/blobs/blob1')) {
        return new Response(png, { headers: { 'Content-Type': 'image/png', 'Content-Length': '4' } });
      }
      throw new Error(`unexpected read: ${address}`);
    });
    const client = await HomeserverClient.connect(config);
    expect((await client.profile(ALICE))?.avatar).toBe('data:image/png;base64,iVBORw==');
  });

  it.each([
    ['not an image', () => new Response('x', { headers: { 'Content-Type': 'text/html' } })],
    ['too large', () => new Response('x', { headers: { 'Content-Type': 'image/png', 'Content-Length': '9999999' } })],
    ['unreachable', () => Promise.reject(new Error('offline'))],
  ])('shows no avatar when the image is %s, and still returns the profile', async (_case, reply) => {
    homeserver({ [url]: () => json({ name: 'Alice', image: 'https://cdn.example/a.png' }) });
    sdk.clientFetch.mockImplementation(async (target: string) =>
      target === 'https://cdn.example/a.png' ? reply() : json({ name: 'Alice', image: 'https://cdn.example/a.png' }),
    );
    const client = await HomeserverClient.connect(config);
    expect(await client.profile(ALICE)).toMatchObject({ name: 'Alice', avatar: null });
  });

  it('ignores a profile without a name', async () => {
    homeserver({ [url]: () => json({ bio: 'no name' }) });
    const client = await HomeserverClient.connect(config);
    expect(await client.profile(ALICE)).toBeNull();
  });
});
