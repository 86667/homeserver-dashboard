import type { ReactNode } from 'react';
import '../globals.css';

export const metadata = {
  title: 'Your account',
  description: 'Sign up on this homeserver with Pubky Ring, or sign in to your account',
  icons: {
    icon: '/pubky-favicon.svg',
  },
};

/**
 * Root layout of the public side (the account page). Separate from the admin
 * side's root layout on purpose: it carries none of the admin providers.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
