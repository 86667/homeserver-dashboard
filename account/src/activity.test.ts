import { describe, expect, it } from 'vitest';
import { groupBursts, parseEventStream, parseFeed, summarizeActivity } from './activity';

const A = 'whgxto9xtroaih7ict9chtuxh1xmbpmci5qd71jsen3ow3bscipy';
const B = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

const FEED = [
  `PUT pubky://${A}/pub/pubky.app/profile.json`,
  `PUT pubky://${A}/pub/pubky.app/posts/1`,
  `PUT pubky://${B}/pub/site/index.html`,
  `DEL pubky://${A}/pub/pubky.app/posts/1`,
  `PUT pubky://${A}/pub/hello.txt`,
  'cursor: 42',
].join('\n');

describe('parseFeed', () => {
  it('reads events and the cursor, skipping what it does not understand', () => {
    const { events, cursor } = parseFeed(`${FEED}\nGET nonsense\n\n`);
    expect(cursor).toBe('42');
    expect(events.map((e) => `${e.kind} ${e.pubky.slice(0, 4)} ${e.app}|${e.path}`)).toEqual([
      'PUT whgx pubky.app|pubky.app/profile.json',
      'PUT whgx pubky.app|pubky.app/posts/1',
      'PUT o1gg site|site/index.html',
      'DEL whgx pubky.app|pubky.app/posts/1',
      'PUT whgx |hello.txt',
    ]);
    expect(events[0].url).toBe(`pubky://${A}/pub/pubky.app/profile.json`);
  });

  it('has no cursor for an empty page', () => {
    expect(parseFeed('')).toEqual({ events: [], cursor: null });
  });
});

describe('groupBursts', () => {
  it('groups consecutive changes by person and app, newest first', () => {
    const bursts = groupBursts(parseFeed(FEED).events, 100);
    expect(bursts.map((b) => [b.id, b.pubky.slice(0, 4), b.app, b.written, b.removed])).toEqual([
      [104, 'whgx', '', 1, 0],
      [103, 'whgx', 'pubky.app', 0, 1],
      [102, 'o1gg', 'site', 1, 0],
      [101, 'whgx', 'pubky.app', 2, 0],
    ]);
    expect(bursts[3].events.map((e) => e.path)).toEqual(['pubky.app/posts/1', 'pubky.app/profile.json']);
  });
});

describe('summarizeActivity', () => {
  it('counts changes per person, most recently active first, and per app', () => {
    expect(summarizeActivity(parseFeed(FEED).events)).toEqual({
      people: [
        { pubky: A, changes: 4 },
        { pubky: B, changes: 1 },
      ],
      apps: [
        { app: 'pubky.app', changes: 3 },
        { app: 'site', changes: 1 },
        { app: '', changes: 1 },
      ],
    });
  });
});

describe('parseEventStream', () => {
  it('reads SSE blocks into events, with the last cursor', () => {
    const text = [
      'event: PUT',
      `data: pubky://${A}/pub/site/try.html`,
      'data: cursor: 206',
      'data: content_hash: Wxt2cfTRtTvRTMMs5DR/9EhV0pRdct3yrl/fTo1v+oU=',
      '',
      'event: DEL',
      `data: pubky://${A}/pub/site/old.html`,
      'data: cursor: 205',
      '',
      ': a comment',
      '',
    ].join('\n');
    const { events, cursor } = parseEventStream(text);
    expect(cursor).toBe('205');
    expect(events.map((e) => `${e.kind} ${e.app}|${e.path}`)).toEqual([
      'PUT site|site/try.html',
      'DEL site|site/old.html',
    ]);
  });

  it('is empty for an empty stream', () => {
    expect(parseEventStream('')).toEqual({ events: [], cursor: null });
  });
});
