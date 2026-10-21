/** Bytes as people read them: 0 B, 12 KB, 4.3 MB, 1.2 GB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** A date as a short local date, e.g. "21 Oct 2026". */
export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A date with its time, e.g. "21 Oct 2026, 14:28". */
export function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A pubky short enough for a label: its first and last characters. */
export function shortPubky(pubky: string): string {
  return pubky.length > 12 ? `${pubky.slice(0, 6)}…${pubky.slice(-4)}` : pubky;
}

/** How long ago, in round words: "less than a minute ago", "5 hours ago", "6 days ago". */
export function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'less than a minute ago';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}
