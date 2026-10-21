import { useEffect, useState } from 'react';
import type { HomeserverClient } from './homeserver-client';
import type { HomeserverInfo, SignedRecord } from './model';

type Loaded<T> = { status: 'loading' } | { status: 'done'; value: T } | { status: 'failed'; message: string };

export type HomeserverState = {
  info: Loaded<HomeserverInfo>;
  /** null: the relay has no record for this key. */
  record: Loaded<SignedRecord | null>;
};

const LOADING = { status: 'loading' } as const;

/** Facts about the homeserver: `/info` and its signed record on the Pubky network. Loads once `enabled`. */
export function useHomeserver(client: HomeserverClient | null, enabled: boolean): HomeserverState {
  const [state, setState] = useState<HomeserverState>({ info: LOADING, record: LOADING });

  useEffect(() => {
    if (!client || !enabled) return;
    let cancelled = false;
    const settle = <T>(key: keyof HomeserverState, promise: Promise<T>) =>
      promise
        .then((value) => ({ status: 'done', value }) as const)
        .catch((error) => ({ status: 'failed', message: messageOf(error) }) as const)
        .then((loaded) => {
          if (!cancelled) setState((s) => ({ ...s, [key]: loaded }));
        });
    void settle('info', client.info());
    void settle('record', client.homeserverRecord());
    return () => {
      cancelled = true;
    };
  }, [client, enabled]);

  return state;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
