'use client';

import { Check, CircleCheckBig, Copy, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';
import type { Outcome } from '../outcome';

interface AccountDetailsProps {
  outcome: Outcome;
  /** The pubky that approved, z-base-32. */
  pubky: string;
  onSignOut: () => void;
}

/** The signed-in person's account on this homeserver, or why there is none. */
export function AccountDetails({ outcome, pubky: key, onSignOut }: AccountDetailsProps) {
  const { copiedKey, copy } = useCopyFeedback();
  const pubky = `pubky${key}`;

  if (!outcome.hasAccount) {
    return (
      <div className="space-y-4" data-testid="account-missing">
        <Alert variant="destructive">
          <AlertTitle>{outcome.title}</AlertTitle>
          <AlertDescription className="text-xs">
            <p>{outcome.text}</p>
            <p className="mt-2 font-mono break-all">{pubky}</p>
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
            onClick={() => void copy(pubky)}
            title={copiedKey ? 'Copied' : 'Copy pubky'}
            aria-label={copiedKey ? 'Copied pubky' : 'Copy pubky'}
          >
            {copiedKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Keep your recovery phrase safe in Pubky Ring. It is the only way back into this account; the homeserver cannot
        recover it for you.
      </p>

      <Button variant="outline" onClick={onSignOut} className="w-full">
        Sign out
      </Button>
    </div>
  );
}
