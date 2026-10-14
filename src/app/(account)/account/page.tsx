import { Suspense } from 'react';
import { AccountFlow } from '@/features/account';
import { readAccountConfig } from '@/features/account/server';

// The config comes from the environment at request time, not at build time:
// one image serves every homeserver.
export const dynamic = 'force-dynamic';

/**
 * The public account page. It has no server side beyond reading its config:
 * the visitor's browser talks to the homeserver's public API itself.
 */
export default function AccountPage() {
  // useSearchParams (the ?token= invite code) needs a Suspense boundary.
  return (
    <Suspense>
      <AccountFlow config={readAccountConfig()} />
    </Suspense>
  );
}
