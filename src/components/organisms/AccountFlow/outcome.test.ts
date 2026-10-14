import { describe, expect, it } from 'vitest';
import type { AccountInfo } from '@/lib/account';
import { describeOutcome } from './outcome';

const found: AccountInfo = { pubky: 'pk', hasAccount: true };
const missing: AccountInfo = { pubky: 'pk', hasAccount: false };

describe('describeOutcome', () => {
  it('a sign-up that spent the code created the account', () => {
    expect(describeOutcome('signup', found, 'used').title).toBe('Welcome to your homeserver');
  });

  it('a sign-up that left the code unused found an existing account', () => {
    const outcome = describeOutcome('signup', found, 'valid');
    expect(outcome.title).toBe('You already have an account here');
    expect(outcome.text).toMatch(/invite code is still unused/);
  });

  it.each([undefined, 'error', 'rate_limited', 'unknown'] as const)(
    'claims nothing about the account being new when the code status is %s',
    (status) => {
      const outcome = describeOutcome('signup', found, status);
      expect(outcome).toMatchObject({ hasAccount: true, title: 'You have an account on this homeserver' });
    },
  );

  it('a sign-up with no account afterwards did not go through; the code is mentioned only when known unused', () => {
    expect(describeOutcome('signup', missing, 'valid').text).toMatch(/still unused, so you can try again with it/);
    const unknown = describeOutcome('signup', missing, 'error');
    expect(unknown.hasAccount).toBe(false);
    expect(unknown.text).toMatch(/did not go through/);
    expect(unknown.text).not.toMatch(/unused/);
  });

  it('a sign-in says welcome back, or that there is no account here', () => {
    expect(describeOutcome('signin', found).title).toBe('Welcome back');
    expect(describeOutcome('signin', missing)).toMatchObject({
      hasAccount: false,
      title: 'No account on this homeserver',
    });
  });
});
