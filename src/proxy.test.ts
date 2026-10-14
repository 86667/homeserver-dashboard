// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config, proxy } from './proxy';

afterEach(() => {
  vi.unstubAllEnvs();
});

const request = (path: string) => proxy(new NextRequest(`http://localhost:8080${path}`));

describe('proxy', () => {
  it('lets requests through without a mode', () => {
    expect(request('/dashboard').headers.get('x-middleware-next')).toBe('1');
  });

  it('on an account instance: 404s admin paths and sends / to the account page', () => {
    vi.stubEnv('DASHBOARD_MODE', 'account');
    expect(request('/api/admin/info').status).toBe(404);
    expect(request('/dashboard').status).toBe(404);
    const home = request('/');
    expect(home.status).toBe(307);
    expect(home.headers.get('location')).toBe('http://localhost:8080/account');
    expect(request('/account?token=ABCD-EFGH-JKMN').headers.get('x-middleware-next')).toBe('1');
  });

  it('closes on an unknown mode', () => {
    vi.stubEnv('DASHBOARD_MODE', 'acount');
    expect(request('/account').status).toBe(503);
  });

  it('leaves build assets and public files alone', () => {
    const [matcher] = config.matcher;
    const pattern = new RegExp(`^${matcher}$`);
    expect(pattern.test('/_next/static/chunks/main.js')).toBe(false);
    expect(pattern.test('/PubkyHomeserver.svg')).toBe(false);
    expect(pattern.test('/account')).toBe(true);
    expect(pattern.test('/api/admin/info')).toBe(true);
  });
});
