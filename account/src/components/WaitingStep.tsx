'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';
import type { RingRequestKind } from '../homeserver-client';

interface WaitingStepProps {
  kind: RingRequestKind;
  authUrl: string;
  onCancel: () => void;
}

/** The QR code for Ring, and the same request as a link for Ring on this device. */
export function WaitingStep({ kind, authUrl, onCancel }: WaitingStepProps) {
  const { copiedKey, copy } = useCopyFeedback();
  const copied = copiedKey !== null;

  return (
    <div className="flex flex-col items-center gap-4" data-testid="account-waiting">
      <p className="text-center text-sm text-muted-foreground">
        {kind === 'signup'
          ? 'Scan with Pubky Ring. Ring creates your keys, signs you up here and asks you to approve.'
          : 'Scan with Pubky Ring and approve the sign-in.'}
      </p>
      <div className="rounded-lg border border-border bg-white p-3 shadow-sm">
        <QRCodeSVG value={authUrl} size={220} level="M" data-testid="account-qr" />
      </div>
      <Button asChild size="sm">
        <a href={authUrl}>Open in Pubky Ring on this device</a>
      </Button>
      <div className="flex w-full items-center gap-2 rounded-md border bg-background px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{authUrl}</code>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => void copy(authUrl)}
          title={copied ? 'Copied' : 'Copy link'}
          aria-label={copied ? 'Copied link' : 'Copy link'}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCw className="h-3 w-3 animate-spin" /> Waiting for approval in Ring…
      </p>
      <p className="text-center text-xs text-muted-foreground/70">
        This code is meant for you only: anyone who scans it could approve in your place. Do not share a screenshot of
        it.
      </p>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
