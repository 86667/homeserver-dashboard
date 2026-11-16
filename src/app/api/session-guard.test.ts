// @vitest-environment node
import { readdirSync } from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Every API route must sit behind withSession except these: the liveness
// probe and the routes people sign in through, which check for themselves. A
// new route that forgets withSession fails here instead of shipping open.
const PUBLIC_ROUTES = new Set([
  'health/route.ts',
  'auth/login/route.ts',
  'auth/ring/challenge/route.ts',
  'auth/ring/login/route.ts',
  'auth/ring/session/route.ts',
]);
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
const ROUTE_FILE = /(^|\/)route\.[cm]?[jt]sx?$/;

// Every route handler in the app, whatever its extension, relative to src/app.
const appDir = path.resolve('src/app');
const allRouteFiles = readdirSync(appDir, { recursive: true, encoding: 'utf8' })
  .map((file) => file.split(path.sep).join('/'))
  .filter((file) => ROUTE_FILE.test(file));
const routeFiles = allRouteFiles
  .filter((file) => file.startsWith('api/'))
  .map((file) => file.slice('api/'.length))
  .filter((file) => !PUBLIC_ROUTES.has(file));

type Handler = (request: NextRequest, context: unknown) => Promise<Response>;

// Any well-formed pubky: nobody signs in during this test.
const PUBKY = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo';

/** Each gate on its own, then both: a route must refuse a request that carries no session under every one. */
describe.each([
  ['the dashboard password', { DASHBOARD_PASSWORD: 'secret' }],
  ['admin sign-in with Pubky Ring', { ADMIN_PUBKEYS: PUBKY }],
  ['both', { DASHBOARD_PASSWORD: 'secret', ADMIN_PUBKEYS: PUBKY }],
])('session guard with %s', (_gate, env) => {
  beforeAll(() => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('finds the routes, all of them under /api', () => {
    expect(routeFiles.length).toBeGreaterThan(10);
    expect(allRouteFiles.filter((file) => !file.startsWith('api/'))).toEqual([]);
  });

  it.each(routeFiles)('%s answers 401 without a session', async (file) => {
    const mod = (await import(`./${file.replace(/\.[cm]?[jt]sx?$/, '')}`)) as Record<string, unknown>;
    const handlers = METHODS.filter((method) => typeof mod[method] === 'function');
    expect(handlers.length).toBeGreaterThan(0);
    for (const method of handlers) {
      const request = new NextRequest(`http://localhost:8080/api/${path.dirname(file)}`, { method });
      const response = await (mod[method] as Handler)(request, { params: Promise.resolve({ path: [] }) });
      expect(response.status, `${method} ${file}`).toBe(401);
    }
  });
});
