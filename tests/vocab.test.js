import { describe, it, expect } from 'vitest';
import {
  SAMPLE_PAIRS,
  parseWordList,
  serializeWordList,
  loadWordList,
  saveWordList,
  STORAGE_KEY,
} from '../src/vocab.js';
import { memoryStorage, throwingStorage, HEBREW_RE, LATIN_RE } from './helpers.js';

const pairsOf = (text) => parseWordList(text).pairs.map(({ en, he }) => ({ en, he }));

describe('parseWordList: separators', () => {
  const cases = [
    ['tab', 'dog\tכלב'],
    ['spaced hyphen', 'dog - כלב'],
    ['bare hyphen', 'dog-כלב'],
    ['en dash', 'dog – כלב'],
    ['en dash unspaced', 'dog–כלב'],
    ['em dash', 'dog — כלב'],
    ['em dash unspaced', 'dog—כלב'],
    ['comma', 'dog, כלב'],
    ['comma unspaced', 'dog,כלב'],
    ['colon', 'dog: כלב'],
    ['colon unspaced', 'dog:כלב'],
    ['equals', 'dog = כלב'],
    ['equals unspaced', 'dog=כלב'],
  ];
  for (const [name, line] of cases) {
    it(`accepts ${name} separator`, () => {
      const { pairs, errors } = parseWordList(line);
      expect(errors).toEqual([]);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].en).toBe('dog');
      expect(pairs[0].he).toBe('כלב');
    });
  }

  it('handles several separators in one list', () => {
    const text = ['dog - כלב', 'cat\tחתול', 'house: בית', 'sun = שמש', 'moon, ירח', 'tree — עץ'].join('\n');
    const { pairs, errors } = parseWordList(text);
    expect(errors).toEqual([]);
    expect(pairs.map((p) => p.en)).toEqual(['dog', 'cat', 'house', 'sun', 'moon', 'tree']);
    expect(pairs.map((p) => p.he)).toEqual(['כלב', 'חתול', 'בית', 'שמש', 'ירח', 'עץ']);
  });

  it('keeps multi-word sides intact', () => {
    expect(pairsOf('ice cream - גלידה טעימה')).toEqual([{ en: 'ice cream', he: 'גלידה טעימה' }]);
  });

  it('handles Windows line endings', () => {
    const { pairs, errors } = parseWordList('dog - כלב\r\ncat - חתול\r\n');
    expect(errors).toEqual([]);
    expect(pairs.map(({ en, he }) => ({ en, he }))).toEqual([
      { en: 'dog', he: 'כלב' },
      { en: 'cat', he: 'חתול' },
    ]);
  });
});

describe('parseWordList: whitespace, blanks and comments', () => {
  it('trims whitespace around the line and each side', () => {
    expect(pairsOf('   dog   -   כלב   ')).toEqual([{ en: 'dog', he: 'כלב' }]);
    expect(pairsOf('\t cat :  חתול \t')).toEqual([{ en: 'cat', he: 'חתול' }]);
  });

  it('skips blank and whitespace-only lines without reporting errors', () => {
    const { pairs, errors } = parseWordList('\n\ndog - כלב\n   \n\t\ncat - חתול\n\n');
    expect(errors).toEqual([]);
    expect(pairs).toHaveLength(2);
  });

  it("skips lines starting with '#' (also after leading whitespace)", () => {
    const { pairs, errors } = parseWordList('# animals\ndog - כלב\n   # comment - הערה\ncat - חתול');
    expect(errors).toEqual([]);
    expect(pairs.map((p) => p.en)).toEqual(['dog', 'cat']);
  });

  it('returns empty results for empty input', () => {
    expect(parseWordList('')).toEqual({ pairs: [], errors: [] });
  });
});

describe('parseWordList: auto-swap', () => {
  it('swaps when Hebrew is on the left', () => {
    expect(pairsOf('כלב - dog')).toEqual([{ en: 'dog', he: 'כלב' }]);
    expect(pairsOf('חתול\tcat')).toEqual([{ en: 'cat', he: 'חתול' }]);
    expect(pairsOf('בית = House')).toEqual([{ en: 'House', he: 'בית' }]);
  });

  it('mixes swapped and normal lines', () => {
    expect(pairsOf('dog - כלב\nחתול - cat')).toEqual([
      { en: 'dog', he: 'כלב' },
      { en: 'cat', he: 'חתול' },
    ]);
  });
});

describe('parseWordList: invalid lines', () => {
  it('reports lines missing a side with 1-based line numbers and original text', () => {
    const text = 'dog - כלב\nhello\ncat - חתול\nbird -\n- ציפור';
    const { pairs, errors } = parseWordList(text);
    expect(pairs.map((p) => p.en)).toEqual(['dog', 'cat']);
    expect(errors.map((e) => e.line)).toEqual([2, 4, 5]);
    expect(errors.map((e) => e.text.trim())).toEqual(['hello', 'bird -', '- ציפור']);
  });

  it('reports a line with English on both sides', () => {
    const { pairs, errors } = parseWordList('dog - cat');
    expect(pairs).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(1);
    expect(errors[0].text.trim()).toBe('dog - cat');
  });

  it('reports a line with Hebrew on both sides', () => {
    const { pairs, errors } = parseWordList('כלב - חתול');
    expect(pairs).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ line: 1 })]);
  });

  it('reports a Hebrew-only line with no separator', () => {
    const { errors } = parseWordList('כלב');
    expect(errors).toEqual([expect.objectContaining({ line: 1 })]);
    expect(errors[0].text.trim()).toBe('כלב');
  });

  it('counts blank and comment lines when numbering errors', () => {
    const { errors } = parseWordList('# header\n\ndog - כלב\n\nbad line\n');
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(5);
    expect(errors[0].text.trim()).toBe('bad line');
  });

  it('keeps the original text of the bad line (not normalised)', () => {
    const { errors } = parseWordList('dog - כלב\nApple = Banana');
    expect(errors).toEqual([expect.objectContaining({ line: 2 })]);
    expect(errors[0].text.trim()).toBe('Apple = Banana');
  });
});

