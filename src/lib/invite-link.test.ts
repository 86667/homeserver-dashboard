import { describe, expect, it } from 'vitest';
import { inviteLink } from './invite-link';

describe('inviteLink', () => {
  it('puts the code in the token parameter', () => {
    expect(inviteLink('https://dashboard.example.com', 'ABCD-EFGH-JKMN')).toBe(
      'https://dashboard.example.com/?token=ABCD-EFGH-JKMN',
    );
  });

  it('keeps a path and other parameters, and replaces an existing token', () => {
    expect(inviteLink('https://dashboard.example.com/account/?lang=en&token=OLD', 'ABCD-EFGH-JKMN')).toBe(
      'https://dashboard.example.com/account/?lang=en&token=ABCD-EFGH-JKMN',
    );
  });
});
