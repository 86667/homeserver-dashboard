import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountConfig, AccountInfo, FeedEvent, InviteStatus, Profile, PublicFile } from '../model';
import { AccountFlow } from './AccountFlow';
import { HomeserverClient, type RingRequest } from '../homeserver-client';

vi.mock('../homeserver-client', () => ({ HomeserverClient: { connect: vi.fn() } }));

const CONFIG: AccountConfig = {
  homeserver: '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo',
  relay: null,
  testnetHost: null,
};
const CODE = 'ABCD-EFGH-JKMN';
const ALICE = 'whgxto9xtroaih7ict9chtuxh1xmbpmci5qd71jsen3ow3bscipy';

type FakeHomeserver = {
  inviteRequired?: boolean | null;
  /** The code's status, by how many times it has been asked about. */
  inviteStatus?: (askedBefore: number) => InviteStatus;
  account?: () => Promise<AccountInfo>;
  files?: PublicFile[];
  profile?: Profile | null;
  events?: FeedEvent[];
};

const feedEvent = (kind: 'PUT' | 'DEL', pubky: string, path: string): FeedEvent => ({
  kind,
  url: `pubky://${pubky}/pub/${path}`,
  pubky,
  path,
  app: path.includes('/') ? path.slice(0, path.indexOf('/')) : '',
});
const BOB = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

const publicFile = (path: string, size: number): PublicFile => ({
  url: `pubky://${ALICE}/pub/${path}`,
  path,
  app: path.split('/')[0],
  size,
});

/** A homeserver client whose answers the test chooses. */
function homeserver({
  inviteRequired = true,
  inviteStatus = () => 'valid',
  account = () => Promise.resolve({ pubky: ALICE, hasAccount: true }),
  files = [publicFile('pubky.app/profile.json', 140), publicFile('pubky.app/posts/1', 60)],
  profile = { name: 'Alice', bio: 'Hi there', status: null, links: [], avatar: null },
  events = [feedEvent('PUT', BOB, 'site/index.html'), feedEvent('PUT', ALICE, 'pubky.app/profile.json')],
}: FakeHomeserver = {}) {
  let asked = 0;
  const client = {
    isInviteRequired: vi.fn(async () => inviteRequired),
    inviteStatus: vi.fn(async () => inviteStatus(asked++)),
    startRequest: vi.fn((): RingRequest => ({ authUrl: 'pubkyauth://signup?secret=s', awaitAccount: () => account() })),
    listPublicFiles: vi.fn(async () => ({ files: files.map(({ size: _, ...f }) => ({ ...f })), more: false })),
    fileStats: vi.fn(async (f: PublicFile) => ({ size: files.find((x) => x.path === f.path)?.size ?? 0 })),
    profile: vi.fn(async (pubky: string) => (pubky === ALICE ? profile : null)),
    latestEvents: vi.fn(async () => ({ events, cursor: String(events.length), total: events.length })),
    ownEvents: vi.fn(async (pubky: string, cursor: string | null) => {
      const mine = events.filter((e) => e.pubky === pubky).reverse();
      return cursor === null ? { events: mine, cursor: '1' } : { events: [], cursor: null };
    }),
    info: vi.fn(async () => ({ features: ['webdav-locks', 'something-new'], address: 'https://hs.example.com' })),
    homeserverRecord: vi.fn(async () => ({
      publishedAt: new Date(Date.now() - 3 * 3_600_000),
      records: [
        { name: '@', type: 'HTTPS', value: '1 . port=6287 ipv4hint=2.28.97.159', ttl: 3600 },
        { name: '@', type: 'HTTPS', value: '10 hs.example.com', ttl: 3600 },
      ],
    })),
  };
  vi.mocked(HomeserverClient.connect).mockResolvedValue(client as unknown as HomeserverClient);
  return client;
}

