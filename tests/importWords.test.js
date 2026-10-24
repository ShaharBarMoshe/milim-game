// Test plan: uploading a file of words (detectKind, importWords, WordLibrary.importFile).
// - detectKind: a file of Hebrew–Hebrew pairs becomes a Hebrew–Hebrew list only when most lines are, so a
//   normal English–Hebrew file (or an empty one) stays English–Hebrew.
// - importWords reads files made by hand, in Excel or on a phone: every separator, Windows/old-Mac line
//   ends, a BOM, comments, blank lines, quoted cells and either word order. A header row is dropped
//   silently; any other bad line is reported with its line number, the trimmed text and why
//   (checkPair's message, or "Not a word pair"). Duplicates are skipped, inside the file and against the
//   words already in the list, since two right answers would break a balloon wave.
// - WordLibrary.importFile turns a file into a new, selected, saved list named after the file, and never
//   creates an unplayable list (fewer than 2 pairs) or throws on blocked storage.
import { describe, it, expect } from 'vitest';
import { KINDS, LIBRARY_KEY, WordLibrary, detectKind, importWords } from '../src/wordLists.js';
import { memoryStorage, throwingStorage } from './helpers.js';

const DOG = { en: 'dog', he: 'כלב' };
const CAT = { en: 'cat', he: 'חתול' };

describe('detectKind()', () => {
  it('reads an English–Hebrew file as English–Hebrew', () => {
    expect(detectKind('dog,כלב\ncat,חתול')).toBe(KINDS.EN_HE);
  });

  it('reads a file of Hebrew pairs as Hebrew–Hebrew', () => {
    expect(detectKind('גדול,קטן\nחם,קר\nיום,לילה')).toBe(KINDS.HE_HE);
  });

  it('needs more than half of the lines to be Hebrew–Hebrew', () => {
    expect(detectKind('גדול,קטן\nחם,קר\ndog,כלב\ncat,חתול')).toBe(KINDS.EN_HE);
    expect(detectKind('גדול,קטן\nחם,קר\ndog,כלב')).toBe(KINDS.HE_HE);
  });

  it('ignores blank lines and comments', () => {
    expect(detectKind('# opposites\n\nגדול,קטן\n# more\nחם,קר\n\n')).toBe(KINDS.HE_HE);
  });

  it('treats an empty file as English–Hebrew', () => {
    expect(detectKind('')).toBe(KINDS.EN_HE);
    expect(detectKind('\n# nothing\n')).toBe(KINDS.EN_HE);
  });
});

