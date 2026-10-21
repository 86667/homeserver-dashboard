import { describe, expect, it } from 'vitest';
import { formatBytes, formatDate } from './format';

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
