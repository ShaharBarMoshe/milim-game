// Test plan: word lists as JSON files (src/listFile.js).
// - Happy flows: a list exports to the documented file shape; the file read back gives the same name,
//   kind and words; the message sent with the file, and the WhatsApp / email fallback links (no share link).
// - Errors follow one rule, for export and import alike: a bad row is skipped (and reported with its row
//   number and reason), the rest go through; the action is blocked only when no row is valid.
//   Covered: wrong types, missing fields, too long, duplicates, wrong language, reversed order (accepted),
//   all rows bad, files that aren't word lists, broken JSON, a BOM, Hebrew–Hebrew detection.
// - listFileName makes a safe file name from any list name.
import { describe, it, expect } from 'vitest';
import {
  LIST_FILE_VERSION, MAX_FILE_BYTES, fallbackShareUrl, listFileName, parseListFile, shareMessage, toListFile,
} from '../src/listFile.js';
import { KINDS } from '../src/wordLists.js';

const ANIMALS = { name: 'animals', kind: KINDS.EN_HE, pairs: [{ en: 'dog', he: 'כלב' }, { en: 'cat', he: 'חתול' }, { en: 'sun', he: 'שמש' }] };
const OPPOSITES = { name: 'הפכים', kind: KINDS.HE_HE, pairs: [{ en: 'גדול', he: 'קטן' }, { en: 'חם', he: 'קר' }] };

describe('constants', () => {
  it('has a file version and a 1 MB limit', () => {
    expect(LIST_FILE_VERSION).toBe(1);
    expect(MAX_FILE_BYTES).toBe(1048576);
  });
});

describe('toListFile() (export)', () => {
  it('writes the list as a milim file', () => {
    expect(toListFile(ANIMALS)).toEqual({
      ok: true,
      file: { app: 'milim', version: 1, name: 'animals', kind: 'en-he', words: ANIMALS.pairs },
      skipped: [],
    });
  });

  it('keeps a Hebrew–Hebrew list Hebrew–Hebrew', () => {
    const { ok, file } = toListFile(OPPOSITES);
    expect(ok).toBe(true);
    expect(file.kind).toBe('he-he');
    expect(file.words).toEqual(OPPOSITES.pairs);
  });

  it('skips only the bad rows, and says which and why', () => {
    const list = {
      name: 'mixed',
      kind: KINDS.EN_HE,
      pairs: [{ en: 'dog', he: 'כלב' }, { en: 'dog', he: 'כלבלב' }, { en: 'x'.repeat(31), he: 'ארוך' }, { en: 'cat', he: 'חתול' }],
    };
    const result = toListFile(list);
    expect(result.ok).toBe(true);
    expect(result.file.words).toEqual([{ en: 'dog', he: 'כלב' }, { en: 'cat', he: 'חתול' }]);
    expect(result.skipped).toEqual([
      { row: 2, pair: { en: 'dog', he: 'כלבלב' }, error: '"dog" is already in this list' },
      { row: 3, pair: { en: 'x'.repeat(31), he: 'ארוך' }, error: 'Keep it under 30 letters' },
    ]);
  });

  it('is blocked only when no word is valid', () => {
    const result = toListFile({ name: 'bad', kind: KINDS.EN_HE, pairs: [{ en: 'כלב', he: 'כלב' }, { en: '', he: 'חתול' }] });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('This list has no valid words to share');
    expect(result.skipped).toHaveLength(2);
    expect(toListFile({ name: 'empty', kind: KINDS.EN_HE, pairs: [] })).toMatchObject({ ok: false, error: 'This list has no valid words to share' });
  });
});

describe('listFileName()', () => {
  it.each([
    ['animals', 'animals.json'],
    ['  my words  ', 'my-words.json'],
    ['a/b\\c:d*e?f"g<h>i|j', 'a-b-c-d-e-f-g-h-i-j.json'],
    ['הפכים', 'הפכים.json'],
    ['', 'word-list.json'],
    ['   ', 'word-list.json'],
  ])('%j -> %j', (name, file) => {
    expect(listFileName(name)).toBe(file);
  });

  it('replaces control characters', () => {
    expect(listFileName('a\u0001b')).toBe('a-b.json');
  });

  it('keeps names to 60 characters before .json', () => {
    const file = listFileName('w'.repeat(100));
    expect(file).toBe(`${'w'.repeat(60)}.json`);
  });
});

