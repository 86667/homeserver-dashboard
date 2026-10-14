import { describe, expect, it } from 'vitest';
import { isInviteCode, normalizeInviteCode } from './model';

describe('normalizeInviteCode', () => {
  it.each([
    ['abcd-efgh-jkmn', 'ABCD-EFGH-JKMN'],
    ['ABCDEFGHJKMN', 'ABCD-EFGH-JKMN'],
    [' abcd efgh jkmn ', 'ABCD-EFGH-JKMN'],
    ['ABCD', 'ABCD'],
    ['ABCDE', 'ABCD-E'],
    // Backspacing over a hyphen leaves no dangling hyphen behind.
    ['ABCD-', 'ABCD'],
    ['ABCD-EFGH-JKMN-PQRS', 'ABCD-EFGH-JKMN'],
    ['', ''],
  ])('%j -> %j', (raw, expected) => {
    expect(normalizeInviteCode(raw)).toBe(expected);
  });
});

describe('isInviteCode', () => {
  it('accepts only whole canonical codes', () => {
    expect(isInviteCode('ABCD-EFGH-JKMN')).toBe(true);
    expect(isInviteCode('abcd-efgh-jkmn')).toBe(false);
    expect(isInviteCode('ABCD-EFGH')).toBe(false);
    expect(isInviteCode('../../info')).toBe(false);
    expect(isInviteCode('ABCD-EFGH-JKMN/x')).toBe(false);
  });
});
