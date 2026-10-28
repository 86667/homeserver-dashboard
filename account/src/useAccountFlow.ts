import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountConfig, AccountInfo, InviteStatus } from './model';
import { HomeserverClient, type RingRequestKind } from './homeserver-client';
import { useInviteCode } from './useInviteCode';

export type Step =
  | { name: 'connecting' }
  | { name: 'unavailable'; message: string }
  | { name: 'start' }
  | { name: 'waiting'; kind: RingRequestKind; authUrl: string }
  | { name: 'checking' }
  | { name: 'done'; kind: RingRequestKind; info: AccountInfo; inviteStatus?: InviteStatus }
  | { name: 'failed'; message: string };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The account page's steps: connect to the homeserver, then sign up or sign
 * in with Ring, then show what became of it. `initialCode` is the invite code
 * from the page's link, if any.
 */
export function useAccountFlow(config: AccountConfig, initialCode: string) {
  const [client, setClient] = useState<HomeserverClient | null>(null);
  // null until known: a code is asked for unless the homeserver clearly says otherwise.
  const [inviteRequired, setInviteRequired] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>({ name: 'connecting' });
  // Each attempt gets a number; a result that belongs to an older one is dropped.
  const attempt = useRef(0);

  const checkCode = useCallback((code: string) => client!.inviteStatus(code), [client]);
  const invite = useInviteCode(initialCode, client && inviteRequired !== false ? checkCode : null);

  const connect = useCallback(async () => {
    setStep({ name: 'connecting' });
    try {
      const connected = await HomeserverClient.connect(config);
      setInviteRequired(await connected.isInviteRequired());
      setClient(connected);
      setStep({ name: 'start' });
    } catch (error) {
      setStep({ name: 'unavailable', message: messageOf(error) });
    }
  }, [config]);

  useEffect(() => {
    void connect();
    const attempts = attempt;
    return () => {
      attempts.current += 1;
    };
  }, [connect]);

  const { recheck } = invite;
  const backToStart = useCallback(() => {
    attempt.current += 1;
    // A sign-up may just have spent the code.
    recheck();
    setStep({ name: 'start' });
  }, [recheck]);

  // A code goes with the sign-up only when the homeserver accepted it; with
  // codes not required (said up front, or in answer to a code) none is sent.
  const signUpCode = invite.state === 'valid' ? invite.code : null;
  const canSignUp = inviteRequired === false || invite.state === 'valid' || invite.state === 'not_required';

  const start = useCallback(
    async (kind: RingRequestKind) => {
      if (!client) return;
      const thisAttempt = ++attempt.current;
      const current = () => attempt.current === thisAttempt;
      const inviteCode = kind === 'signup' ? signUpCode : null;
      try {
        const request = await client.startRequest(kind, inviteCode);
        if (!current()) return;
        setStep({ name: 'waiting', kind, authUrl: request.authUrl });

        const info = await request.awaitAccount();
        if (!current()) return;
        setStep({ name: 'checking' });

        // Read after the sign-in, so a code Ring just spent shows as used.
        const inviteStatus = inviteCode ? await client.inviteStatus(inviteCode) : undefined;
        if (current()) setStep({ name: 'done', kind, info, inviteStatus });
      } catch (error) {
        if (current()) setStep({ name: 'failed', message: messageOf(error) });
      }
    },
    [client, signUpCode],
  );

  return { client, step, invite, inviteRequired, canSignUp, start, backToStart, retryConnect: connect };
}