beforeEach(() => {
  vi.mocked(HomeserverClient.connect).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AccountFlow sign-up', () => {
  it('signs up with the code from an invite link and welcomes the new account', async () => {
    const client = homeserver({ inviteStatus: (asked) => (asked === 0 ? 'valid' : 'used') });

    render(<AccountFlow config={CONFIG} initialCode={CODE.toLowerCase()} />);
    const input = (await screen.findByLabelText('Invite code')) as HTMLInputElement;
    expect(input.value).toBe(CODE);
    await screen.findByText('Invite code accepted.');
    fireEvent.click(screen.getByTestId('account-signup'));

    await screen.findByText('Welcome to your homeserver');
    expect(screen.getByTestId('account-pubky').textContent).toBe(`pubky${ALICE}`);
    expect(client.startRequest).toHaveBeenCalledWith('signup', CODE);
    expect(HomeserverClient.connect).toHaveBeenCalledWith(CONFIG);
  });

  it('keeps sign-up disabled until the code is known to be valid', async () => {
    homeserver({ inviteStatus: () => 'used' });
    render(<AccountFlow config={CONFIG} initialCode="" />);
    const input = await screen.findByLabelText('Invite code');
    const signUp = screen.getByTestId('account-signup') as HTMLButtonElement;
    expect(signUp.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'abcd' } });
    expect(screen.getByTestId('invite-code-hint').textContent).toBe('Codes look like XXXX-XXXX-XXXX.');

    fireEvent.change(input, { target: { value: CODE } });
    await screen.findByText('This invite code has already been used.');
    expect(signUp.disabled).toBe(true);
  });

  it('checks the code again on returning to the start, since a sign-up may have spent it', async () => {
    homeserver({ inviteStatus: (asked) => (asked === 0 ? 'valid' : 'used') });
    render(<AccountFlow config={CONFIG} initialCode={CODE} />);
    await screen.findByText('Invite code accepted.');
    fireEvent.click(screen.getByTestId('account-signup'));
    await screen.findByTestId('account-details');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByText('This invite code has already been used.');
  });

  it('offers sign-up without a code on a homeserver that needs none', async () => {
    const client = homeserver({ inviteRequired: false });
    render(<AccountFlow config={CONFIG} initialCode="" />);
    const signUp = (await screen.findByTestId('account-signup')) as HTMLButtonElement;
    expect(screen.queryByLabelText('Invite code')).toBeNull();
    expect(signUp.disabled).toBe(false);
    fireEvent.click(signUp);
    await screen.findByText('You have an account on this homeserver');
    expect(client.startRequest).toHaveBeenCalledWith('signup', null);
  });

  it('lets a visitor sign up without a code when the homeserver only says so in answer to one', async () => {
    const client = homeserver({ inviteRequired: null, inviteStatus: () => 'not_required' });
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.change(await screen.findByLabelText('Invite code'), { target: { value: CODE } });
    await screen.findByText(/does not need an invite code/);
    const signUp = screen.getByTestId('account-signup') as HTMLButtonElement;
    expect(signUp.disabled).toBe(false);
    fireEvent.click(signUp);
    await screen.findByTestId('account-details');
    expect(client.startRequest).toHaveBeenCalledWith('signup', null);
  });

  it('explains a sign-up that left no account behind', async () => {
    homeserver({ inviteRequired: false, account: () => Promise.resolve({ pubky: ALICE, hasAccount: false }) });
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.click(await screen.findByTestId('account-signup'));
    expect((await screen.findByTestId('account-missing')).textContent).toMatch(/did not go through/);
  });
});

describe('AccountFlow sign-in', () => {
  it('signs in without sending a code, and says welcome back', async () => {
    const client = homeserver();
    render(<AccountFlow config={CONFIG} initialCode={CODE} />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    await screen.findByText('Welcome back');
    expect(client.startRequest).toHaveBeenCalledWith('signin', null);
  });

  it('explains when the pubky has no account here', async () => {
    homeserver({ account: () => Promise.resolve({ pubky: ALICE, hasAccount: false }) });
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    await screen.findByTestId('account-missing');
    expect(screen.getByText('No account on this homeserver')).toBeTruthy();
  });

  it('copies the pubky', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    homeserver();
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy pubky' }));
    await screen.findByRole('button', { name: 'Copied pubky' });
    expect(writeText).toHaveBeenCalledWith(`pubky${ALICE}`);
  });
});

describe('AccountFlow waiting and failures', () => {
  it('shows the QR code and the link while waiting, copies the link, and Cancel goes back', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    homeserver({ account: () => new Promise(() => {}) });
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    await screen.findByTestId('account-qr');
    expect(screen.getByRole('link', { name: 'Open in Pubky Ring on this device' }).getAttribute('href')).toBe(
      'pubkyauth://signup?secret=s',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await screen.findByRole('button', { name: 'Copied link' });
    expect(writeText).toHaveBeenCalledWith('pubkyauth://signup?secret=s');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByTestId('account-start');
  });

  it('reports a failed request with a way to try again', async () => {
    homeserver({ account: () => Promise.reject(new Error('AuthToken already used')) });
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    expect((await screen.findByTestId('account-failed')).textContent).toContain('AuthToken already used');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('account-start');
  });

  it('says when the homeserver cannot be reached, and retries', async () => {
    vi.mocked(HomeserverClient.connect).mockRejectedValueOnce(new Error('Failed to load the Pubky SDK'));
    render(<AccountFlow config={CONFIG} initialCode="" />);
    expect((await screen.findByTestId('account-unavailable')).textContent).toContain('Failed to load the Pubky SDK');
    homeserver();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('account-start');
  });

  it('says the page is not set up without a config, and connects to nothing', () => {
    render(<AccountFlow config={null} initialCode="" />);
    expect(screen.getByTestId('account-not-set-up').textContent).toContain('not set up');
    expect(HomeserverClient.connect).not.toHaveBeenCalled();
  });
});

