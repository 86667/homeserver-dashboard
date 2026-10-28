'use client';

import type { ReactNode } from 'react';
import { Check, CircleCheckBig, Copy, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';
import { describeStorage, limitRows } from '../account';
import { formatDate } from '../format';
import type { AccountInfo, AccountRecord } from '../model';
import type { Outcome } from '../outcome';

interface AccountDetailsProps {
  outcome: Outcome;
  /** Who approved, and what the homeserver says about their account. */
  info: AccountInfo;
  /** Offered as "Try again" when there is no account; the page's header has the sign-out. */
  onSignOut: () => void;
}

/** The signed-in person's account on this homeserver, or why there is none. */
export function AccountDetails({ outcome, info, onSignOut }: AccountDetailsProps) {
  const { copiedKey, copy } = useCopyFeedback();
  const pubky = info.pubky === null ? null : `pubky${info.pubky}`;

  if (!outcome.hasAccount) {
    return (
      <div className="space-y-4" data-testid="account-missing">
        <Alert variant="destructive">
          <AlertTitle>{outcome.title}</AlertTitle>
          <AlertDescription className="text-xs">
            <p>{outcome.text}</p>
            {pubky && <p className="mt-2 font-mono break-all">{pubky}</p>}
          </AlertDescription>
        </Alert>
        <Button onClick={onSignOut} className="w-full">
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="account-details">
      <div className="rounded-lg border border-brand bg-brand/16 p-4">
        <div className="flex items-start gap-2">
          <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{outcome.title}</p>
            <p className="text-xs text-muted-foreground">{outcome.text}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="text-xs text-muted-foreground">Your pubky</div>
        <div className="mt-1 flex items-start gap-2">
          <code className="min-w-0 flex-1 font-mono text-sm break-all" data-testid="account-pubky">
            {pubky}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => void copy(pubky ?? '')}
            title={copiedKey ? 'Copied' : 'Copy pubky'}
            aria-label={copiedKey ? 'Copied pubky' : 'Copy pubky'}
          >
            {copiedKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {info.hasAccount && info.account ? (
        <AccountSummary account={info.account} />
      ) : info.hasAccount && info.partialGrant ? (
        <p className="text-xs text-muted-foreground/70" data-testid="account-partial-grant">
          You granted this page less than reading all your data in Ring, so the homeserver was not asked about your
          storage use and limits: it reports them only to a grant that reads everything.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground/70" data-testid="account-not-reported">
          This homeserver does not report your storage use and limits yet.
        </p>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Keep your recovery phrase safe in Pubky Ring. It is the only way back into this account; the homeserver cannot
        recover it for you.
      </p>
    </div>
  );
}

/** What the homeserver reports about the account: standing, signup date, storage against the allowance, limits. */
function AccountSummary({ account }: { account: AccountRecord }) {
  const storage = describeStorage(account.usedBytes, account.quota.effective.storageQuotaMb);
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3" data-testid="account-summary">
      {account.disabled && (
        <Alert variant="destructive" data-testid="account-disabled">
          <AlertTitle>Your account is disabled</AlertTitle>
          <AlertDescription className="text-xs">
            You can read and delete your files, but not write. Ask whoever runs this homeserver why.
          </AlertDescription>
        </Alert>
      )}
      <Row label="Signed up">{account.createdAt ? formatDate(account.createdAt) : 'Unknown'}</Row>
      <div className="space-y-1.5">
        <Row label="Storage">
          <span data-testid="account-storage">{storage.text}</span>
        </Row>
        {storage.share !== null && (
          <div className="h-1 w-full overflow-hidden rounded bg-muted" aria-hidden>
            <div
              className={cn('h-full rounded', storage.share >= 90 ? 'bg-amber-400' : 'bg-brand')}
              style={{ width: `${storage.share}%` }}
            />
          </div>
        )}
      </div>
      {limitRows(account.quota).map((row) => (
        <Row key={row.label} label={row.label}>
          {row.text}
          {row.custom && (
            <Badge
              variant="outline"
              className="ml-2 text-[10px] font-normal"
              title="Set for this account in particular"
            >
              set for you
            </Badge>
          )}
        </Row>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs sm:text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right break-words text-foreground">{children}</span>
    </div>
  );
}
