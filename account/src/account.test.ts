import { describe, expect, it } from 'vitest';
import { describeRate, describeStorage, describeWritablePaths, limitRows, parseHomeserverTime } from './account';

describe('parseHomeserverTime', () => {
  it("reads the homeserver's zoneless UTC time, to the microsecond", () => {
    expect(parseHomeserverTime('2026-10-22T10:11:12.123456')?.toISOString()).toBe('2026-10-22T10:11:12.123Z');
    expect(parseHomeserverTime('2026-10-22T10:11:12')?.toISOString()).toBe('2026-10-22T10:11:12.000Z');
    expect(parseHomeserverTime('2026-10-22T10:11:12.5')?.toISOString()).toBe('2026-10-22T10:11:12.500Z');
  });

  it('takes a time with a zone as it is, and gives up on nonsense', () => {
    expect(parseHomeserverTime('2026-10-22T10:11:12+02:00')?.toISOString()).toBe('2026-10-22T08:11:12.000Z');
    expect(parseHomeserverTime('yesterday')).toBeNull();
  });
});

describe('describeStorage', () => {
  it('names the used share of the allowance', () => {
    expect(describeStorage(30 * 1024, 500)).toEqual({ text: '30 KB of 500 MB (0%)', share: 0 });
    expect(describeStorage(450 * 1024 * 1024, 500)).toEqual({ text: '450 MB of 500 MB (90%)', share: 90 });
    expect(describeStorage(600 * 1024 * 1024, 500)).toEqual({ text: '600 MB of 500 MB (100%)', share: 100 });
  });

  it('has no share without a limit', () => {
    expect(describeStorage(2048, 'unlimited')).toEqual({ text: '2.0 KB, no limit', share: null });
    expect(describeStorage(2048, undefined)).toEqual({ text: '2.0 KB, no limit', share: null });
    expect(describeStorage(2048, 0)).toEqual({ text: '2.0 KB, no limit', share: null });
  });
});

describe('describeRate', () => {
  it('puts a rate into words, with its burst', () => {
    expect(describeRate('100mb/m', undefined)).toBe('100 MB per minute');
    expect(describeRate('500kb/s', 2000)).toBe('500 KB per second, bursts of 2000 KB');
    expect(describeRate('1.5GB/h', undefined)).toBe('1.5 GB per hour');
    expect(describeRate('10mb/d', undefined)).toBe('10 MB per day');
  });

  it('is "No limit" for unlimited or none, and keeps an unknown form as written', () => {
    expect(describeRate('unlimited', 5)).toBe('No limit');
    expect(describeRate(undefined, undefined)).toBe('No limit');
    expect(describeRate('fast', undefined)).toBe('fast');
  });
});

describe('describeWritablePaths', () => {
  it('reads unrestricted, read-only and listed paths', () => {
    expect(describeWritablePaths(undefined)).toBe('Anywhere in your storage');
    expect(describeWritablePaths([])).toBe('Nowhere: this account is read-only');
    expect(describeWritablePaths(['/pub/pubky.app/', '/pub/site/'])).toBe('/pub/pubky.app/, /pub/site/');
  });
});

describe('limitRows', () => {
  it('lists download and upload, marking what was set for this account, and paths only when restricted', () => {
    expect(
      limitRows({
        effective: { storageQuotaMb: 500, rateRead: '100mb/m', rateWrite: 'unlimited', rateReadBurst: 150 },
        overrides: { rateReadBurst: 150 },
      }),
    ).toEqual([
      { label: 'Download', text: '100 MB per minute, bursts of 150 MB', custom: true },
      { label: 'Upload', text: 'No limit', custom: false },
    ]);
    expect(
      limitRows({
        effective: { rateRead: 'unlimited', rateWrite: 'unlimited', allowedWritePaths: ['/pub/x/'] },
        overrides: { allowedWritePaths: ['/pub/x/'] },
      }),
    ).toContainEqual({ label: 'Writable paths', text: '/pub/x/', custom: true });
  });
});
