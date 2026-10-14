import { describe, expect, it } from 'vitest';
import { parseDashboardMode, routeFor } from './dashboard-mode';

describe('parseDashboardMode', () => {
  it.each([
    [undefined, 'all'],
    ['', 'all'],
    ['all', 'all'],
    ['admin', 'admin'],
    [' Account ', 'account'],
    ['acount', 'invalid'],
    ['public', 'invalid'],
  ] as const)('%j -> %s', (raw, mode) => {
    expect(parseDashboardMode(raw)).toBe(mode);
  });
});

describe('routeFor', () => {
  it('serves everything in all mode', () => {
    for (const path of ['/', '/dashboard', '/account', '/api/admin/info']) expect(routeFor('all', path)).toBe('serve');
  });

  it('keeps the account page off an admin instance', () => {
    expect(routeFor('admin', '/dashboard')).toBe('serve');
    expect(routeFor('admin', '/api/admin/info')).toBe('serve');
    expect(routeFor('admin', '/account')).toBe('not-found');
    expect(routeFor('admin', '/account/x')).toBe('not-found');
    expect(routeFor('admin', '/accounts')).toBe('serve');
  });

  it('serves only the account page and the health check on an account instance', () => {
    expect(routeFor('account', '/account')).toBe('serve');
    expect(routeFor('account', '/api/health')).toBe('serve');
    expect(routeFor('account', '/')).toBe('to-account');
    for (const path of [
      '/dashboard',
      '/cloudflare-guide',
      '/api/admin/info',
      '/api/server-config',
      '/accounts',
      '/api/health/x',
    ]) {
      expect(routeFor('account', path)).toBe('not-found');
    }
  });

  it('closes an instance with an unknown mode', () => {
    expect(routeFor('invalid', '/account')).toBe('closed');
    expect(routeFor('invalid', '/api/health')).toBe('closed');
  });
});
