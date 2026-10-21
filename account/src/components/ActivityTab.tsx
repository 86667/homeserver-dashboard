'use client';

import { Activity as ActivityIcon, FileMinus, FilePen, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Burst } from '../activity';
import { formatDateTime, shortPubky } from '../format';
import type { FeedEvent } from '../model';
import type { Activity } from '../useActivity';
import type { OwnActivity } from '../useOwnActivity';
import { Avatar } from './Avatar';

interface ActivityTabProps {
  /** The signed-in account holder's pubky; null shows the sign-in prompt instead. */
  you: string | null;
  own: OwnActivity;
  everyone: Activity;
  /** Whether the homeserver-wide view was asked for. */
  showAll: boolean;
  onShowAll: () => void;
  onGoToAccount: () => void;
  /** The page is not set up: nothing can be shown. */
  notSetUp?: React.ReactNode;
}

/** A signed-in person's own recent changes, and on request everyone's. */
export function ActivityTab({ you, own, everyone, showAll, onShowAll, onGoToAccount, notSetUp }: ActivityTabProps) {
  if (notSetUp || !you) {
    return (
      <Card data-testid="activity-tab">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ActivityIcon className="size-5" />
            Activity
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Your recent changes on this homeserver, and what everyone else has been up to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notSetUp ?? (
            <div className="space-y-3" data-testid="activity-signin">
              <p className="text-sm text-muted-foreground">Sign in with Pubky Ring to see activity.</p>
              <Button variant="outline" onClick={onGoToAccount}>
                Go to Account
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      <Card data-testid="activity-tab">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ActivityIcon className="size-5" />
            Your activity
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Your newest public changes on this homeserver, from its event feed: files written and removed. Private files
            never appear in it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OwnBody own={own} />
        </CardContent>
      </Card>
      <Card data-testid="activity-everyone">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Users className="size-5" />
            Everyone&apos;s activity
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            What people are doing here: public files written and removed, by whom and in which app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showAll ? (
            <EveryoneBody activity={everyone} you={you} />
          ) : (
            <Button variant="outline" onClick={onShowAll} data-testid="activity-show-all">
              See all activity
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function OwnBody({ own }: { own: OwnActivity }) {
  if (own.status === 'idle' || own.status === 'loading') {
    return (
      <div className="space-y-2" data-testid="own-loading">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }
  if (own.status === 'failed') {
    return (
      <p className="text-xs text-muted-foreground" data-testid="own-failed">
        Your activity could not be read: {own.message}
      </p>
    );
  }
  if (own.events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="own-none">
        Nothing yet. Your first public file will show up here.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-lg border text-xs" data-testid="own-events">
        {own.events.map((event, index) => (
          <EventRow key={`${index}-${event.url}`} event={event} />
        ))}
      </ul>
      {own.message && <p className="text-xs text-muted-foreground">Could not load more: {own.message}</p>}
      {own.more && (
        <Button variant="outline" size="sm" onClick={own.loadMore} disabled={own.loadingMore} data-testid="own-more">
          {own.loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}

function EventRow({ event }: { event: FeedEvent }) {
  const Icon = event.kind === 'PUT' ? FilePen : FileMinus;
  return (
    <li className="flex items-center gap-3 px-3 py-1.5">
      <Icon
        className="size-3 shrink-0 text-muted-foreground"
        aria-label={event.kind === 'PUT' ? 'written' : 'removed'}
      />
      <span className="w-24 shrink-0 truncate text-muted-foreground" title={event.app}>
        {event.app || '(top level)'}
      </span>
      <code className="min-w-0 flex-1 truncate font-mono" title={event.path}>
        {event.app ? event.path.slice(event.app.length + 1) : event.path}
      </code>
    </li>
  );
}

function EveryoneBody({ activity, you }: { activity: Activity; you: string }) {
  const { feed, bursts, people, apps, profiles, refresh } = activity;
  if (feed.status === 'idle' || feed.status === 'loading') {
    return (
      <div className="space-y-2" data-testid="activity-loading">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (feed.status === 'failed') {
    return (
      <p className="text-xs text-muted-foreground" data-testid="activity-failed">
        The activity could not be read: {feed.message}
      </p>
    );
  }
  if (feed.events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="activity-none">
        Nothing has happened here yet. The first public file someone writes will show up here.
      </p>
    );
  }
  const nameOf = (pubky: string) => profiles[pubky]?.name ?? shortPubky(pubky);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3" data-testid="activity-summary">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold tabular-nums">{feed.events.length}</span>
          <span className="text-xs text-muted-foreground">
            {feed.total === null
              ? 'most recent changes'
              : feed.total === feed.events.length
                ? 'changes, all there are'
                : `of ${feed.total} changes`}{' '}
            · {people.length} {people.length === 1 ? 'person' : 'people'} · {apps.length}{' '}
            {apps.length === 1 ? 'app' : 'apps'}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          Read {formatDateTime(feed.checkedAt)}.
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5"
            onClick={refresh}
            aria-label="Read again"
            data-testid="activity-refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </p>
      </div>

      <ul className="flex flex-wrap gap-2" data-testid="activity-people" aria-label="People active recently">
        {people.map(({ pubky, changes }) => (
          <li
            key={pubky}
            className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs ${pubky === you ? 'border-brand bg-brand/16' : ''}`}
            title={pubky}
          >
            <Avatar image={null} name={nameOf(pubky)} className="size-6 text-xs" />
            <span className="max-w-40 truncate font-medium">{nameOf(pubky)}</span>
            {pubky === you && <span className="text-brand">you</span>}
            <span className="text-muted-foreground tabular-nums">{changes}</span>
          </li>
        ))}
      </ul>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" data-testid="activity-apps">
        {apps.map(({ app, changes }) => (
          <li key={app}>
            <span className="font-medium text-foreground">{app || '(top level)'}</span> {changes}
          </li>
        ))}
      </ul>

      <ul className="space-y-2" data-testid="activity-bursts">
        {bursts.map((burst) => (
          <li key={burst.id}>
            <BurstRow burst={burst} name={nameOf(burst.pubky)} you={burst.pubky === you} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BurstRow({ burst, name, you }: { burst: Burst; name: string; you: boolean }) {
  return (
    <details className={`group rounded-lg border ${you ? 'border-brand' : ''}`}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm select-none [&::-webkit-details-marker]:hidden">
        <Avatar image={null} name={name} className="size-7 text-xs" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium" title={burst.pubky}>
            {name}
          </span>
          <span className="text-muted-foreground"> in {burst.app || 'the top level'}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {burst.written > 0 && (
            <span className="inline-flex items-center gap-0.5" title={`${burst.written} written`}>
              <FilePen className="size-3" /> {burst.written}
            </span>
          )}
          {burst.written > 0 && burst.removed > 0 && ' '}
          {burst.removed > 0 && (
            <span className="inline-flex items-center gap-0.5" title={`${burst.removed} removed`}>
              <FileMinus className="size-3" /> {burst.removed}
            </span>
          )}
        </span>
      </summary>
      <ul className="max-h-72 divide-y overflow-y-auto border-t text-xs">
        {burst.events.map((event, index) => (
          <li key={`${index}-${event.url}`} className="flex items-center gap-3 px-3 py-1.5">
            {event.kind === 'PUT' ? (
              <FilePen className="size-3 shrink-0 text-muted-foreground" aria-label="written" />
            ) : (
              <FileMinus className="size-3 shrink-0 text-muted-foreground" aria-label="removed" />
            )}
            <code className="min-w-0 flex-1 truncate font-mono" title={event.path}>
              {burst.app ? event.path.slice(burst.app.length + 1) : event.path}
            </code>
          </li>
        ))}
      </ul>
    </details>
  );
}
