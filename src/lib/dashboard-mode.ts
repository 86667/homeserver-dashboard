/**
 * Which side of the dashboard this instance serves, from DASHBOARD_MODE:
 *
 * - unset or `all`: both (one instance for everything, e.g. local development);
 * - `admin`: the admin dashboard only;
 * - `account`: the public account page only, for an instance reachable from
 *   the internet. Everything admin answers 404, so it cannot be served even if
 *   admin credentials are set by mistake.
 *
 * Any other value closes the instance (503 everywhere): a typo on the public
 * instance must never fall back to serving the admin side.
 */
export type DashboardMode = 'all' | 'admin' | 'account' | 'invalid';

export function parseDashboardMode(raw: string | undefined): DashboardMode {
  const value = raw?.trim().toLowerCase();
  if (!value || value === 'all') return 'all';
  if (value === 'admin' || value === 'account') return value;
  return 'invalid';
}

/** What to do with a request: serve it, send it to the account page, or refuse it. */
export type Routing = 'serve' | 'to-account' | 'not-found' | 'closed';

const ACCOUNT_PAGE = '/account';
/** The liveness probe every deployment's health check uses. */
const HEALTH_CHECK = '/api/health';

const isAccountPath = (pathname: string) => pathname === ACCOUNT_PAGE || pathname.startsWith(`${ACCOUNT_PAGE}/`);

/** Routing for a page or API request (static assets are not asked about). */
export function routeFor(mode: DashboardMode, pathname: string): Routing {
  switch (mode) {
    case 'all':
      return 'serve';
    case 'invalid':
      return 'closed';
    case 'admin':
      return isAccountPath(pathname) ? 'not-found' : 'serve';
    case 'account':
      if (isAccountPath(pathname) || pathname === HEALTH_CHECK) return 'serve';
      return pathname === '/' ? 'to-account' : 'not-found';
  }
}
