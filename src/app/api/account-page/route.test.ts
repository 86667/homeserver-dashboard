// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './route';

describe('account-page route', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('answers null when ACCOUNT_PAGE_URL is not set', async () => {
    delete process.env.ACCOUNT_PAGE_URL;
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ url: null });
  });

  it('returns the configured address, normalized', async () => {
    process.env.ACCOUNT_PAGE_URL = ' https://dashboard.example.com ';
    expect(await (await GET()).json()).toEqual({ url: 'https://dashboard.example.com/' });
  });

  it.each(['dashboard.example.com', 'javascript:alert(1)', 'ftp://x', ''])('answers null for %j', async (value) => {
    process.env.ACCOUNT_PAGE_URL = value;
    expect(await (await GET()).json()).toEqual({ url: null });
  });
});
