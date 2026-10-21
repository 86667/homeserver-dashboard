import { useEffect, useState } from 'react';
import type { HomeserverClient } from './homeserver-client';
import type { PublicFile } from './model';

/** Files whose size is read; beyond this the rest are listed without one. */
const MAX_MEASURED = 2000;
/** HEAD requests in flight at once: quick, and well under the homeserver's limits. */
const CONCURRENCY = 4;

export type PublicFiles =
  | { status: 'idle' }
  | { status: 'listing' }
  | { status: 'measuring' | 'done'; files: PublicFile[]; more: boolean; measured: number }
  | { status: 'failed'; message: string };

/**
 * A person's public files on this homeserver, with their sizes as they come
 * in: the listing names files only, so each size is a HEAD request, a few at
 * a time. Idle until there is a client and a pubky.
 */
export function usePublicFiles(client: HomeserverClient | null, pubky: string | null): PublicFiles {
  const [state, setState] = useState<PublicFiles>({ status: 'idle' });

  useEffect(() => {
    if (!client || !pubky) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    const update = (next: PublicFiles) => {
      if (!cancelled) setState(next);
    };

    (async () => {
      update({ status: 'listing' });
      const { files, more } = await client.listPublicFiles(pubky);
      update({ status: 'measuring', files, more, measured: 0 });

      const toMeasure = files.slice(0, MAX_MEASURED);
      let next = 0;
      let measured = 0;
      const worker = async () => {
        while (next < toMeasure.length && !cancelled) {
          const file = toMeasure[next++];
          try {
            Object.assign(file, await client.fileStats(file));
          } catch {
            // Left without a size; the total says how many were measured.
          }
          measured += 1;
          update({ status: 'measuring', files: [...files], more, measured });
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      update({ status: 'done', files: [...files], more, measured });
    })().catch((error) =>
      update({ status: 'failed', message: error instanceof Error ? error.message : String(error) }),
    );

    return () => {
      cancelled = true;
    };
  }, [client, pubky]);

  return state;
}

/** Totals over files whose size is known. */
export function summarize(files: PublicFile[]): {
  bytes: number;
  sized: number;
  byApp: Map<string, { files: number; bytes: number }>;
} {
  const byApp = new Map<string, { files: number; bytes: number }>();
  let bytes = 0;
  let sized = 0;
  for (const file of files) {
    const app = byApp.get(file.app) ?? { files: 0, bytes: 0 };
    app.files += 1;
    if (file.size !== undefined) {
      app.bytes += file.size;
      bytes += file.size;
      sized += 1;
    }
    byApp.set(file.app, app);
  }
  return { bytes, sized, byApp };
}