describe('importWords()', () => {
  it.each([
    ['comma', 'dog,כלב'],
    ['tab', 'dog\tכלב'],
    ['spaced hyphen', 'dog - כלב'],
    ['hyphen', 'dog-כלב'],
    ['en dash', 'dog–כלב'],
    ['em dash', 'dog—כלב'],
    ['colon', 'dog: כלב'],
    ['equals', 'dog = כלב'],
    ['semicolon', 'dog;כלב'],
  ])('splits a pair on a %s', (_, line) => {
    expect(importWords(line)).toEqual({ pairs: [DOG], skipped: [] });
  });

  it('keeps a hyphen inside a word when the separator is " - " or a tab', () => {
    expect(importWords('ice-cream - גלידה\nx-ray\tרנטגן').pairs).toEqual([
      { en: 'ice-cream', he: 'גלידה' },
      { en: 'x-ray', he: 'רנטגן' },
    ]);
  });

  it('accepts the Hebrew word first', () => {
    expect(importWords('כלב,dog\nחתול - cat').pairs).toEqual([DOG, CAT]);
  });

  it('handles Windows, Unix and old Mac line ends', () => {
    for (const nl of ['\r\n', '\n', '\r']) expect(importWords(`dog,כלב${nl}cat,חתול${nl}`).pairs).toEqual([DOG, CAT]);
  });

  it('strips a byte order mark', () => {
    expect(importWords('﻿dog,כלב\ncat,חתול').pairs).toEqual([DOG, CAT]);
  });

  it('ignores blank lines and # comments', () => {
    expect(importWords('# animals\n\ndog,כלב\n   \n# cats\ncat,חתול\n')).toEqual({ pairs: [DOG, CAT], skipped: [] });
  });

  it('trims spaces and strips one pair of quotes around each word', () => {
    expect(importWords('  "dog" , "כלב"  \n\'cat\',\'חתול\'\n"good morning","בוקר טוב"').pairs).toEqual([
      DOG,
      CAT,
      { en: 'good morning', he: 'בוקר טוב' },
    ]);
  });

  it('drops a header row silently', () => {
    for (const header of ['English,Hebrew', 'word,translation', 'אנגלית,עברית', 'Word;Translation', '"English","Hebrew"']) {
      expect(importWords(`${header}\ndog,כלב\ncat,חתול`)).toEqual({ pairs: [DOG, CAT], skipped: [] });
    }
  });

  it('drops a header after leading comments and blank lines', () => {
    expect(importWords('# my list\n\nEnglish,Hebrew\ndog,כלב')).toEqual({ pairs: [DOG], skipped: [] });
  });

  it('reports a bad first line that is not a header', () => {
    expect(importWords('hello\ndog,כלב')).toEqual({
      pairs: [DOG],
      skipped: [{ line: 1, text: 'hello', error: 'Not a word pair' }],
    });
  });

  it('only drops a header on the first line, not later', () => {
    const { skipped } = importWords('dog,כלב\nEnglish,Hebrew');
    expect(skipped).toEqual([{ line: 2, text: 'English,Hebrew', error: 'Not a word pair' }]);
  });

  it('reports lines that are not a word pair, with their line numbers and trimmed text', () => {
    const { pairs, skipped } = importWords('dog,כלב\n\n  just words  \ndog,cat\nכלב,חתול\ncat,חתול');
    expect(pairs).toEqual([DOG, CAT]);
    expect(skipped).toEqual([
      { line: 3, text: 'just words', error: 'Not a word pair' },
      { line: 4, text: 'dog,cat', error: 'Not a word pair' },
      { line: 5, text: 'כלב,חתול', error: 'Not a word pair' },
    ]);
  });

  it('gives checkPair\'s reason for an invalid word', () => {
    const long = 'a'.repeat(31);
    const { pairs, skipped } = importWords(`${long},כלב\ncat,חתול`);
    expect(pairs).toEqual([CAT]);
    expect(skipped).toEqual([{ line: 1, text: `${long},כלב`, error: 'Keep it under 30 letters' }]);
  });

  it('skips duplicates inside the file', () => {
    const { pairs, skipped } = importWords('dog,כלב\nDog,כלבלב\ncat,כלב');
    expect(pairs).toEqual([DOG]);
    expect(skipped).toEqual([
      { line: 2, text: 'Dog,כלבלב', error: '"Dog" is already in this list' },
      { line: 3, text: 'cat,כלב', error: '"כלב" is already in this list' },
    ]);
  });

  it('skips words already in the list', () => {
    const { pairs, skipped } = importWords('dog,כלב\ncat,חתול', KINDS.EN_HE, [DOG]);
    expect(pairs).toEqual([CAT]);
    expect(skipped).toEqual([{ line: 1, text: 'dog,כלב', error: '"dog" is already in this list' }]);
  });

  it('reads Hebrew–Hebrew pairs left to right as first and second word', () => {
    expect(importWords('גדול,קטן\nחם - קר', KINDS.HE_HE).pairs).toEqual([
      { en: 'גדול', he: 'קטן' },
      { en: 'חם', he: 'קר' },
    ]);
  });

  it('applies the Hebrew–Hebrew rules', () => {
    const { pairs, skipped } = importWords('גדול,גדול\ndog,כלב\nחם,קר', KINDS.HE_HE);
    expect(pairs).toEqual([{ en: 'חם', he: 'קר' }]);
    expect(skipped.map((s) => [s.line, s.error])).toEqual([
      [1, 'The two words must be different'],
      [2, expect.any(String)],
    ]);
  });

  it('returns nothing for an empty or missing file', () => {
    expect(importWords('')).toEqual({ pairs: [], skipped: [] });
    expect(importWords(undefined)).toEqual({ pairs: [], skipped: [] });
  });
});