describe('AccountFlow tabs', () => {
  it('has the three tabs, with Account open; the others load when first opened', async () => {
    const client = homeserver();
    render(<AccountFlow config={CONFIG} initialCode="" />);
    expect(screen.getByTestId('tab-account')).toBeTruthy();
    expect(screen.getByTestId('tab-activity')).toBeTruthy();
    expect(screen.getByTestId('tab-homeserver')).toBeTruthy();
    expect(await screen.findByTestId('account')).toBeTruthy();
    expect(client.latestEvents).not.toHaveBeenCalled();
    expect(client.info).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByTestId('tab-activity'));
    expect(await screen.findByTestId('activity-signin')).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId('tab-homeserver'));
    expect(await screen.findByTestId('homeserver-features')).toBeTruthy();
    expect(client.ownEvents).not.toHaveBeenCalled();
    expect(client.latestEvents).not.toHaveBeenCalled();
    expect(client.info).toHaveBeenCalledTimes(1);
  });

  it('shows the tabs even when the page is not set up', () => {
    render(<AccountFlow config={null} initialCode="" />);
    expect(screen.getByTestId('tab-account')).toBeTruthy();
    expect(screen.getByTestId('account-not-set-up')).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId('tab-homeserver'));
    expect(screen.getByTestId('account-not-set-up')).toBeTruthy();
    expect(screen.queryByTestId('homeserver-key')).toBeNull();
  });

  it('keeps the sign-in while switching tabs', async () => {
    homeserver();
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    await screen.findByText('Welcome back');
    fireEvent.mouseDown(screen.getByTestId('tab-activity'));
    await screen.findByTestId('activity-tab');
    fireEvent.mouseDown(screen.getByTestId('tab-account'));
    expect(await screen.findByText('Welcome back')).toBeTruthy();
  });
});

describe('AccountFlow activity tab', () => {
  it('asks visitors to sign in, and sends them to the Account tab', async () => {
    homeserver();
    render(<AccountFlow config={CONFIG} initialCode="" />);
    await screen.findByTestId('account-signin');
    fireEvent.mouseDown(screen.getByTestId('tab-activity'));
    fireEvent.click(await screen.findByRole('button', { name: 'Go to Account' }));
    expect(await screen.findByTestId('account-signin')).toBeTruthy();
  });

  it('shows the signed-in person their own changes, a page at a time', async () => {
    const client = homeserver({
      events: Array.from({ length: 12 }, (_, i) => feedEvent('PUT', ALICE, `pubky.app/posts/${i + 1}`)),
    });
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    await screen.findByText('Welcome back');
    expect(client.ownEvents).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByTestId('tab-activity'));

    const list = await screen.findByTestId('own-events');
    expect(list.querySelectorAll('li')).toHaveLength(12);
    expect(list.textContent).toContain('posts/12');
    expect(client.ownEvents).toHaveBeenCalledWith(ALICE, null, 10);
    expect(client.latestEvents).not.toHaveBeenCalled();
  });

  it('shows everyone only on request, with names from profiles and the visitor marked', async () => {
    const client = homeserver();
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    await screen.findByText('Welcome back');
    fireEvent.mouseDown(screen.getByTestId('tab-activity'));
    await screen.findByTestId('own-events');
    fireEvent.click(screen.getByTestId('activity-show-all'));

    const summary = await screen.findByTestId('activity-summary');
    expect(summary.textContent).toContain('2 people');
    const people = screen.getByTestId('activity-people');
    await waitFor(() => expect(people.textContent).toContain('Alice'));
    expect(people.textContent).toContain('you');
    expect(people.textContent).toContain('o1gg96…1ngo');
    expect(screen.getByTestId('activity-bursts').querySelectorAll('details')).toHaveLength(2);
    expect(client.profile).toHaveBeenCalledWith(BOB, false);
    expect(client.latestEvents).toHaveBeenCalledTimes(1);
  });

  it('says when the person has not changed anything yet', async () => {
    homeserver({ events: [] });
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    await screen.findByText('Welcome back');
    fireEvent.mouseDown(screen.getByTestId('tab-activity'));
    expect(await screen.findByTestId('own-none')).toBeTruthy();
  });
});

