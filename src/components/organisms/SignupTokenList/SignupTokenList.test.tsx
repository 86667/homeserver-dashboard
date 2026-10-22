import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignupTokenList } from './SignupTokenList';

const ALICE = 'whgxto9xtroaih7ict9chtuxh1xmbpmci5qd71jsen3ow3bscipy';
const UNUSED = { token: 'AAAA-BBBB-CCCC', created_at: '2026-10-14T13:00:00', used_at: null, used_by: null };
const USED = {
  token: 'DDDD-EEEE-FFFF',
  created_at: '2026-10-14T12:00:00',
  used_at: '2026-10-14T13:05:00',
  used_by: ALICE,
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const state = url.searchParams.get('state');
    if (url.searchParams.get('cursor'))
      return json({ items: [{ ...UNUSED, token: 'GGGG-HHHH-JJJJ' }], next_cursor: null });
    return json({
      items: state === 'used' ? [USED] : [UNUSED],
      next_cursor: state === 'unused' ? 'AAAA-BBBB-CCCC' : null,
    });
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
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/admin/signup_tokens?state=unused&limit=20');
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

  it('loads the next page', async () => {
    render(<SignupTokenList accountPageUrl={null} />);
    await screen.findByText(UNUSED.token);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('GGGG-HHHH-JJJJ');
    expect(screen.getByText(UNUSED.token)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
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
