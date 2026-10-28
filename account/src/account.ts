/** What the homeserver reports about a person's own account, in words. */
import { formatBytes } from './format';
import type { AccountRecord, QuotaLimits } from './model';

/**
 * The homeserver writes times as UTC without a zone, to the microsecond:
 * `2026-10-22T10:11:12.123456`. A time with a zone is taken as it is.
 */
export function parseHomeserverTime(text: string): Date | null {
  const naive = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/.exec(text.trim());
  const date = naive ? new Date(`${naive[1]}.${(naive[2] ?? '').padEnd(3, '0').slice(0, 3)}Z`) : new Date(text.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

export type Storage = {
  /** "30 KB of 500 MB (6%)", or "30 KB, no limit". */
  text: string;
  /** The share of the allowance used, 0 to 100; null without an allowance. */
  share: number | null;
};

/** The storage used against the allowance. A quota of `unlimited` or 0 is no limit. */
export function describeStorage(usedBytes: number, quotaMb: QuotaLimits['storageQuotaMb']): Storage {
  const used = formatBytes(usedBytes);
  if (quotaMb === undefined || quotaMb === 'unlimited' || quotaMb <= 0)
    return { text: `${used}, no limit`, share: null };
  const limit = quotaMb * 1024 * 1024;
  const share = Math.min(100, Math.round((usedBytes / limit) * 100));
  return { text: `${used} of ${formatBytes(limit)} (${share}%)`, share };
}

const UNITS: Record<string, string> = { kb: 'KB', mb: 'MB', gb: 'GB' };
const PERIODS: Record<string, string> = { s: 'second', m: 'minute', h: 'hour', d: 'day' };

/**
 * A transfer limit in words: `100mb/m` is "100 MB per minute", with a burst
 * "100 MB per minute, bursts of 150 MB". `unlimited` or no rate is "No limit".
 * A rate in a form this page does not know is shown as the homeserver wrote it.
 */
export function describeRate(rate: string | undefined, burst: number | undefined): string {
  if (rate === undefined || rate === 'unlimited') return 'No limit';
  const parsed = /^(\d+(?:\.\d+)?)\s*(kb|mb|gb)\/(s|m|h|d)$/i.exec(rate.trim());
  if (!parsed) return rate;
  const unit = UNITS[parsed[2].toLowerCase()];
  const words = `${parsed[1]} ${unit} per ${PERIODS[parsed[3].toLowerCase()]}`;
  return burst === undefined ? words : `${words}, bursts of ${burst} ${unit}`;
}

/** Where the account may write: everywhere, nowhere, or the listed paths. */
export function describeWritablePaths(paths: string[] | undefined): string {
  if (paths === undefined) return 'Anywhere in your storage';
  if (paths.length === 0) return 'Nowhere: this account is read-only';
  return paths.join(', ');
}

export type LimitRow = { label: string; text: string; custom: boolean };

/** The account's limits as rows for a list, each marked when it was set for this account in particular. */
export function limitRows(quota: AccountRecord['quota']): LimitRow[] {
  const { effective, overrides } = quota;
  const custom = (...keys: (keyof QuotaLimits)[]) => keys.some((key) => overrides[key] !== undefined);
  const rows: LimitRow[] = [
    {
      label: 'Download',
      text: describeRate(effective.rateRead, effective.rateReadBurst),
      custom: custom('rateRead', 'rateReadBurst'),
    },
    {
      label: 'Upload',
      text: describeRate(effective.rateWrite, effective.rateWriteBurst),
      custom: custom('rateWrite', 'rateWriteBurst'),
    },
  ];
  if (effective.allowedWritePaths !== undefined) {
    rows.push({
      label: 'Writable paths',
      text: describeWritablePaths(effective.allowedWritePaths),
      custom: custom('allowedWritePaths'),
    });
  }
  return rows;
}