describe('parseListFile() (import)', () => {
  it('reads back what toListFile wrote (round trip)', () => {
    for (const list of [ANIMALS, OPPOSITES]) {
      const text = JSON.stringify(toListFile(list).file, null, 2);
      expect(parseListFile(text)).toEqual({ ok: true, list: { name: list.name, kind: list.kind, pairs: list.pairs }, skipped: [] });
    }
  });

  it('accepts { pairs }, a bare array, and [en, he] rows', () => {
    expect(parseListFile(JSON.stringify({ name: 'p', pairs: ANIMALS.pairs })).list.pairs).toEqual(ANIMALS.pairs);
    expect(parseListFile(JSON.stringify(ANIMALS.pairs)).list.pairs).toEqual(ANIMALS.pairs);
    expect(parseListFile(JSON.stringify([['dog', 'כלב'], ['cat', 'חתול']])).list.pairs).toEqual(ANIMALS.pairs.slice(0, 2));
  });

  it('names the list from the file, else from the fallback', () => {
    expect(parseListFile(JSON.stringify({ name: '  zoo  ', words: ANIMALS.pairs })).list.name).toBe('zoo');
    expect(parseListFile(JSON.stringify(ANIMALS.pairs), 'from-file').list.name).toBe('from-file');
    expect(parseListFile(JSON.stringify(ANIMALS.pairs)).list.name).toBe('Shared words');
  });

  it('strips a BOM', () => {
    expect(parseListFile(`﻿${JSON.stringify({ words: ANIMALS.pairs })}`).ok).toBe(true);
  });

  it('accepts English–Hebrew rows in either order', () => {
    const { ok, list, skipped } = parseListFile(JSON.stringify({ words: [{ en: 'כלב', he: 'dog' }, ['חתול', 'cat']] }));
    expect(ok).toBe(true);
    expect(list.pairs).toEqual([{ en: 'dog', he: 'כלב' }, { en: 'cat', he: 'חתול' }]);
    expect(skipped).toEqual([]);
  });

  it('works out the kind when the file has none', () => {
    expect(parseListFile(JSON.stringify([['גדול', 'קטן'], ['חם', 'קר']])).list.kind).toBe('he-he');
    expect(parseListFile(JSON.stringify([['dog', 'כלב'], ['cat', 'חתול']])).list.kind).toBe('en-he');
    // One English row makes it an English–Hebrew list.
    expect(parseListFile(JSON.stringify([['גדול', 'קטן'], ['dog', 'כלב']])).list.kind).toBe('en-he');
    // A valid kind in the file wins; an unknown one is worked out.
    expect(parseListFile(JSON.stringify({ kind: 'he-he', words: [['גדול', 'קטן'], ['חם', 'קר']] })).list.kind).toBe('he-he');
    expect(parseListFile(JSON.stringify({ kind: 'zz', words: [['גדול', 'קטן'], ['חם', 'קר']] })).list.kind).toBe('he-he');
  });

  it('skips only the bad rows, and reports each with its row number', () => {
    const words = [
      { en: 'dog', he: 'כלב' }, // 1 ok
      { en: 'dog', he: 'כלבלב' }, // 2 duplicate
      { en: 42, he: 'מספר' }, // 3 wrong type
      { en: 'cat' }, // 4 missing field
      'just a string', // 5 not a pair
      null, // 6
      { en: 'x'.repeat(31), he: 'ארוך' }, // 7 too long
      ['cat', 'חתול'], // 8 ok
      { en: 'sun', he: 'moon' }, // 9 wrong language
      ['a', 'b', 'c'], // 10 not a pair
      { en: 'שמש', he: 'sun' }, // 11 ok, reversed
    ];
    const { ok, list, skipped } = parseListFile(JSON.stringify({ name: 'mixed', words }));
    expect(ok).toBe(true);
    expect(list.pairs).toEqual([{ en: 'dog', he: 'כלב' }, { en: 'cat', he: 'חתול' }, { en: 'sun', he: 'שמש' }]);
    expect(skipped.map((s) => s.row)).toEqual([2, 3, 4, 5, 6, 7, 9, 10]);
    const byRow = Object.fromEntries(skipped.map((s) => [s.row, s]));
    expect(byRow[2].error).toBe('"dog" is already in this list');
    expect(byRow[3].error).toBe('Not a word pair');
    expect(byRow[4].error).toBe('Not a word pair');
    expect(byRow[5].error).toBe('Not a word pair');
    expect(byRow[7].error).toBe('Keep it under 30 letters');
    expect(byRow[9].error).toBeTruthy();
    expect(byRow[2].text).toBe(JSON.stringify(words[1]));
    expect(byRow[5].text).toBe('"just a string"');
  });

  it('cuts the reported row text to 60 characters', () => {
    const long = { en: 'y'.repeat(80), he: 'ארוך' };
    const { skipped } = parseListFile(JSON.stringify([long, ['dog', 'כלב']]));
    expect(skipped[0].row).toBe(1);
    expect(skipped[0].text.length).toBeLessThanOrEqual(60);
    expect(JSON.stringify(long).startsWith(skipped[0].text.replace(/…$/, ''))).toBe(true);
  });

  it('blocks the import only when no row is valid', () => {
    const result = parseListFile(JSON.stringify({ words: [{ en: 42 }, ['sun', 'moon'], 'x'] }));
    expect(result).toMatchObject({ ok: false, error: 'No valid words in this file' });
    expect(result.skipped.map((s) => s.row)).toEqual([1, 2, 3]);
    expect(parseListFile(JSON.stringify({ words: [] }))).toMatchObject({ ok: false, error: 'No valid words in this file' });
  });

  it('takes a single valid row (blocking is only for none)', () => {
    const result = parseListFile(JSON.stringify([['dog', 'כלב'], ['bad']]));
    expect(result.ok).toBe(true);
    expect(result.list.pairs).toEqual([{ en: 'dog', he: 'כלב' }]);
  });

  it.each([
    ['broken JSON', '{"words": [ '],
    ['empty text', ''],
    ['a number', '42'],
    ['a string', '"words"'],
    ['null', 'null'],
    ['an object without words', '{"name": "x", "list": []}'],
    ['words that is not an array', '{"words": "dog,כלב"}'],
  ])('rejects %s as not a word list, without throwing', (_, text) => {
    expect(parseListFile(text)).toEqual({ ok: false, error: 'This is not a word list file', skipped: [] });
  });

  it('never throws on junk input', () => {
    for (const junk of [undefined, null, 5, {}, []]) expect(() => parseListFile(junk)).not.toThrow();
  });
});

