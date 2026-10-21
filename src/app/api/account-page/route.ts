import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/server/auth/guard';

export const dynamic = 'force-dynamic';

/** ACCOUNT_PAGE_URL when it is an absolute http(s) URL, else null. */
function accountPageUrl(): string | null {
  const raw = process.env.ACCOUNT_PAGE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/account-page - the public address of the account page, for
 * building invite links. Only the operator knows it: the dashboard itself is
 * reached through a tunnel or the Umbrel UI, so its own origin is not the
 * address to hand out. `url` is null when ACCOUNT_PAGE_URL is not set.
 */
async function handleGet() {
  return NextResponse.json({ url: accountPageUrl() }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withAdminAuth(handleGet);
