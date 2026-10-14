'use client';

import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserRound } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AccountConfig } from '@/lib/account';
import { PUBKY_RING_URL } from '@/lib/pubky-ring';
import { AccountDetails } from './AccountDetails';
import { ErrorPanel } from './ErrorPanel';
import { describeOutcome } from './outcome';
import { StartStep } from './StartStep';
import { useAccountFlow } from './useAccountFlow';
import { WaitingStep } from './WaitingStep';

/**
 * The public account page: sign up on this homeserver with Pubky Ring and an
 * invite code (from `?token=` or typed in), or sign in to an existing
 * account. Nothing is stored; reloading signs out. `config` null: the page is
 * not set up (no homeserver key configured).
 */
export function AccountFlow({ config }: { config: AccountConfig | null }) {
  return <AccountPage>{config ? <Flow config={config} /> : <NotSetUp />}</AccountPage>;
}

function Flow({ config }: { config: AccountConfig }) {
  const searchParams = useSearchParams();
  const { step, invite, inviteRequired, canSignUp, start, backToStart, retryConnect } = useAccountFlow(
    config,
    searchParams.get('token') ?? '',
  );

  switch (step.name) {
    case 'connecting':
    case 'checking':
      return <Busy text={step.name === 'checking' ? 'Looking up your account…' : 'Connecting to the homeserver…'} />;
    case 'unavailable':
      return (
        <ErrorPanel
          title="The homeserver cannot be reached right now"
          message={step.message}
          onRetry={() => void retryConnect()}
          testId="account-unavailable"
        />
      );
    case 'start':
      return (
        <StartStep
          inviteRequired={inviteRequired}
          code={invite.code}
          codeState={invite.state}
          canSignUp={canSignUp}
          onCodeChange={invite.setCode}
          onSignUp={() => void start('signup')}
          onSignIn={() => void start('signin')}
        />
      );
    case 'waiting':
      return <WaitingStep kind={step.kind} authUrl={step.authUrl} onCancel={backToStart} />;
    case 'done':
      return (
        <AccountDetails
          outcome={describeOutcome(step.kind, step.info, step.inviteStatus)}
          pubky={step.info.pubky}
          onSignOut={backToStart}
        />
      );
    case 'failed':
      return (
        <ErrorPanel title="Something went wrong" message={step.message} onRetry={backToStart} testId="account-failed" />
      );
  }
}

function Busy({ text }: { text: string }) {
  return (
    <div className="space-y-3" data-testid="account-busy">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-9 w-full" />
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

function NotSetUp() {
  return (
    <Alert data-testid="account-not-set-up">
      <AlertTitle>This page is not set up yet</AlertTitle>
      <AlertDescription className="text-xs">
        The operator of this homeserver has not configured it. Check back later.
      </AlertDescription>
    </Alert>
  );
}

/** The page around the flow: logo, card and footer links. */
function AccountPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <header className="pt-4 sm:pt-5">
          <img
            src="/PubkyHomeserver.svg"
            alt="Pubky Homeserver"
            className="h-8 w-auto sm:h-9"
            width={262}
            height={36}
          />
        </header>

        <Card data-testid="account">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <UserRound className="size-5" />
              Your account
            </CardTitle>
            <CardDescription>
              Create a Pubky account on this homeserver, or sign in to yours. Your keys stay in Pubky Ring on your
              phone.
            </CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>

        <footer className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <a
            href="https://pubky.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            What is Pubky?
          </a>
          <a
            href={PUBKY_RING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Get Pubky Ring
          </a>
        </footer>
      </main>
    </div>
  );
}
