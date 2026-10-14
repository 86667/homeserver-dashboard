import { useCallback, useEffect, useState } from 'react';
import { type InviteStatus, isInviteCode, normalizeInviteCode } from './model';

export type CodeState = InviteStatus | 'empty' | 'incomplete' | 'checking';

/** Hints shown under the invite code field, by the code's state. */
export const INVITE_HINTS: Record<CodeState, string> = {
  empty: 'Ask the operator of this homeserver for one.',
  incomplete: 'Codes look like XXXX-XXXX-XXXX.',
  checking: 'Checking…',
  valid: 'Invite code accepted.',
  used: 'This invite code has already been used.',
  unknown: 'This homeserver does not know this invite code.',
  not_required: 'This homeserver does not need an invite code. You can sign up without one.',
  rate_limited: 'Too many checks in a row. Wait a minute and try again.',
  error: 'Could not check the invite code right now.',
};

/** Lookups are rate limited by the homeserver, so typing settles before one is made. */
const CHECK_DELAY_MS = 400;

/**
 * The invite code field: keeps what was typed in canonical form, and asks
 * `check` about it once it is a whole code. `check` null skips checks (no
 * code needed, or the homeserver is not reachable yet).
 */
export function useInviteCode(initial: string, check: ((code: string) => Promise<InviteStatus>) | null) {
  const [code, setCodeRaw] = useState(() => normalizeInviteCode(initial));
  const [checked, setChecked] = useState<{ code: string; status: InviteStatus } | null>(null);
  // Bumped to ask again about the same code, e.g. after a sign-up may have spent it.
  const [checkNonce, setCheckNonce] = useState(0);

  const complete = isInviteCode(code);

  useEffect(() => {
    if (!check || !complete) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const status = await check(code);
      if (!cancelled) setChecked({ code, status });
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, complete, check, checkNonce]);

  let state: CodeState;
  if (code === '') state = 'empty';
  else if (!complete) state = 'incomplete';
  else if (checked?.code === code) state = checked.status;
  else state = 'checking';

  const setCode = useCallback((value: string) => setCodeRaw(normalizeInviteCode(value)), []);
  const recheck = useCallback(() => {
    setChecked(null);
    setCheckNonce((n) => n + 1);
  }, []);

  return { code, state, setCode, recheck };
}