describe('WordLibrary.importFile()', () => {
  it('adds a new list named after the file, selected and saved', () => {
    const storage = memoryStorage();
    const library = WordLibrary.load(storage);
    const before = library.lists.length;
    const result = library.importFile('animals.csv', 'English,Hebrew\ndog,כלב\ncat,חתול\nnope');
    expect(result).toEqual({ ok: true, id: expect.any(String), added: 2, skipped: [{ line: 4, text: 'nope', error: 'Not a word pair' }] });
    expect(library.lists.length).toBe(before + 1);
    const list = library.get(result.id);
    expect(list).toMatchObject({ name: 'animals', kind: KINDS.EN_HE, pairs: [DOG, CAT] });
    expect(library.selectedId).toBe(result.id);

    const again = WordLibrary.load(storage);
    expect(again.get(result.id).pairs).toEqual([DOG, CAT]);
    expect(again.selectedId).toBe(result.id);
  });

  it('only removes the last extension from the name', () => {
    const library = WordLibrary.load(memoryStorage());
    const { id } = library.importFile('week 3.words.txt', 'dog,כלב\ncat,חתול');
    expect(library.get(id).name).toBe('week 3.words');
  });

  it('names a list from a file with no name "Uploaded words"', () => {
    for (const name of ['', '.txt', undefined]) {
      const library = WordLibrary.load(memoryStorage());
      const { id } = library.importFile(name, 'dog,כלב\ncat,חתול');
      expect(library.get(id).name).toBe('Uploaded words');
    }
  });

  it('makes a Hebrew–Hebrew list from a file of Hebrew pairs', () => {
    const library = WordLibrary.load(memoryStorage());
    const { id } = library.importFile('opposites.txt', 'גדול,קטן\nחם,קר');
    expect(library.get(id)).toMatchObject({ kind: KINDS.HE_HE, pairs: [{ en: 'גדול', he: 'קטן' }, { en: 'חם', he: 'קר' }] });
  });

  it('creates nothing from a file with fewer than 2 word pairs', () => {
    const storage = memoryStorage();
    const library = WordLibrary.load(storage);
    library.save();
    const saved = storage.getItem(LIBRARY_KEY);
    const before = library.lists.map((l) => l.id);
    const selected = library.selectedId;
    for (const text of ['', 'dog,כלב', 'dog,כלב\ndog,כלב\nhello']) {
      const result = library.importFile('few.txt', text);
      expect(result).toMatchObject({ ok: false, error: 'The file needs at least 2 word pairs' });
      expect(Array.isArray(result.skipped)).toBe(true);
    }
    expect(library.lists.map((l) => l.id)).toEqual(before);
    expect(library.selectedId).toBe(selected);
    expect(storage.getItem(LIBRARY_KEY)).toBe(saved);
  });

  it('passes on the skipped lines of a file that is too short', () => {
    const result = WordLibrary.load(memoryStorage()).importFile('few.txt', 'dog,כלב\nhello');
    expect(result.skipped).toEqual([{ line: 2, text: 'hello', error: 'Not a word pair' }]);
  });

  it('gives each upload its own list, even with the same file name', () => {
    const library = WordLibrary.load(memoryStorage());
    const a = library.importFile('animals.csv', 'dog,כלב\ncat,חתול');
    const b = library.importFile('animals.csv', 'dog,כלב\ncat,חתול');
    expect(a.id).not.toBe(b.id);
    expect([library.get(a.id).name, library.get(b.id).name]).toEqual(['animals', 'animals 2']);
    expect(library.get(a.id).pairs).toEqual([DOG, CAT]);
    expect(library.get(b.id).pairs).toEqual([DOG, CAT]);
  });

  it('never throws when storage is blocked or missing', () => {
    for (const storage of [throwingStorage(), undefined, null]) {
      const library = WordLibrary.load(storage);
      const result = library.importFile('animals.csv', 'dog,כלב\ncat,חתול');
      expect(result.ok).toBe(true);
      expect(library.get(result.id).pairs).toEqual([DOG, CAT]);
    }
  });
});