describe('parseWordList: duplicates and casing', () => {
  it('keeps the original casing of en', () => {
    expect(pairsOf('Dog - כלב\nNEW YORK - ניו יורק')).toEqual([
      { en: 'Dog', he: 'כלב' },
      { en: 'NEW YORK', he: 'ניו יורק' },
    ]);
  });

  it('drops duplicates silently, case-insensitively on en, keeping the first', () => {
    const { pairs, errors } = parseWordList('Dog - כלב\ndog - כלב\nDOG - כלב\ncat - חתול\ncat - חתול');
    expect(errors).toEqual([]);
    expect(pairs.map(({ en, he }) => ({ en, he }))).toEqual([
      { en: 'Dog', he: 'כלב' },
      { en: 'cat', he: 'חתול' },
    ]);
  });

  it('treats a swapped duplicate as a duplicate', () => {
    const { pairs, errors } = parseWordList('dog - כלב\nכלב - dog');
    expect(errors).toEqual([]);
    expect(pairs).toHaveLength(1);
  });

  it('keeps pairs that share only one side', () => {
    const { pairs } = parseWordList('dog - כלב\ndog - כלבלב\npuppy - כלבלב');
    expect(pairs).toHaveLength(3);
  });
});

describe('serializeWordList', () => {
  it('produces "en - he" lines', () => {
    const text = serializeWordList([
      { en: 'dog', he: 'כלב' },
      { en: 'cat', he: 'חתול' },
    ]);
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    expect(lines).toEqual(['dog - כלב', 'cat - חתול']);
  });

  it('round-trips through parseWordList', () => {
    const pairs = [
      { en: 'Dog', he: 'כלב' },
      { en: 'ice cream', he: 'גלידה' },
      { en: 'good morning', he: 'בוקר טוב' },
      { en: 'sun', he: 'שמש' },
    ];
    const { pairs: back, errors } = parseWordList(serializeWordList(pairs));
    expect(errors).toEqual([]);
    expect(back.map(({ en, he }) => ({ en, he }))).toEqual(pairs);
  });

  it('round-trips SAMPLE_PAIRS', () => {
    const { pairs, errors } = parseWordList(serializeWordList(SAMPLE_PAIRS));
    expect(errors).toEqual([]);
    expect(pairs.map(({ en, he }) => ({ en, he }))).toEqual(SAMPLE_PAIRS.map(({ en, he }) => ({ en, he })));
  });

  it('serializes an empty list to an empty/blank string', () => {
    expect(serializeWordList([]).trim()).toBe('');
  });
});

describe('SAMPLE_PAIRS', () => {
  it('has at least 4 pairs', () => {
    expect(Array.isArray(SAMPLE_PAIRS)).toBe(true);
    expect(SAMPLE_PAIRS.length).toBeGreaterThanOrEqual(4);
  });

  it('every pair has Latin en and Hebrew he', () => {
    for (const p of SAMPLE_PAIRS) {
      expect(typeof p.en).toBe('string');
      expect(typeof p.he).toBe('string');
      expect(p.en).toMatch(LATIN_RE);
      expect(p.en).not.toMatch(HEBREW_RE);
      expect(p.he).toMatch(HEBREW_RE);
      expect(p.he).not.toMatch(LATIN_RE);
    }
  });

  it('has no duplicates', () => {
    const ens = SAMPLE_PAIRS.map((p) => p.en.toLowerCase());
    const hes = SAMPLE_PAIRS.map((p) => p.he);
    expect(new Set(ens).size).toBe(ens.length);
    expect(new Set(hes).size).toBe(hes.length);
  });
});

describe('loadWordList / saveWordList', () => {
  it('uses the documented STORAGE_KEY', () => {
    expect(STORAGE_KEY).toBe('balloon-archer-words');
  });

  it('returns null when nothing is stored', () => {
    expect(loadWordList(memoryStorage())).toBeNull();
  });

  it('saves under STORAGE_KEY and loads it back', () => {
    const storage = memoryStorage();
    const text = 'dog - כלב\ncat - חתול';
    saveWordList(text, storage);
    expect(storage.getItem(STORAGE_KEY)).toBe(text);
    expect(loadWordList(storage)).toBe(text);
  });

  it('loads a value stored directly under STORAGE_KEY', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: 'sun - שמש' });
    expect(loadWordList(storage)).toBe('sun - שמש');
  });

  it('ignores other keys', () => {
    expect(loadWordList(memoryStorage({ other: 'x' }))).toBeNull();
  });

  it('never throws when storage methods throw', () => {
    const storage = throwingStorage();
    expect(() => saveWordList('dog - כלב', storage)).not.toThrow();
    let result;
    expect(() => {
      result = loadWordList(storage);
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it('never throws with undefined or null storage', () => {
    expect(() => saveWordList('dog - כלב', undefined)).not.toThrow();
    expect(() => saveWordList('dog - כלב', null)).not.toThrow();
    expect(loadWordList(undefined) ?? null).toBeNull();
    expect(loadWordList(null)).toBeNull();
  });

  it('never throws with the default storage in Node', () => {
    expect(() => loadWordList()).not.toThrow();
    expect(() => saveWordList('x - י')).not.toThrow();
  });
});
