'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PUBKY_RING_URL } from '@/lib/pubky-ring';
import { cn } from '@/lib/utils';
import { type CodeState, INVITE_HINTS } from '../useInviteCode';

interface StartStepProps {
  /** false: the homeserver lets anyone sign up, so no code field is shown. null: not known, so it is shown. */
  inviteRequired: boolean | null;
  code: string;
  codeState: CodeState;
  canSignUp: boolean;
  onCodeChange: (value: string) => void;
  onSignUp: () => void;
  onSignIn: () => void;
}

/** States of the code field that are not a problem to point out. */
const NEUTRAL_CODE_STATES: CodeState[] = ['empty', 'incomplete', 'checking', 'valid', 'not_required'];

/** How to sign up, the invite code field, and the two ways in. */
export function StartStep({
  inviteRequired,
  code,
  codeState,
  canSignUp,
  onCodeChange,
  onSignUp,
  onSignIn,
}: StartStepProps) {
  const showCode = inviteRequired !== false;

  return (
    <div className="space-y-6" data-testid="account-start">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground marker:text-muted-foreground/70">
        <li>
          Install{' '}
          <a
            href={PUBKY_RING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand underline-offset-2 hover:underline"
          >
            Pubky Ring
          </a>{' '}
          on your phone.
        </li>
        <li>{showCode ? 'Enter your invite code, then scan the QR code with Ring.' : 'Scan the QR code with Ring.'}</li>
        <li>Approve in Ring. Your keys never leave your phone.</li>
      </ol>

      {showCode && (
        <div className="space-y-2">
          <Label htmlFor="invite-code">Invite code</Label>
          <Input
            id="invite-code"
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
            placeholder="XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            className="font-mono tracking-wider"
            aria-describedby="invite-code-hint"
          />
          <p
            id="invite-code-hint"
            className={cn(
              'text-xs',
              NEUTRAL_CODE_STATES.includes(codeState) ? 'text-muted-foreground' : 'text-destructive',
            )}
            data-testid="invite-code-hint"
          >
            {INVITE_HINTS[codeState]}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button onClick={onSignUp} disabled={!canSignUp} data-testid="account-signup">
          Sign up with Pubky Ring
        </Button>
        <Button variant="link" size="sm" onClick={onSignIn} data-testid="account-signin">
          Already have an account here? Sign in
        </Button>
      </div>
    </div>
  );
}
