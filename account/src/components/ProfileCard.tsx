'use client';

import { ExternalLink, IdCard } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProfileState } from '../useProfile';

/** The person's pubky.app profile, read from their own public files on this homeserver. */
export function ProfileCard({ state }: { state: ProfileState }) {
  return (
    <Card data-testid="profile-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <IdCard className="size-5" />
          Your profile
        </CardTitle>
        <CardDescription>What pubky.app shows about you, as stored in your public files here.</CardDescription>
      </CardHeader>
      <CardContent>
        <ProfileBody state={state} />
      </CardContent>
    </Card>
  );
}

function ProfileBody({ state }: { state: ProfileState }) {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="flex items-center gap-4" data-testid="profile-loading">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }
  if (state.status === 'failed') {
    return (
      <p className="text-xs text-muted-foreground" data-testid="profile-failed">
        Your profile could not be read: {state.message}
      </p>
    );
  }
  if (!state.profile) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="profile-none">
        No pubky.app profile here yet. Sign in to pubky.app with this pubky and set one up; it will appear here.
      </p>
    );
  }
  const { name, bio, status, links, avatar } = state.profile;
  return (
    <div className="flex items-start gap-4">
      {avatar ? (
        <img src={avatar} alt="" className="size-14 shrink-0 rounded-full object-cover" data-testid="profile-avatar" />
      ) : (
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand/16 text-lg font-semibold text-brand"
          aria-hidden
        >
          {name.trim().charAt(0).toUpperCase() || '?'}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-base font-semibold break-words" data-testid="profile-name">
          {name}
        </p>
        {status && <p className="text-xs text-muted-foreground">{status}</p>}
        {bio && <p className="text-sm break-words whitespace-pre-line">{bio}</p>}
        {links.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
            {links.map((link) => (
              <li key={`${link.title}|${link.url}`}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline"
                >
                  {link.title}
                  <ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
