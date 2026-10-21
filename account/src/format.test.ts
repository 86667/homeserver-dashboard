import { describe, expect, it } from 'vitest';
import { formatAge, formatBytes, formatDate, formatDateTime, shortPubky } from './format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [12 * 1024, '12 KB'],
    [4.3 * 1024 * 1024, '4.3 MB'],
    [1.2 * 1024 ** 3, '1.2 GB'],
    [5 * 1024 ** 4, '5.0 TB'],
    [5000 * 1024 ** 4, '5000 TB'],
  ])('%d -> %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe('formatDate', () => {
  it('shows day, month and year', () => {
    expect(formatDate(new Date(2026, 9, 21))).toMatch(/21.*Oct.*2026|Oct.*21.*2026/);
  });
});

describe('shortPubky', () => {
  it('keeps the ends of a key', () => {
    expect(shortPubky('whgxto9xtroaih7ict9chtuxh1xmbpmci5qd71jsen3ow3bscipy')).toBe('whgxto…cipy');
    expect(shortPubky('short')).toBe('short');
  });
});

describe('formatDateTime', () => {
  it('includes the time', () => {
    expect(formatDateTime(new Date(2026, 9, 21, 14, 28))).toMatch(/2026.*14:28|2:28/);
  });
});

describe('formatAge', () => {
  it('rounds to the largest sensible unit', () => {
    expect(formatAge(30_000)).toBe('less than a minute ago');
    expect(formatAge(60_000)).toBe('1 minute ago');
    expect(formatAge(5 * 3_600_000)).toBe('5 hours ago');
    expect(formatAge(6 * 86_400_000)).toBe('6 days ago');
  });
});
