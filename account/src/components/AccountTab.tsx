'use client';

import { UserRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { useAccountFlow } from '../useAccountFlow';
import type { ProfileState } from '../useProfile';
import type { PublicFiles } from '../usePublicFiles';
import { describeOutcome } from '../outcome';
import { AccountDetails } from './AccountDetails';
import { ErrorPanel } from './ErrorPanel';
import { FilesCard } from './FilesCard';
import { ProfileCard } from './ProfileCard';
import { StartStep } from './StartStep';
import { WaitingStep } from './WaitingStep';

interface AccountTabProps {
  flow: ReturnType<typeof useAccountFlow>;
  files: PublicFiles;
  profile: ProfileState;
}

/** The account tab: the sign-up/sign-in card, and once signed in, the person's profile and files. */
export function AccountTab({ flow, files, profile }: AccountTabProps) {
  const signedIn = flow.step.name === 'done' && flow.step.info.hasAccount;
  return (
    <>
      <Card data-testid="account">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <UserRound className="size-5" />
            Your account
          </CardTitle>
          <CardDescription>
            Create a Pubky account on this homeserver, or sign in to yours. Your keys stay in Pubky Ring on your phone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Steps flow={flow} />
        </CardContent>
      </Card>
      {signedIn && <ProfileCard state={profile} />}
      {signedIn && <FilesCard state={files} />}
    </>
  );
}

function Steps({ flow }: { flow: ReturnType<typeof useAccountFlow> }) {
  const { step, invite, inviteRequired, canSignUp, start, backToStart, retryConnect } = flow;
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
