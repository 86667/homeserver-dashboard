/**
 * Reads a signed pkarr record, the packet a Pubky key publishes about itself
 * (its homeserver's address, for one), as a relay serves it: 64 bytes of
 * signature, 8 bytes of timestamp (microseconds since 1970, big-endian) and a
 * DNS packet. Only the record types a homeserver publishes are spelled out;
 * the rest show as `TYPE<n>` with their raw bytes.
 */
import type { DnsRecord, SignedRecord } from './model';

const SIGNATURE_BYTES = 64;
const HEADER_BYTES = SIGNATURE_BYTES + 8;
const DNS_HEADER_BYTES = 12;

const TYPE_NAMES: Record<number, string> = { 1: 'A', 5: 'CNAME', 16: 'TXT', 28: 'AAAA', 64: 'SVCB', 65: 'HTTPS' };
const SVCB_PARAM_NAMES: Record<number, string> = { 1: 'alpn', 3: 'port', 4: 'ipv4hint', 6: 'ipv6hint' };

/** `key` is the record's owner (z-base-32), to show record names relative to it. */
export function parseSignedRecord(bytes: Uint8Array, key: string): SignedRecord {
  if (bytes.length < HEADER_BYTES + DNS_HEADER_BYTES) throw new Error('The record is too short to be a signed packet');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const micros = view.getBigUint64(SIGNATURE_BYTES);
  const publishedAt = new Date(Number(micros / 1000n));
  const packet = bytes.subarray(HEADER_BYTES);
  return { publishedAt, records: parseAnswers(packet, key) };
}

function parseAnswers(packet: Uint8Array, key: string): DnsRecord[] {
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const questions = view.getUint16(4);
  const answers = view.getUint16(6);
  let offset = DNS_HEADER_BYTES;
  for (let i = 0; i < questions; i += 1) offset = readName(packet, offset).end + 4;
  const records: DnsRecord[] = [];
  for (let i = 0; i < answers; i += 1) {
    const name = readName(packet, offset);
    const type = view.getUint16(name.end);
    const ttl = view.getUint32(name.end + 4);
    const length = view.getUint16(name.end + 8);
    const dataStart = name.end + 10;
    const data = packet.subarray(dataStart, dataStart + length);
    records.push({
      name: relativeName(name.text, key),
      type: TYPE_NAMES[type] ?? `TYPE${type}`,
      value: formatData(type, packet, dataStart, data),
      ttl,
    });
    offset = dataStart + length;
  }
  return records;
}

function formatData(type: number, packet: Uint8Array, start: number, data: Uint8Array): string {
  switch (type) {
    case 1:
      return ipv4(data);
    case 28:
      return ipv6(data);
    case 5:
      return readName(packet, start).text || '.';
    case 16:
      return characterStrings(data);
    case 64:
    case 65:
      return serviceBinding(packet, start, data);
    default:
      return hex(data);
  }
}

/** SVCB / HTTPS: priority, target name, then key=value parameters. */
function serviceBinding(packet: Uint8Array, start: number, data: Uint8Array): string {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const priority = view.getUint16(0);
  const target = readName(packet, start + 2);
  const parts = [`${priority} ${target.text || '.'}`];
  let offset = target.end - start;
  while (offset + 4 <= data.length) {
    const code = view.getUint16(offset);
    const length = view.getUint16(offset + 2);
    const value = data.subarray(offset + 4, offset + 4 + length);
    parts.push(`${SVCB_PARAM_NAMES[code] ?? `key${code}`}=${serviceParam(code, value)}`);
    offset += 4 + length;
  }
  return parts.join(' ');
}

function serviceParam(code: number, value: Uint8Array): string {
  switch (code) {
    case 1:
      return characterStrings(value, ',');
    case 3:
      return value.length === 2 ? String((value[0] << 8) | value[1]) : hex(value);
    case 4:
      return chunks(value, 4).map(ipv4).join(',');
    case 6:
      return chunks(value, 16).map(ipv6).join(',');
    default:
      return hex(value);
  }
}

/** A DNS name at `offset`, following compression pointers; `end` is where the name's own bytes stop. */
function readName(packet: Uint8Array, offset: number): { text: string; end: number } {
  const labels: string[] = [];
  let position = offset;
  let end: number | null = null;
  for (let hops = 0; hops < 64; hops += 1) {
    const length = packet[position];
    if (length === undefined) throw new Error('The record is truncated');
    if (length === 0) {
      position += 1;
      break;
    }
    if ((length & 0xc0) === 0xc0) {
      end ??= position + 2;
      position = ((length & 0x3f) << 8) | packet[position + 1];
      continue;
    }
    labels.push(new TextDecoder().decode(packet.subarray(position + 1, position + 1 + length)));
    position += 1 + length;
  }
  return { text: labels.join('.'), end: end ?? position };
}

/** `_pubky.<key>` → `_pubky`; the key itself (or nothing) → `@`. */
function relativeName(name: string, key: string): string {
  if (!name || name === key) return '@';
  return name.endsWith(`.${key}`) ? name.slice(0, -key.length - 1) : name;
}

/** Length-prefixed strings, as in TXT and alpn. */
function characterStrings(data: Uint8Array, separator = ''): string {
  const parts: string[] = [];
  let offset = 0;
  while (offset < data.length) {
    const length = data[offset];
    parts.push(new TextDecoder().decode(data.subarray(offset + 1, offset + 1 + length)));
    offset += 1 + length;
  }
  return parts.join(separator);
}

const ipv4 = (bytes: Uint8Array) => Array.from(bytes).join('.');

function ipv6(bytes: Uint8Array): string {
  const groups = chunks(bytes, 2).map((pair) => ((pair[0] << 8) | pair[1]).toString(16));
  // Collapse the first run of zero groups, as people write addresses.
  const text = groups.join(':');
  const collapsed = text.replace(/(^|:)0(:0)+(:|$)/, '::');
  return collapsed.replace(/:::/, '::');
}

function chunks(bytes: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i + size <= bytes.length; i += size) out.push(bytes.subarray(i, i + size));
  return out;
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/**
 * What a homeserver's record says about where it is: a homeserver publishes
 * HTTPS records, one naming its domain, one with its IP address and port.
 * Read back from the text this module makes of them.
 */
export function homeserverAddresses(record: SignedRecord): { domain: string | null; pubkyAddress: string | null } {
  let domain: string | null = null;
  let pubkyAddress: string | null = null;
  for (const entry of record.records) {
    if (entry.type !== 'HTTPS' && entry.type !== 'SVCB') continue;
    const match = /^\d+ (\S+)(.*)$/.exec(entry.value);
    if (!match) continue;
    const [, target, params] = match;
    const port = /\bport=(\d+)/.exec(params)?.[1];
    const ip = /\bipv4hint=([\d.]+)/.exec(params)?.[1];
    if (target !== '.' && !domain) domain = target;
    if (ip && port && !pubkyAddress) pubkyAddress = `${ip}:${port}`;
  }
  return { domain, pubkyAddress };
}
