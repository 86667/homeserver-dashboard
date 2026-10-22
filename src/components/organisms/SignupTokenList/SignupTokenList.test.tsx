import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignupToken } from '@/services/admin/admin.types';
import { SignupTokenList } from './SignupTokenList';

const ALICE = 'whgxto9xtroaih7ict9chtuxh1xmbpmci5qd71jsen3ow3bscipy';
const UNUSED: SignupToken = {
  token: 'AAAA-BBBB-CCCC',
  created_at: '2026-10-14T13:00:00',
  used_at: null,
  used_by: null,
};
const USED = {
  token: 'DDDD-EEEE-FFFF',
  created_at: '2026-10-14T12:00:00',
  used_at: '2026-10-14T13:05:00',
  used_by: ALICE,
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

/** Twelve unused codes, newest last in the homeserver's (by-code) order, so the list has to sort them. */
const MANY = Array.from({ length: 12 }, (_, i) => ({
  ...UNUSED,
  token: `C${String(i).padStart(3, '0')}-TEST-CODE`,
  created_at: `2026-10-${String(1 + i).padStart(2, '0')}T10:00:00`,
}));

let fetchMock: ReturnType<typeof vi.fn>;
let unused: SignupToken[] = [UNUSED];

beforeEach(() => {
  unused = [UNUSED];
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const state = url.searchParams.get('state');
    return json({ items: state === 'used' ? [USED] : unused, next_cursor: null });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SignupTokenList', () => {
  it('lists unused codes with copy-code and, when configured, copy-sign-up-link actions', async () => {
    render(<SignupTokenList accountPageUrl="https://dashboard.example.com" />);
    await screen.findByText(UNUSED.token);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/admin/signup_tokens?state=unused&limit=1000');
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy sign-up link' })).toBeTruthy();
    expect(screen.queryByTestId('account-page-hint')).toBeNull();
  });

  it('without a sign-up page, offers codes only and says how to get links', async () => {
    render(<SignupTokenList accountPageUrl={null} />);
    await screen.findByText(UNUSED.token);
    expect(screen.queryByRole('button', { name: 'Copy sign-up link' })).toBeNull();
    expect(screen.getByTestId('account-page-hint').textContent).toContain('ACCOUNT_PAGE_URL');
  });

  it('shows who used a code, with their pubky to copy', async () => {
    render(<SignupTokenList accountPageUrl={null} />);
    await screen.findByText(UNUSED.token);
    fireEvent.click(screen.getByRole('button', { name: 'Used' }));
    const row = await screen.findByText(USED.token);
    expect(row.closest('[data-testid="signup-token-row"]')?.textContent).toContain('whgxto9x…bscipy');
    expect(screen.getByRole('button', { name: 'Copy pubky' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy code' })).toBeNull();
  });

  it('shows the newest ten, and ten more on request, inside a scrolling box', async () => {
    unused = MANY;
    render(<SignupTokenList accountPageUrl={null} />);
    await screen.findByText('C011-TEST-CODE');
    const rows = () => screen.getAllByTestId('signup-token-row').map((r) => r.querySelector('code')?.textContent);
    expect(rows()).toHaveLength(10);
    expect(rows()[0]).toBe('C011-TEST-CODE'); // newest first
    expect(rows()[9]).toBe('C002-TEST-CODE');
    const more = screen.getByTestId('signup-token-more');
    expect(more.textContent).toContain('2 left');
    expect(screen.getByTestId('signup-token-scroll').contains(more)).toBe(true);
    fireEvent.click(more);
    expect(rows()).toHaveLength(12);
    expect(screen.queryByTestId('signup-token-more')).toBeNull();
  });

  it("shows a code's limits when the homeserver reports them, and says so when it does not", async () => {
    unused = [
      { ...UNUSED, quota: { storage_quota_mb: 500, allowed_write_paths: ['/pub/site/'] } },
      { ...UNUSED, token: 'GGGG-HHHH-JJJJ', created_at: '2026-10-01T10:00:00', quota: {} },
    ];
    render(<SignupTokenList accountPageUrl={null} />);
    await screen.findByText(UNUSED.token);
    expect(screen.queryByTestId('limits-not-reported')).toBeNull();
    const [first, second] = screen.getAllByRole('button', { name: 'Show limits' });
    fireEvent.click(first);
    expect(screen.getByTestId('signup-token-limits').textContent).toContain('Storage: 500 MB');
    expect(screen.getByTestId('signup-token-limits').textContent).toContain('/pub/site/');
    fireEvent.click(second);
    expect(screen.getByTestId('signup-token-limits').textContent).toContain('default limits');

    unused = [UNUSED];
    render(<SignupTokenList accountPageUrl={null} refreshKey={1} />);
    await waitFor(() => expect(screen.getByTestId('limits-not-reported')).toBeTruthy());
  });

  it('reloads when refreshKey changes', async () => {
    const { rerender } = render(<SignupTokenList accountPageUrl={null} refreshKey={0} />);
    await screen.findByText(UNUSED.token);
    rerender(<SignupTokenList accountPageUrl={null} refreshKey={1} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('shows a load failure', async () => {
    fetchMock.mockResolvedValue(new Response('db down', { status: 500 }));
    render(<SignupTokenList accountPageUrl={null} />);
    expect((await screen.findByText('Could not load invite codes')).textContent).toBeTruthy();
    expect(screen.getByText('db down')).toBeTruthy();
  });
});
