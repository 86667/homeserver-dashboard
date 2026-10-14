import type { AccountInfo, InviteStatus } from '@/lib/account';
import type { RingRequestKind } from './homeserver-client';

export type Outcome = { hasAccount: boolean; title: string; text: string };

const SIGNED_UP: Outcome = {
  hasAccount: true,
  title: 'Welcome to your homeserver',
  text: 'Your account is ready. Your pubky is your identity in Pubky apps; your data lives on this homeserver.',
};

const ALREADY_SIGNED_UP: Outcome = {
  hasAccount: true,
  title: 'You already have an account here',
  text: 'Ring approved with a pubky that is already signed up on this homeserver, so no new account was made. Your invite code is still unused.',
};

const SIGNED_IN: Outcome = { hasAccount: true, title: 'Welcome back', text: 'You have an account on this homeserver.' };

/** Whether the account is new is unknown: no code was used (open sign-ups), or its status could not be read. */
const HAS_ACCOUNT: Outcome = {
  hasAccount: true,
  title: 'You have an account on this homeserver',
  text: 'Your pubky is your identity in Pubky apps; your data lives on this homeserver.',
};

/**
 * What became of a Ring request, in words.
 *
 * The approval only proves who approved. Whether a sign-up created an
 * account is read from the homeserver: is there an account for that pubky,
 * and was the invite code spent? Ring falls back to approving with a key it
 * already has when its own sign-up fails, so an account with a still-unused
 * code was already there, and no account at all means the sign-up did not go
 * through. Nothing is claimed that was not checked: without a code to read
 * (open sign-ups) or with an unreadable one, the wording stays neutral.
 *
 * `inviteStatus` is the code's status read after a sign-up that sent one.
 */
export function describeOutcome(kind: RingRequestKind, info: AccountInfo, inviteStatus?: InviteStatus): Outcome {
  if (!info.hasAccount) return noAccount(kind, inviteStatus);
  if (kind === 'signin') return SIGNED_IN;
  if (inviteStatus === 'used') return SIGNED_UP;
  if (inviteStatus === 'valid') return ALREADY_SIGNED_UP;
  return HAS_ACCOUNT;
}

function noAccount(kind: RingRequestKind, inviteStatus?: InviteStatus): Outcome {
  const title = 'No account on this homeserver';
  if (kind === 'signin') {
    return {
      hasAccount: false,
      title,
      text: 'This homeserver has no account for the pubky you approved with. Pick a pubky that was signed up here, or sign up.',
    };
  }
  const codeNote = inviteStatus === 'valid' ? ' Your invite code is still unused, so you can try again with it.' : '';
  return {
    hasAccount: false,
    title,
    text: `Ring approved the request, but its sign-up to this homeserver did not go through.${codeNote} Check your phone has a connection, then try again.`,
  };
}
