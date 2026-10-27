'use client';

import { useEffect, useState } from 'react';
import { Ban, Check, Copy, RefreshCw, UserCog } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsers } from '@/hooks/admin';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';
import { formatBytes, formatStorageMb, formatUtcTimestamp, shortPubky } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AdminUser, UserListState, UserSort } from '@/services/admin/admin.types';

export interface UserListProps {
  /** How many accounts the homeserver reports in all, for the heading. */
  numUsers?: number;
  /** Bump to reload, e.g. after an account was disabled or enabled. */
  refreshKey?: number;
  /** Opens the account in the editor below. */
  onManage: (pubkey: string) => void;
}

const STATES: { value: UserListState; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
];

const SORTS: { value: UserSort; label: string }[] = [
  { value: 'created_at', label: 'Newest' },
  { value: 'used_bytes', label: 'Most storage' },
];

/** How much of the allowance an account uses, as "12 KB of 500 MB" or "12 KB, no limit". */
function usage(user: AdminUser): string {
  const limit = user.quota.effective.storage_quota_mb;
  if (limit === undefined || limit === 'unlimited') return `${formatBytes(user.used_bytes)}, no limit`;
  return `${formatBytes(user.used_bytes)} of ${formatStorageMb(limit)}`;
}

/** Percent of the allowance used, or null without a limit. */
function usedShare(user: AdminUser): number | null {
  const limit = user.quota.effective.storage_quota_mb;
  if (typeof limit !== 'number' || limit <= 0) return null;
  return Math.min(100, Math.round((user.used_bytes / (limit * 1024 * 1024)) * 100));
}

/**
 * Every account on the homeserver, from the admin `GET /users` (homeserver
 * 0.17+): who signed up when, how much they store against their allowance,
 * and whether they are disabled. Ten at a time in a box that scrolls.
 */
export function UserList({ numUsers, refreshKey = 0, onManage }: UserListProps) {
  const [state, setState] = useState<UserListState>('all');
  const [sortBy, setSortBy] = useState<UserSort>('created_at');
  const { items, nextCursor, isLoading, isLoadingMore, error, refetch, loadMore } = useUsers(state, sortBy, refreshKey);
  const { copiedKey, copy } = useCopyFeedback();
  const [filtered, setFiltered] = useState(false);
  useEffect(() => setFiltered(state !== 'all'), [state]);

  const row = (user: AdminUser) => {
    const share = usedShare(user);
    return (
      <div key={user.pubky} className="rounded-lg border bg-muted/40 p-3" data-testid="user-row">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-sm" title={user.pubky}>
                {shortPubky(user.pubky)}
              </code>
              {user.disabled && (
                <Badge variant="destructive" className="text-xs" data-testid="user-disabled">
                  <Ban className="mr-1 h-3 w-3" />
                  Disabled
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Signed up {formatUtcTimestamp(user.created_at)} · {usage(user)}
              {share !== null && ` (${share}%)`}
            </p>
            {share !== null && (
              <div className="mt-1.5 h-1 w-full max-w-xs overflow-hidden rounded bg-muted" aria-hidden>
                <div
                  className={cn('h-full rounded', share >= 90 ? 'bg-amber-400' : 'bg-brand')}
                  style={{ width: `${share}%` }}
                />
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant={copiedKey === user.pubky ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => void copy(user.pubky, user.pubky)}
              title={copiedKey === user.pubky ? 'Copied' : 'Copy pubky'}
              aria-label={copiedKey === user.pubky ? 'Copied pubky' : 'Copy pubky'}
            >
              {copiedKey === user.pubky ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onManage(user.pubky)} className="gap-1.5">
              <UserCog className="h-3.5 w-3.5" />
              Manage
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card data-testid="user-list">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">
              Users{typeof numUsers === 'number' ? ` (${numUsers})` : ''}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Every account on this homeserver, with what it stores against its allowance.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isLoading}
            title="Refresh"
            aria-label="Refresh users"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>

      <div className="mx-6 h-px bg-border/60" />

      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex gap-2" role="group" aria-label="Show accounts">
            {STATES.map(({ value, label }) => (
              <Button
                key={value}
                variant={state === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setState(value)}
                aria-pressed={state === value}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2" role="group" aria-label="Order">
            <span className="text-xs text-muted-foreground">Order:</span>
            {SORTS.map(({ value, label }) => (
              <Button
                key={value}
                variant={sortBy === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSortBy(value)}
                aria-pressed={sortBy === value}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not load users</AlertTitle>
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
            {filtered ? `No ${state} accounts.` : 'No accounts yet.'}
          </p>
        ) : (
          // About five rows tall; the rest scrolls, and "Load more" sits at the bottom of the scroll.
          <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1" data-testid="user-scroll">
            {items.map(row)}
            {nextCursor && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadMore()}
                disabled={isLoadingMore}
                className="w-full sm:w-auto"
                data-testid="user-more"
              >
                {isLoadingMore ? 'Loading...' : 'Load more'}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
