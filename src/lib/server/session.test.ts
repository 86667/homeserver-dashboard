// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newIdentity } from './auth/__fixtures__/ring';
import { ADMIN_SESSION_COOKIE } from './auth/session-cookie';
import { createSession, resetAuthStore } from './auth/store';
import { SESSION_COOKIE, hasValidSession, isPasswordCorrect, setSessionCookie, withSession } from './session';

function issuedCookie(): string {
  const response = new NextResponse(null);
  setSessionCookie(response);
  return response.cookies.get(SESSION_COOKIE)?.value ?? '';
}

function request(cookie?: string): NextRequest {
  return new NextRequest('http://localhost:8080/api/x', {
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  });
}

describe('session', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('without DASHBOARD_PASSWORD', () => {
    it('lets every request through and accepts no password', () => {
      vi.stubEnv('DASHBOARD_PASSWORD', '');
      expect(hasValidSession(undefined)).toBe(true);
      expect(isPasswordCorrect('')).toBe(false);
      expect(isPasswordCorrect('anything')).toBe(false);
    });

    it('sets no cookie', () => {
      vi.stubEnv('DASHBOARD_PASSWORD', '');
      expect(issuedCookie()).toBe('');
    });
  });

  describe('with DASHBOARD_PASSWORD', () => {
    it('checks the password', () => {
      vi.stubEnv('DASHBOARD_PASSWORD', 'secret');
      expect(isPasswordCorrect('secret')).toBe(true);
      expect(isPasswordCorrect('secre')).toBe(false);
      expect(isPasswordCorrect('')).toBe(false);
    });

    it('accepts only the cookie it issued', () => {
      vi.stubEnv('DASHBOARD_PASSWORD', 'secret');
      const cookie = issuedCookie();
      expect(cookie).not.toContain('secret');
      expect(hasValidSession(cookie)).toBe(true);
      expect(hasValidSession(undefined)).toBe(false);
      expect(hasValidSession('secret')).toBe(false);
      expect(hasValidSession(`${cookie}0`)).toBe(false);
    });

    it('issues an http-only, same-site cookie', () => {
      vi.stubEnv('DASHBOARD_PASSWORD', 'secret');
      const response = new NextResponse(null);
      setSessionCookie(response);
      const header = response.headers.get('set-cookie') ?? '';
      expect(header).toContain('HttpOnly');
      expect(header).toMatch(/SameSite=strict/i);
      expect(header).toContain('Path=/');
    });

    it('ends sessions when the password changes', () => {
      vi.stubEnv('DASHBOARD_PASSWORD', 'secret');
      const cookie = issuedCookie();
      vi.stubEnv('DASHBOARD_PASSWORD', 'rotated');
      expect(hasValidSession(cookie)).toBe(false);
    });
  });

  describe('withSession', () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    it('answers 401 without a valid session and skips the handler', async () => {
      vi.stubEnv('DASHBOARD_PASSWORD', 'secret');
      handler.mockClear();
      const response = await withSession(handler)(request('nope'));
      expect(response.status).toBe(401);
      expect((await response.json()).type).toBe('unauthorized');
      expect(handler).not.toHaveBeenCalled();
    });

    it('calls the handler with a valid session', async () => {
      vi.stubEnv('DASHBOARD_PASSWORD', 'secret');
      const response = await withSession(handler)(request(issuedCookie()));
      expect(response.status).toBe(200);
    });

    it('calls the handler when no password is configured', async () => {
      vi.stubEnv('DASHBOARD_PASSWORD', '');
      const response = await withSession(handler)(request());
      expect(response.status).toBe(200);
    });
  });

  describe('withSession with admin sign-in (ADMIN_PUBKEYS)', () => {
    const admin = newIdentity();
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    /** A request as the dashboard page's own script sends it, with the given cookies. */
    const pageRequest = (cookies: Record<string, string>) =>
      new NextRequest('http://dashboard.test/api/x', {
        headers: {
          host: 'dashboard.test',
          'x-dashboard-request': '1',
          cookie: Object.entries(cookies)
            .map(([name, value]) => `${name}=${value}`)
            .join('; '),
        },
      });

    beforeEach(() => {
      resetAuthStore();
      handler.mockClear();
      vi.stubEnv('ADMIN_PUBKEYS', admin.pubky);
    });

    it('asks for the admin session alone when no password is configured', async () => {
      vi.stubEnv('DASHBOARD_PASSWORD', '');
      expect((await withSession(handler)(pageRequest({}))).status).toBe(401);
      const signedIn = pageRequest({ [ADMIN_SESSION_COOKIE]: createSession(admin.publicKey) });
      expect((await withSession(handler)(signedIn)).status).toBe(200);
    });

    it('asks for both sessions when a password is configured too: either one alone is refused', async () => {
      vi.stubEnv('DASHBOARD_PASSWORD', 'secret');
      const password = issuedCookie();
      const adminSession = createSession(admin.publicKey);

      expect((await withSession(handler)(pageRequest({ [SESSION_COOKIE]: password }))).status).toBe(401);
      expect((await withSession(handler)(pageRequest({ [ADMIN_SESSION_COOKIE]: adminSession }))).status).toBe(401);
      expect(handler).not.toHaveBeenCalled();

      const both = pageRequest({ [SESSION_COOKIE]: password, [ADMIN_SESSION_COOKIE]: adminSession });
      expect((await withSession(handler)(both)).status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not take the password session for an admin session, or the other way round', async () => {
      vi.stubEnv('DASHBOARD_PASSWORD', 'secret');
      const swapped = pageRequest({
        [SESSION_COOKIE]: createSession(admin.publicKey),
        [ADMIN_SESSION_COOKIE]: issuedCookie(),
      });
      expect((await withSession(handler)(swapped)).status).toBe(401);
    });
  });
});
