'use client';

import type { ReactNode } from 'react';
import { Activity, Server, UserRound } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AccountConfig } from '../model';
import { PUBKY_RING_URL } from '@/lib/pubky-ring';
import { AccountTab } from './AccountTab';
import { ActivityTab } from './ActivityTab';
import { HomeserverTab } from './HomeserverTab';
import { useAccountFlow } from '../useAccountFlow';
import { useProfile } from '../useProfile';
import { usePublicFiles } from '../usePublicFiles';

interface AccountFlowProps {
  /** null: the page is not set up (no usable homeserver key configured). */
  config: AccountConfig | null;
  /** The invite code from the page's link, if any. */
  initialCode: string;
}

/**
 * The public page of a homeserver, in three tabs: the visitor's account
 * (sign up or sign in with Pubky Ring, then what they have here), the
 * homeserver's public activity, and facts about the homeserver. Nothing is
 * stored; reloading signs out.
 */
export function AccountFlow({ config, initialCode }: AccountFlowProps) {
  return (
    <AccountPage>
      {config ? <ConnectedTabs config={config} initialCode={initialCode} /> : <PageTabs account={<NotSetUp />} />}
    </AccountPage>
  );
}

/** Holds the sign-in and what was loaded for it, so switching tabs keeps both. */
function ConnectedTabs({ config, initialCode }: { config: AccountConfig; initialCode: string }) {
  const flow = useAccountFlow(config, initialCode);
  const signedIn = flow.step.name === 'done' && flow.step.info.hasAccount ? flow.step.info.pubky : null;
  const files = usePublicFiles(flow.client, signedIn);
  const profile = useProfile(flow.client, signedIn);
  return <PageTabs account={<AccountTab flow={flow} files={files} profile={profile} />} />;
}

function PageTabs({ account }: { account: ReactNode }) {
  return (
    <Tabs defaultValue="account" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="account" className="gap-2 text-xs sm:text-sm [&_svg]:size-4" data-testid="tab-account">
          <UserRound className="shrink-0" />
          Account
        </TabsTrigger>
        <TabsTrigger value="activity" className="gap-2 text-xs sm:text-sm [&_svg]:size-4" data-testid="tab-activity">
          <Activity className="shrink-0" />
          Activity
        </TabsTrigger>
        <TabsTrigger
          value="homeserver"
          className="gap-2 text-xs sm:text-sm [&_svg]:size-4"
          data-testid="tab-homeserver"
        >
          <Server className="shrink-0" />
          Homeserver
        </TabsTrigger>
      </TabsList>
      <TabsContent value="account" className="space-y-4">
        {account}
      </TabsContent>
      <TabsContent value="activity" className="space-y-4">
        <ActivityTab />
      </TabsContent>
      <TabsContent value="homeserver" className="space-y-4">
        <HomeserverTab />
      </TabsContent>
    </Tabs>
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

/** The page around the tabs: logo and footer links. */
function AccountPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <header className="pt-4 sm:pt-5">
          <img
            src="/PubkyHomeserver.svg"
            alt="Pubky Homeserver"
            className="h-8 w-auto sm:h-9"
            width={262}
            height={36}
          />
        </header>

        {children}

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
