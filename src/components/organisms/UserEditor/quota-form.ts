/**
 * The user editor's quota fields: how an override is shown as text, and how
 * edited text becomes a PATCH. An empty field means "homeserver default".
 */
import type { UserQuota, UserQuotaPatch } from '@/services/admin/admin.types';

export type QuotaField = keyof UserQuota;

export type QuotaFieldSpec = { key: QuotaField; label: string; hint: string };

export const QUOTA_FIELDS: QuotaFieldSpec[] = [
  // In pairs: the editor lays them out two to a row, a rate beside its burst.
  { key: 'storage_quota_mb', label: 'Storage (MB)', hint: 'Whole MB, or unlimited.' },
  {
    key: 'allowed_write_paths',
    label: 'Writable paths',
    hint: 'Comma-separated, e.g. /pub/my-app/. none = read-only. Empty = anywhere.',
  },
  { key: 'rate_read', label: 'Download rate', hint: 'For example 10mb/s or 500kb/s, or unlimited.' },
  { key: 'rate_read_burst', label: 'Download burst', hint: "In the rate's unit. Needs a custom download rate." },
  { key: 'rate_write', label: 'Upload rate', hint: 'For example 5mb/s, or unlimited.' },
  { key: 'rate_write_burst', label: 'Upload burst', hint: "In the rate's unit. Needs a custom upload rate." },
];

export type QuotaText = Record<QuotaField, string>;

/** One quota value as editable text; '' for a field with no value. */
export function quotaValueText(key: QuotaField, value: UserQuota[QuotaField] | undefined): string {
  if (value === undefined || value === null) return '';
  if (key === 'allowed_write_paths') {
    const paths = value as string[];
    return paths.length === 0 ? 'none' : paths.join(', ');
  }
  return String(value);
}

/** The editor's fields for a user's overrides. */
export function quotaText(overrides: UserQuota): QuotaText {
  const text = {} as QuotaText;
  for (const { key } of QUOTA_FIELDS) text[key] = quotaValueText(key, overrides[key]);
  return text;
}

/** How a field with no override reads, from the effective (resolved) quota. */
export function defaultText(key: QuotaField, effective: UserQuota): string {
  if (key === 'allowed_write_paths')
    return effective.allowed_write_paths ? quotaValueText(key, effective[key]) : 'anywhere';
  if (key === 'rate_read_burst' || key === 'rate_write_burst') return 'same as rate';
  const value = quotaValueText(key, effective[key]);
  return value === '' ? 'unlimited' : value;
}

const WHOLE_NUMBER = /^\d+$/;

/** Parses one edited field; null = back to the homeserver default. Throws a readable error. */
function parseField(key: QuotaField, raw: string): UserQuotaPatch[QuotaField] {
  const text = raw.trim();
  const lower = text.toLowerCase();
  if (text === '' || lower === 'default') return null;
  switch (key) {
    case 'storage_quota_mb':
      if (lower === 'unlimited') return 'unlimited';
      if (WHOLE_NUMBER.test(text)) return Number(text);
      throw new Error('Storage must be a whole number of MB, or unlimited.');
    case 'rate_read':
    case 'rate_write':
      // The homeserver checks the format and says what is wrong.
      return lower === 'unlimited' ? 'unlimited' : lower;
    case 'rate_read_burst':
    case 'rate_write_burst':
      if (WHOLE_NUMBER.test(text) && Number(text) > 0) return Number(text);
      throw new Error('A burst must be a whole number above zero.');
    case 'allowed_write_paths':
      if (lower === 'none') return [];
      return text
        .split(',')
        .map((path) => path.trim())
        .filter(Boolean);
  }
}

/**
 * The PATCH for the fields whose text changed since `loaded`. Throws when a
 * changed field cannot be read, or when nothing changed.
 */
export function quotaPatch(loaded: QuotaText, edited: QuotaText): UserQuotaPatch {
  const patch: UserQuotaPatch = {};
  for (const { key } of QUOTA_FIELDS) {
    if (edited[key].trim() === loaded[key].trim()) continue;
    (patch as Record<QuotaField, unknown>)[key] = parseField(key, edited[key]);
  }
  if (Object.keys(patch).length === 0) throw new Error('Nothing changed.');
  return patch;
}
