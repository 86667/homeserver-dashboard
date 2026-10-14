import { Suspense } from 'react';
import { AccountFlow } from '@/components/organisms/AccountFlow';
import { readAccountConfig } from '@/lib/server/account-config';

export const metadata = {
  title: 'Your account',
  description: 'Sign up on this homeserver with Pubky Ring, or sign in to your account',
};

/**
 * The public account page. Unlike /dashboard it is meant to be reachable from
 * the internet. It has no server side beyond this config: the visitor's
 * browser talks to the homeserver's public API itself, never the admin API.
 */
export default function AccountPage() {
  // useSearchParams (the ?token= invite code) needs a Suspense boundary.
  return (
    <Suspense>
      <AccountFlow config={readAccountConfig()} />
    </Suspense>
  );
}
