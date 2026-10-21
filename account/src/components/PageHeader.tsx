'use client';

import { LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PageHeaderProps {
  /** The signed-in person's pubky, to offer signing out; null when nobody is. */
  signedIn: string | null;
  onSignOut: () => void;
  /** Starts a sign-in with Ring; null when none can start right now (connecting, or one is under way). */
  onSignIn: (() => void) | null;
}

const PILL =
  'h-10 shrink-0 gap-2 rounded-full border border-[#303034] bg-[#FFFFFF0B] px-4 text-foreground backdrop-blur-xl hover:bg-white/8';

/** The page's top bar, laid out like the admin dashboard's: logo, tagline, and a sign-in or sign-out pill. */
export function PageHeader({ signedIn, onSignOut, onSignIn }: PageHeaderProps) {
  return (
    <header className="w-full bg-background pt-4 pb-2 sm:pt-5 sm:pb-3">
      <nav className="flex w-full min-w-0 items-center justify-between gap-4 sm:gap-6">
        <div className="flex min-w-0 shrink-0 items-center">
          <img
            src="/PubkyHomeserver.svg"
            alt="Pubky Homeserver"
            className="h-8 w-auto sm:h-9"
            width={262}
            height={36}
          />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-8 sm:gap-10">
          <p className="hidden truncate text-sm text-muted-foreground md:max-w-xs lg:inline lg:max-w-sm">
            Your account on this homeserver
          </p>
          {signedIn ? (
            <Button
              variant="outline"
              className={PILL}
              title={`Signed in as pubky${signedIn}`}
              onClick={onSignOut}
              data-testid="sign-out"
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          ) : (
            onSignIn && (
              <Button variant="outline" className={PILL} onClick={onSignIn} data-testid="header-signin">
                <LogIn className="size-4" />
                Sign in
              </Button>
            )
          )}
        </div>
      </nav>
    </header>
  );
}