describe('sharing the file', () => {
  const { file } = toListFile(ANIMALS);

  it('writes a message that names the list, its size and the attached file, with no link', () => {
    const message = shareMessage(file, 'animals.json');
    expect(message).toBe('Milim word list "animals" (3 words) is in the attached file animals.json. Open the game, choose 📂 Upload list and pick the file.');
    expect(message).not.toMatch(/https?:|#list=/);
  });

  it('opens WhatsApp with the message where the browser cannot share files', () => {
    const url = fallbackShareUrl('whatsapp', file, 'animals.json');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url.slice('https://wa.me/?text='.length))).toBe(shareMessage(file, 'animals.json'));
  });

  it('opens an email with the list name as subject and the message as body', () => {
    const url = new URL(fallbackShareUrl('email', file, 'animals.json'));
    expect(url.protocol).toBe('mailto:');
    expect(url.searchParams.get('subject')).toBe('Milim word list: animals');
    expect(url.searchParams.get('body')).toBe(shareMessage(file, 'animals.json'));
  });

  it('keeps Hebrew names readable', () => {
    const { file: hebrew } = toListFile(OPPOSITES);
    expect(new URL(fallbackShareUrl('email', hebrew, 'הפכים.json')).searchParams.get('subject')).toBe('Milim word list: הפכים');
  });
});
