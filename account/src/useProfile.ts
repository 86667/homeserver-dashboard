import { useEffect, useState } from 'react';
import type { HomeserverClient } from './homeserver-client';
import type { Profile } from './model';

export type ProfileState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; profile: Profile | null }
  | { status: 'failed'; message: string };

/** A person's pubky.app profile on this homeserver, if they have one. Idle until there is a client and a pubky. */
export function useProfile(client: HomeserverClient | null, pubky: string | null): ProfileState {
  const [state, setState] = useState<ProfileState>({ status: 'idle' });

  useEffect(() => {
    if (!client || !pubky) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    client
      .profile(pubky)
      .then((profile) => {
        if (!cancelled) setState({ status: 'done', profile });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [client, pubky]);

  return state;
}