describe('AccountFlow homeserver tab', () => {
  it('shows the connection, key, addresses, sign-up mode, features and the network record', async () => {
    homeserver({ inviteRequired: true });
    render(<AccountFlow config={CONFIG} initialCode="" />);
    await screen.findByTestId('account-signin');
    fireEvent.mouseDown(screen.getByTestId('tab-homeserver'));

    expect(screen.getByTestId('homeserver-key').textContent).toBe(CONFIG.homeserver);
    expect(await screen.findByTestId('homeserver-connected')).toBeTruthy();
    expect(screen.getByTestId('homeserver-address').textContent).toContain('hs.example.com');
    expect(screen.getByTestId('homeserver-address').textContent).toContain('Reachable');
    expect(screen.getByTestId('homeserver-signups').textContent).toBe('By invite code');
    const features = screen.getByTestId('homeserver-features');
    expect(features.textContent).toContain('WebDAV locks');
    expect(features.textContent).toContain('something-new');
    expect((await screen.findByTestId('record-published')).textContent?.trim()).toBe('Published 3 hours ago');
    expect(screen.getByTestId('homeserver-pubky-address').textContent).toBe('2.28.97.159:6287');

    fireEvent.click(screen.getByTestId('record-view'));
    const entries = await screen.findByTestId('record-entries');
    expect(entries.textContent).toContain('10 hs.example.com');
    expect(entries.textContent).toContain('3600');
  });
});

describe('AccountFlow page', () => {
  it('offers sign-in in the header from any tab, and shows the QR code on the Account tab', async () => {
    const client = homeserver();
    render(<AccountFlow config={CONFIG} initialCode="" />);
    expect(screen.queryByTestId('header-signin')).toBeNull(); // still connecting
    await screen.findByTestId('account-signin');
    fireEvent.mouseDown(screen.getByTestId('tab-homeserver'));
    await screen.findByTestId('homeserver-key');
    fireEvent.click(screen.getByTestId('header-signin'));
    expect(await screen.findByTestId('account-qr')).toBeTruthy();
    expect(screen.queryByTestId('header-signin')).toBeNull(); // one at a time
    expect(client.startRequest).toHaveBeenCalledWith('signin', null);
    await screen.findByText('Welcome back');
    expect(screen.getByTestId('sign-out')).toBeTruthy();
  });

  it('offers sign-out in the header only once signed in, and shows the version in the footer', async () => {
    homeserver();
    render(<AccountFlow config={CONFIG} initialCode="" />);
    await screen.findByTestId('account-signin');
    expect(screen.queryByTestId('sign-out')).toBeNull();
    expect(screen.getByTestId('page-version').textContent).toMatch(/^v\d+\.\d+\.\d+$/);
    fireEvent.click(screen.getByTestId('account-signin'));
    await screen.findByText('Welcome back');
    fireEvent.mouseDown(screen.getByTestId('tab-homeserver'));
    await screen.findByTestId('homeserver-key');
    fireEvent.click(screen.getByTestId('sign-out'));
    // Signing out returns to the Account tab, where the sign-in is.
    await screen.findByTestId('account-signin');
    expect(screen.queryByTestId('sign-out')).toBeNull();
    expect(screen.queryByTestId('homeserver-key')).toBeNull();
  });
});

describe('AccountFlow signed-in details', () => {
  it('shows the profile and the files with the space they use', async () => {
    const client = homeserver();
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    await screen.findByText('Welcome back');

    expect((await screen.findByTestId('profile-name')).textContent).toBe('Alice');
    expect(screen.getByText('Hi there')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('files-summary').textContent).toContain('200 B'));
    expect(screen.getByTestId('files-summary').textContent).toContain('in 2 public files');
    expect(screen.getByTestId('files-by-app').textContent).toContain('pubky.app');
    expect(screen.getByTestId('files-by-app').textContent).toContain('profile.json');
    expect(client.listPublicFiles).toHaveBeenCalledWith(ALICE);
    expect(client.profile).toHaveBeenCalledWith(ALICE);
  });

  it('says so when there is no profile and nothing stored', async () => {
    homeserver({ files: [], profile: null });
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    await screen.findByTestId('profile-none');
    await screen.findByTestId('files-none');
  });

  it('shows neither card for a pubky without an account here', async () => {
    homeserver({ account: () => Promise.resolve({ pubky: ALICE, hasAccount: false }) });
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    await screen.findByTestId('account-missing');
    expect(screen.queryByTestId('profile-card')).toBeNull();
    expect(screen.queryByTestId('files-card')).toBeNull();
  });

  it('removes the cards again on sign-out', async () => {
    homeserver();
    render(<AccountFlow config={CONFIG} initialCode="" />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    await screen.findByTestId('files-card');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByTestId('account-signin');
    expect(screen.queryByTestId('files-card')).toBeNull();
  });
});
