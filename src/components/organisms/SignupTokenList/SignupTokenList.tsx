'use client';

import { useState } from 'react';
import { Check, Copy, Link2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSignupTokens } from '@/hooks/admin';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';
import { formatUtcTimestamp, shortPubky } from '@/lib/format';
import { inviteLink } from '@/lib/invite-link';
import { cn } from '@/lib/utils';
import type { SignupToken } from '@/services/admin/admin.types';

export interface SignupTokenListProps {
  /** The public account page (ACCOUNT_PAGE_URL); with it, unused codes get a "copy sign-up link" action. */
  accountPageUrl: string | null;
  /** Bump to reload, e.g. after an invite was created. */
  refreshKey?: number;
}

type Filter = 'unused' | 'used';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'unused', label: 'Unused' },
  { value: 'used', label: 'Used' },
];

/**
 * Every invite code the homeserver has issued, unused or used, read from the
 * admin `GET /signup_tokens` (pubky-homeserver 0.14+). Used codes name the
 * pubky that signed up with them: on a homeserver that requires codes, that
 * is the list of who joined.
 */
export function SignupTokenList({ accountPageUrl, refreshKey = 0 }: SignupTokenListProps) {
  const [filter, setFilter] = useState<Filter>('unused');
  const { items, nextCursor, isLoading, isLoadingMore, error, refetch, loadMore } = useSignupTokens(filter, refreshKey);
  const { copiedKey, copy } = useCopyFeedback();

  const copyButton = (value: string, key: string, label: string, icon: 'copy' | 'link') => (
    <Button
      variant={copiedKey === key ? 'secondary' : 'ghost'}
      size="icon"
      className="h-8 w-8 shrink-0"
      onClick={() => void copy(value, key)}
      title={copiedKey === key ? 'Copied' : label}
      aria-label={copiedKey === key ? `Copied: ${label}` : label}
    >
      {copiedKey === key ? (
        <Check className="h-4 w-4" />
      ) : icon === 'link' ? (
        <Link2 className="h-4 w-4" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );

  const row = (item: SignupToken) => (
    <div
      key={item.token}
      className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="signup-token-row"
    >
      <div className="min-w-0 flex-1">
        <code className="font-mono text-sm">{item.token}</code>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {item.used_at ? (
            <>
              Used {formatUtcTimestamp(item.used_at)}
              {item.used_by && (
                <>
                  {' '}
                  by{' '}
                  <code className="font-mono" title={item.used_by}>
                    {shortPubky(item.used_by)}
                  </code>
                </>
              )}
            </>
          ) : (
            <>Created {formatUtcTimestamp(item.created_at)}</>
          )}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {item.used_by ? (
          copyButton(item.used_by, `pubky-${item.token}`, 'Copy pubky', 'copy')
        ) : (
          <>
            {copyButton(item.token, `code-${item.token}`, 'Copy code', 'copy')}
            {accountPageUrl &&
              copyButton(inviteLink(accountPageUrl, item.token), `link-${item.token}`, 'Copy sign-up link', 'link')}
          </>
        )}
      </div>
    </div>
  );

  return (
    <Card data-testid="signup-token-list">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">Invite codes</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Every code this homeserver has issued. Unused codes can still be shared; used ones show who signed up.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isLoading}
            title="Refresh"
            aria-label="Refresh invite codes"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>

      <div className="mx-6 h-px bg-border/60" />

      <CardContent className="space-y-4 pt-4">
        <div className="flex gap-2" role="group" aria-label="Show codes">
          {FILTERS.map(({ value, label }) => (
            <Button
              key={value}
              variant={filter === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
            >
              {label}
            </Button>
          ))}
        </div>

        {filter === 'unused' && !accountPageUrl && (
          <p className="text-xs text-muted-foreground/70" data-testid="account-page-hint">
            To hand out sign-up links instead of bare codes, set <code>ACCOUNT_PAGE_URL</code> to the public address of
            the account page.
          </p>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not load invite codes</AlertTitle>
            <AlertDescription className="text-xs">{error.message}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : items.length === 0 && !error ? (
          <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            {filter === 'unused' ? 'No unused codes.' : 'No code has been used yet.'}
          </p>
        ) : (
          <div className="space-y-2">{items.map(row)}</div>
        )}

        {nextCursor && !isLoading && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
            className="w-full sm:w-auto"
          >
            {isLoadingMore ? 'Loading...' : 'Load more'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
