'use client';

import { FolderOpen, HardDrive } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes, formatDate } from '../format';
import type { PublicFile } from '../model';
import { type PublicFiles, summarize } from '../usePublicFiles';

/** The person's public files on this homeserver, grouped by the app that wrote them, with the space they take. */
export function FilesCard({ state }: { state: PublicFiles }) {
  return (
    <Card data-testid="files-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <HardDrive className="size-5" />
          Your files
        </CardTitle>
        <CardDescription>
          Everything under your public folder on this homeserver. Public means anyone can read these; your private files
          are not listed here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FilesBody state={state} />
      </CardContent>
    </Card>
  );
}

function FilesBody({ state }: { state: PublicFiles }) {
  if (state.status === 'idle' || state.status === 'listing') {
    return (
      <div className="space-y-2" data-testid="files-loading">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (state.status === 'failed') {
    return (
      <p className="text-xs text-muted-foreground" data-testid="files-failed">
        Your files could not be listed: {state.message}
      </p>
    );
  }
  const { files, more, measured } = state;
  if (files.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="files-none">
        Nothing here yet. Apps that use your account, such as pubky.app, will store your public data here.
      </p>
    );
  }
  const { bytes, sized, byApp } = summarize(files);
  const measuring = state.status === 'measuring';
  const apps = [...byApp.entries()].sort((a, b) => b[1].bytes - a[1].bytes || a[0].localeCompare(b[0]));
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3" data-testid="files-summary">
        <div className="text-xs text-muted-foreground">Space used</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold tabular-nums">{formatBytes(bytes)}</span>
          <span className="text-xs text-muted-foreground">
            in {files.length} public file{files.length === 1 ? '' : 's'}
            {more ? ', and more' : ''}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {measuring
            ? `Measuring… ${measured} of ${Math.min(files.length, 2000)}`
            : sized < files.length
              ? `${files.length - sized} file${files.length - sized === 1 ? '' : 's'} without a known size. `
              : ''}
          {!measuring && 'Your storage allowance is set by the homeserver’s operator and is not shown here.'}
        </p>
      </div>

      <ul className="space-y-2" data-testid="files-by-app">
        {apps.map(([app, totals]) => (
          <li key={app}>
            <AppFolder
              app={app}
              totals={totals}
              files={files.filter((file) => file.app === app)}
              open={apps.length === 1}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AppFolder({
  app,
  totals,
  files,
  open,
}: {
  app: string;
  totals: { files: number; bytes: number };
  files: PublicFile[];
  open: boolean;
}) {
  const sorted = [...files].sort(
    (a, b) => (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0) || a.path.localeCompare(b.path),
  );
  return (
    <details className="group rounded-lg border" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm select-none [&::-webkit-details-marker]:hidden">
        <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{app || '(files at the top level)'}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {totals.files} file{totals.files === 1 ? '' : 's'} · {formatBytes(totals.bytes)}
        </span>
      </summary>
      <ul className="max-h-72 divide-y overflow-y-auto border-t text-xs">
        {sorted.map((file) => (
          <li key={file.url} className="flex items-center gap-3 px-3 py-1.5">
            <code className="min-w-0 flex-1 truncate font-mono" title={file.path}>
              {app ? file.path.slice(app.length + 1) : file.path}
            </code>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {file.size === undefined ? '…' : formatBytes(file.size)}
            </span>
            <span className="hidden w-24 shrink-0 text-right text-muted-foreground sm:inline">
              {file.modifiedAt ? formatDate(file.modifiedAt) : ''}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
