'use client';

import { useState } from 'react';
import { AlertCircle, CircleCheckBig, Copy, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';
import { formatAge } from '../format';
import type { SignedRecord } from '../model';
import { homeserverAddresses } from '../pkarr';
import type { HomeserverState } from '../useHomeserver';

interface HomeserverTabProps {
  /** The homeserver's public key (z-base-32). */
  homeserver: string;
  state: HomeserverState;
  /** Whether sign-up needs an invite code; null when not known. */
  inviteRequired: boolean | null;
  /** The page is not set up: nothing can be shown. */
  notSetUp?: React.ReactNode;
}

/** What a homeserver announces about itself, and how each known feature reads. */
const FEATURES: Record<string, { label: string; text: string }> = {
  'path-addressed-storage': {
    label: 'Path-addressed storage',
    text: 'Public files have plain web addresses, so any browser or tool can read them.',
  },
  'grant-proof-logout': { label: 'Grant-proof sign-out', text: 'Apps can end a session with a signed proof.' },
  'webdav-locks': { label: 'WebDAV locks', text: 'Apps can lock a file while they edit it.' },
};

const pkdnsLink = (key: string) => `https://pkdns.net/?id=${encodeURIComponent(key)}`;

/**
 * Facts about this homeserver, laid out like the admin dashboard's overview:
 * whether it answers, its key and addresses, how sign-up works, what it
 * supports, and its record on the Pubky network.
 */
export function HomeserverTab({ homeserver, state, inviteRequired, notSetUp }: HomeserverTabProps) {
  return (
    <Card data-testid="homeserver-tab">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">Server &amp; Connection</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          The homeserver this page belongs to, as it describes itself and as the Pubky network knows it.
        </CardDescription>
      </CardHeader>
      <div className="mx-6 h-px bg-border/60" />
      <CardContent className="space-y-3 pt-4">
        {notSetUp ?? <Facts homeserver={homeserver} state={state} inviteRequired={inviteRequired} />}
      </CardContent>
    </Card>
  );
}

function Facts({ homeserver, state, inviteRequired }: Omit<HomeserverTabProps, 'notSetUp'>) {
  const { info, record } = state;
  const [viewerOpen, setViewerOpen] = useState(false);
  // Read once per visit: the record's age need not tick.
  const [now] = useState(() => Date.now());
  const address = info.status === 'done' ? info.value.address : null;
  const published = record.status === 'done' ? record.value : null;
  const { pubkyAddress } = published ? homeserverAddresses(published) : { pubkyAddress: null };

  return (
    <>
      <Row label="Connection status:">
        {info.status === 'loading' ? (
          <Skeleton className="h-4 w-24" />
        ) : info.status === 'done' ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand sm:text-sm"
            data-testid="homeserver-connected"
          >
            <CircleCheckBig className="h-4 w-4" />
            Connected
          </span>
        ) : (
          <Badge variant="destructive" className="text-xs" data-testid="homeserver-not-connected">
            <AlertCircle className="mr-1 h-3 w-3" />
            Not connected
          </Badge>
        )}
      </Row>
      {info.status === 'failed' && (
        <p className="text-xs text-muted-foreground" data-testid="homeserver-failed">
          The homeserver could not be reached from here: {info.message}
        </p>
      )}

      <Row label="Homeserver pubkey:">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1 sm:flex-initial sm:items-end">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-xs break-all text-foreground sm:text-sm" data-testid="homeserver-key">
              {homeserver}
            </span>
            <CopyValueButton value={homeserver} label="Copy pubkey" />
          </div>
          <a
            href={pkdnsLink(homeserver)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
            title="Open pkdns.net to see the record published for this homeserver on the Pubky network"
          >
            <ExternalLink className="h-3 w-3" />
            Verify on the DHT
          </a>
        </div>
      </Row>

      {pubkyAddress && (
        <Row label="Pubky address:" hint="How Pubky apps find this server">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code
              className="min-w-0 rounded bg-muted px-2 py-1 font-mono text-xs break-all"
              data-testid="homeserver-pubky-address"
            >
              {pubkyAddress}
            </code>
            <CopyValueButton value={pubkyAddress} label="Copy address" />
          </div>
        </Row>
      )}

      <Row label="Public address:">
        <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="homeserver-address">
          {info.status === 'loading' ? (
            <Skeleton className="h-4 w-40" />
          ) : address ? (
            <>
              <a
                href={address}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 rounded bg-muted px-2 py-1 font-mono text-xs break-all text-foreground underline-offset-2 hover:underline"
              >
                {address.replace(/^https?:\/\//, '')}
              </a>
              <CopyValueButton value={address} label="Copy public address" />
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand">
                <CircleCheckBig className="h-3 w-3" /> Reachable
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {info.status === 'failed' ? 'Not reachable' : 'Not known'}
            </span>
          )}
        </div>
      </Row>

      <Row label="Sign-ups:">
        <span className="text-xs text-foreground sm:text-sm" data-testid="homeserver-signups">
          {inviteRequired === null ? 'Not known' : inviteRequired ? 'By invite code' : 'Open to anyone'}
        </span>
      </Row>

      <Row label="Features:" hint="What this homeserver announces it supports">
        {info.status === 'loading' ? (
          <Skeleton className="h-4 w-48" />
        ) : info.status === 'failed' ? (
          <span className="text-xs text-muted-foreground">Not known</span>
        ) : info.value.features.length === 0 ? (
          <span className="text-xs text-muted-foreground">None announced</span>
        ) : (
          <ul className="flex flex-wrap gap-1.5 sm:justify-end" data-testid="homeserver-features">
            {info.value.features.map((feature) => (
              <li key={feature}>
                <Badge variant="outline" title={FEATURES[feature]?.text ?? 'A feature this page does not know.'}>
                  {FEATURES[feature]?.label ?? feature}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Row>

      <Row label="Pubky network:" hint="The record published to the DHT">
        <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="homeserver-network">
          {record.status === 'loading' && <Skeleton className="h-4 w-32" />}
          {record.status === 'failed' && (
            <span
              className="shrink-0 text-xs text-muted-foreground"
              title="The Pubky relay could not be reached from here, so nothing is known about the record right now."
            >
              Can&apos;t verify right now
            </span>
          )}
          {record.status === 'done' && !record.value && (
            <span
              className="inline-flex shrink-0 items-center gap-1 text-xs text-amber-400"
              title="No record was found on the Pubky relay for this homeserver's key, so Pubky apps cannot find it."
            >
              <AlertCircle className="h-3 w-3" /> Not published
            </span>
          )}
          {published && (
            <>
              <span
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand"
                title="A record signed by this homeserver's key is on the Pubky relay."
                data-testid="record-published"
              >
                <CircleCheckBig className="h-3 w-3" /> Published {formatAge(now - published.publishedAt.getTime())}
              </span>
              {published.records.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 shrink-0 px-2 text-xs"
                  onClick={() => setViewerOpen(true)}
                  data-testid="record-view"
                >
                  View
                </Button>
              )}
            </>
          )}
        </div>
      </Row>

      {published && (
        <RecordViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          record={published}
          homeserver={homeserver}
          now={now}
        />
      )}
    </>
  );
}

/** One row of the card: a label (with an optional hint under it) on the left, the value on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 flex-col">
        <span className="shrink-0 text-xs text-muted-foreground sm:text-sm">{label}</span>
        {hint && <span className="text-xs text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function CopyValueButton({ value, label }: { value: string; label: string }) {
  const { copiedKey, copy } = useCopyFeedback();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 shrink-0 px-1.5"
      onClick={() => void copy(value)}
      aria-label={label}
    >
      {copiedKey ? <span className="text-xs text-brand">Copied</span> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

/** The record as published: its DNS records, when it was signed, and a second opinion on pkdns.net. */
function RecordViewer({
  open,
  onOpenChange,
  record,
  homeserver,
  now,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: SignedRecord;
  homeserver: string;
  now: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl" data-testid="record-viewer">
        <DialogHeader>
          <DialogTitle className="text-base">PKARR record</DialogTitle>
          <DialogDescription className="text-xs">
            What this homeserver has published to the Pubky network (Mainline DHT) under its public key.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground">
            <CircleCheckBig className="mr-1 inline h-3 w-3 align-[-2px] text-brand" />
            This record is signed by the homeserver&apos;s key; no one else can change it. Published{' '}
            {formatAge(now - record.publishedAt.getTime())}.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left" aria-label="Published PKARR records" data-testid="record-entries">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pr-3 font-medium">Type</th>
                  <th className="pr-3 font-medium">Name</th>
                  <th className="pr-3 font-medium">Value</th>
                  <th className="font-medium">TTL</th>
                </tr>
              </thead>
              <tbody>
                {record.records.map((entry, index) => (
                  <tr key={index} className="border-t border-border/40">
                    <td className="py-1 pr-3 align-top font-mono">{entry.type}</td>
                    <td className="py-1 pr-3 align-top font-mono break-all">{entry.name}</td>
                    <td className="py-1 pr-3 align-top font-mono break-all">{entry.value}</td>
                    <td className="py-1 align-top font-mono">{entry.ttl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <a
            href={pkdnsLink(homeserver)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Verify independently on pkdns.net
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
