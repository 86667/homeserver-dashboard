import { NextRequest, NextResponse } from 'next/server';
import { parseDashboardMode, routeFor } from '@/lib/dashboard-mode';

/**
 * Keeps each instance to its side of the dashboard (DASHBOARD_MODE, see
 * src/lib/dashboard-mode.ts). Read per request, so one image serves every mode.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  switch (routeFor(parseDashboardMode(process.env.DASHBOARD_MODE), pathname)) {
    case 'serve':
      return NextResponse.next();
    case 'to-account':
      return NextResponse.redirect(new URL('/account', request.url));
    case 'not-found':
      return new NextResponse('Not Found', { status: 404 });
    case 'closed':
      return new NextResponse('DASHBOARD_MODE must be all, admin or account', { status: 503 });
  }
}

export const config = {
  // Build assets and files from public/ are the same for every mode.
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|ico|png|jpg|webp)$).*)'],
};
