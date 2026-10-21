import { describe, expect, it } from 'vitest';
import { homeserverAddresses, parseSignedRecord } from './pkarr';

const KEY = 'mci4dy8yez5qttyz48yg54gsi8zr6zhcg6znwfiiincy6cu4ijyo';
/** The record of a real homeserver, as its relay served it on 2026-10-21. */
const RECORD = Uint8Array.from(
  atob(
    'ibnnBHf8uaiGdsgpcFEtUbnTqyBDwClrpqN8le6tLTkoq/bIxICDuaWMJMKrXMNhwWVaO+1+RV1s5TcB/OQVBQAGXd0GPJk/AACAAAAAAAMAAAAANG1jaTRkeTh5ZXo1cXR0eXo0OHlnNTRnc2k4enI2emhjZzZ6bndmaWlpbmN5NmN1NGlqeW8AAEEAAQAADhAAEQABAAADAAIYjwAEAAQCHGGfwAwAQQABAAAOEAAaAAoQaG9tZXNlcnZlci10b21vcwVzcGFjZQDADAABAAEAAA4QAAQCHGGf',
  ),
  (c) => c.charCodeAt(0),
);

function packet(records: Uint8Array[]): Uint8Array {
  const header = new Uint8Array(12);
  header[7] = records.length; // ancount
  const body = records.flatMap((r) => Array.from(r));
  return Uint8Array.from([...new Uint8Array(64), ...new Uint8Array(8), ...header, ...body]);
}

/** An answer with an uncompressed root name. */
function answer(type: number, data: number[]): Uint8Array {
  return Uint8Array.from([0, type >> 8, type & 0xff, 0, 1, 0, 0, 0, 60, data.length >> 8, data.length & 0xff, ...data]);
}

describe('parseSignedRecord', () => {
  it('reads a real homeserver record: timestamp, HTTPS records with port and address, A record', () => {
    const record = parseSignedRecord(RECORD, KEY);
    expect(record.publishedAt.toISOString()).toBe('2026-10-15T08:42:14.054Z');
    expect(record.records).toEqual([
      { name: '@', type: 'HTTPS', value: '1 . port=6287 ipv4hint=2.28.97.159', ttl: 3600 },
      { name: '@', type: 'HTTPS', value: '10 homeserver-tomos.space', ttl: 3600 },
      { name: '@', type: 'A', value: '2.28.97.159', ttl: 3600 },
    ]);
    expect(homeserverAddresses(record)).toEqual({ domain: 'homeserver-tomos.space', pubkyAddress: '2.28.97.159:6287' });
  });

  it('finds no addresses in a record without HTTPS records', () => {
    expect(homeserverAddresses({ publishedAt: new Date(0), records: [] })).toEqual({
      domain: null,
      pubkyAddress: null,
    });
  });

  it('spells out AAAA, TXT and CNAME, and leaves other types as hex', () => {
    const aaaa = [0x2a, 0x01, 0x04, 0xf8, 0x0c, 0x17, 0xd1, 0xb0, 0, 0, 0, 0, 0, 0, 0, 1];
    const txt = [5, ...'hello'.split('').map((c) => c.charCodeAt(0)), 1, 33];
    const cname = [3, 119, 119, 119, 0]; // www.
    const { records } = parseSignedRecord(
      packet([answer(28, aaaa), answer(16, txt), answer(5, cname), answer(99, [1, 255])]),
      KEY,
    );
    expect(records.map((r) => [r.type, r.value])).toEqual([
      ['AAAA', '2a01:4f8:c17:d1b0::1'],
      ['TXT', 'hello!'],
      ['CNAME', 'www'],
      ['TYPE99', '01ff'],
    ]);
  });

  it('shows names relative to the key', () => {
    const name = [
      6,
      ...'_pubky'.split('').map((c) => c.charCodeAt(0)),
      KEY.length,
      ...KEY.split('').map((c) => c.charCodeAt(0)),
      0,
    ];
    const rr = Uint8Array.from([...name, 0, 16, 0, 1, 0, 0, 0, 60, 0, 2, 1, 120]);
    expect(parseSignedRecord(packet([rr]), KEY).records).toEqual([
      { name: '_pubky', type: 'TXT', value: 'x', ttl: 60 },
    ]);
  });

  it('rejects something that is not a signed packet', () => {
    expect(() => parseSignedRecord(new Uint8Array(10), KEY)).toThrow('too short');
  });
});
