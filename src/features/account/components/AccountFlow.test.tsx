import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountConfig, AccountInfo, InviteStatus } from '../model';
import { AccountFlow } from './AccountFlow';
import { HomeserverClient, type RingRequest } from '../homeserver-client';

let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams }));
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
};

/** A homeserver client whose answers the test chooses. */
function homeserver({
  inviteRequired = true,
  inviteStatus = () => 'valid',
  account = () => Promise.resolve({ pubky: ALICE, hasAccount: true }),
}: FakeHomeserver = {}) {
  let asked = 0;
  const client = {
    isInviteRequired: vi.fn(async () => inviteRequired),
    inviteStatus: vi.fn(async () => inviteStatus(asked++)),
    startRequest: vi.fn((): RingRequest => ({ authUrl: 'pubkyauth://signup?secret=s', awaitAccount: () => account() })),
  };
  vi.mocked(HomeserverClient.connect).mockResolvedValue(client as unknown as HomeserverClient);
  return client;
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  vi.mocked(HomeserverClient.connect).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AccountFlow sign-up', () => {
  it('signs up with the code from an invite link and welcomes the new account', async () => {
    searchParams = new URLSearchParams({ token: CODE.toLowerCase() });
    const client = homeserver({ inviteStatus: (asked) => (asked === 0 ? 'valid' : 'used') });

    render(<AccountFlow config={CONFIG} />);
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
    render(<AccountFlow config={CONFIG} />);
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
    searchParams = new URLSearchParams({ token: CODE });
    homeserver({ inviteStatus: (asked) => (asked === 0 ? 'valid' : 'used') });
    render(<AccountFlow config={CONFIG} />);
    await screen.findByText('Invite code accepted.');
    fireEvent.click(screen.getByTestId('account-signup'));
    await screen.findByTestId('account-details');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByText('This invite code has already been used.');
  });

  it('offers sign-up without a code on a homeserver that needs none', async () => {
    const client = homeserver({ inviteRequired: false });
    render(<AccountFlow config={CONFIG} />);
    const signUp = (await screen.findByTestId('account-signup')) as HTMLButtonElement;
    expect(screen.queryByLabelText('Invite code')).toBeNull();
    expect(signUp.disabled).toBe(false);
    fireEvent.click(signUp);
    await screen.findByText('You have an account on this homeserver');
    expect(client.startRequest).toHaveBeenCalledWith('signup', null);
  });

  it('lets a visitor sign up without a code when the homeserver only says so in answer to one', async () => {
    const client = homeserver({ inviteRequired: null, inviteStatus: () => 'not_required' });
    render(<AccountFlow config={CONFIG} />);
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
    render(<AccountFlow config={CONFIG} />);
    fireEvent.click(await screen.findByTestId('account-signup'));
    expect((await screen.findByTestId('account-missing')).textContent).toMatch(/did not go through/);
  });
});

describe('AccountFlow sign-in', () => {
  it('signs in without sending a code, and says welcome back', async () => {
    searchParams = new URLSearchParams({ token: CODE });
    const client = homeserver();
    render(<AccountFlow config={CONFIG} />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    await screen.findByText('Welcome back');
    expect(client.startRequest).toHaveBeenCalledWith('signin', null);
  });

  it('explains when the pubky has no account here', async () => {
    homeserver({ account: () => Promise.resolve({ pubky: ALICE, hasAccount: false }) });
    render(<AccountFlow config={CONFIG} />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    await screen.findByTestId('account-missing');
    expect(screen.getByText('No account on this homeserver')).toBeTruthy();
  });

  it('copies the pubky', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    homeserver();
    render(<AccountFlow config={CONFIG} />);
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
    render(<AccountFlow config={CONFIG} />);
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
    render(<AccountFlow config={CONFIG} />);
    fireEvent.click(await screen.findByTestId('account-signin'));
    expect((await screen.findByTestId('account-failed')).textContent).toContain('AuthToken already used');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('account-start');
  });

  it('says when the homeserver cannot be reached, and retries', async () => {
    vi.mocked(HomeserverClient.connect).mockRejectedValueOnce(new Error('Failed to load the Pubky SDK'));
    render(<AccountFlow config={CONFIG} />);
    expect((await screen.findByTestId('account-unavailable')).textContent).toContain('Failed to load the Pubky SDK');
    homeserver();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('account-start');
  });

  it('says the page is not set up without a config, and connects to nothing', () => {
    render(<AccountFlow config={null} />);
    expect(screen.getByTestId('account-not-set-up').textContent).toContain('not set up');
    expect(HomeserverClient.connect).not.toHaveBeenCalled();
  });
});
