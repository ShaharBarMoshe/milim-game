import { describe, it, expect } from 'vitest';
import {
  successRate,
  spellingWord,
  pickSpellingPairs,
  letterChoices,
  SpellingRun,
  typedLetter,
  spellingTarget,
} from '../src/spelling.js';
import { mulberry32 } from './helpers.js';

const stats = (correct, wrong = 0, missed = 0) => ({ correct, wrong, missed });

describe('successRate', () => {
  it('counts escaped waves as failures', () => {
    expect(successRate(stats(9, 1))).toBe(90);
    expect(successRate(stats(9, 0, 1))).toBe(90);
    expect(successRate(stats(8, 0, 2))).toBe(80);
    expect(successRate(stats(10))).toBe(100);
  });

  it('is 0% before any question', () => {
    expect(successRate(stats(0))).toBe(0);
  });
});

describe('spellingWord', () => {
  it('lower-cases and trims plain words', () => {
    expect(spellingWord('  Dog ')).toBe('dog');
  });

  it.each(['good morning', 'x-ray', 'café', 'r2d2', '', 'a', 'encyclopedias'])('rejects %j', (en) => {
    expect(spellingWord(en)).toBeNull();
  });

  it('accepts 2 to 12 letters', () => {
    expect(spellingWord('go')).toBe('go');
    expect(spellingWord('elephants')).toBe('elephants');
    expect(spellingWord('thanksgiving')).toBe('thanksgiving');
  });

  it('spells Hebrew words without vowel marks', () => {
    expect(spellingWord(' קטן ', 'he')).toBe('קטן');
    expect(spellingWord('dog', 'he')).toBeNull();
    expect(spellingWord('בוקר טוב', 'he')).toBeNull();
    expect(spellingWord('שָׁלוֹם', 'he')).toBeNull();
  });
});

describe('pickSpellingPairs', () => {
  const pairs = [
    { en: 'dog', he: 'כלב' },
    { en: 'good morning', he: 'בוקר טוב' },
    { en: 'Dog', he: 'כלבלב' },
    { en: 'cat', he: 'חתול' },
    { en: 'sun', he: 'שמש' },
  ];

  it('keeps only spellable words, one per spelling', () => {
    const picked = pickSpellingPairs(pairs, 10, mulberry32(1));
    expect(picked.map((p) => p.en.toLowerCase()).sort()).toEqual(['cat', 'dog', 'sun']);
  });

  it('returns at most `count` pairs', () => {
    expect(pickSpellingPairs(pairs, 2, mulberry32(2))).toHaveLength(2);
  });

  it('is deterministic for a seed and does not mutate the input', () => {
    const copy = structuredClone(pairs);
    expect(pickSpellingPairs(pairs, 3, mulberry32(7))).toEqual(pickSpellingPairs(pairs, 3, mulberry32(7)));
    expect(pairs).toEqual(copy);
  });
});

describe('letterChoices', () => {
  it('has `count` different lower-case letters including the answer once', () => {
    const random = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const answer = 'abcdefghijklmnopqrstuvwxyz'[i % 26];
      const letters = letterChoices(answer, 3, random);
      expect(letters).toHaveLength(3);
      expect(new Set(letters).size).toBe(3);
      expect(letters.filter((l) => l === answer)).toHaveLength(1);
      letters.forEach((l) => expect(l).toMatch(/^[a-z]$/));
    }
  });

  it('puts the answer in different positions', () => {
    const random = mulberry32(4);
    const positions = new Set();
    for (let i = 0; i < 60; i++) positions.add(letterChoices('d', 3, random).indexOf('d'));
    expect(positions).toEqual(new Set([0, 1, 2]));
  });
});

describe('SpellingRun', () => {
  const run = () => new SpellingRun({ en: 'Dog', he: 'כלב' }, { choices: 3, random: mulberry32(5) });

  it('has one column per letter, each offering its letter', () => {
    const r = run();
    expect(r.word).toBe('dog');
    expect(r.columns.map((c) => c.answer)).toEqual(['d', 'o', 'g']);
    r.columns.forEach((c) => expect(c.letters).toContain(c.answer));
  });

  it('spells the word letter by letter', () => {
    const r = run();
    expect(r.progress()).toBe('___');
    expect(r.jump('d')).toEqual({ correct: true, done: false });
    expect(r.jump('o')).toEqual({ correct: true, done: false });
    expect(r.progress()).toBe('do_');
    expect(r.jump('g')).toEqual({ correct: true, done: true });
    expect(r.done).toBe(true);
    expect(r.mistakes).toBe(0);
  });

  it('a wrong letter does not advance, counts a mistake and sinks that rock', () => {
    const r = run();
    const wrong = r.columns[0].letters.find((l) => l !== 'd');
    expect(r.jump(wrong)).toEqual({ correct: false, done: false });
    expect(r.position).toBe(0);
    expect(r.mistakes).toBe(1);
    expect(r.columns[0].letters).not.toContain(wrong);
    expect(r.columns[0].letters).toContain('d');
  });

  it('throws once the word is spelled', () => {
    const r = run();
    ['d', 'o', 'g'].forEach((l) => r.jump(l));
    expect(() => r.jump('x')).toThrow();
  });

  it('refuses words that cannot be spelled on rocks', () => {
    expect(() => new SpellingRun({ en: 'good morning', he: 'בוקר טוב' })).toThrow();
  });
});

describe('typedLetter', () => {
  it('reads the physical key, so a Hebrew layout still types English letters', () => {
    expect(typedLetter({ key: 'ג', code: 'KeyD' })).toBe('d');
    expect(typedLetter({ key: 'D', code: 'KeyD' })).toBe('d');
  });

  it('falls back to the key when there is no code', () => {
    expect(typedLetter({ key: 'g' })).toBe('g');
  });

  it.each([
    { key: 'Enter', code: 'Enter' },
    { key: '5', code: 'Digit5' },
    { key: 'ש', code: '' },
    {},
  ])('ignores %j', (event) => {
    expect(typedLetter(event)).toBeNull();
  });
});

describe('Hebrew–Hebrew pairs', () => {
  it('spell the second word for the first; English pairs spell the English word', () => {
    expect(spellingTarget({ en: 'גדול', he: 'קטן' })).toEqual({ word: 'קטן', lang: 'he', prompt: 'גדול' });
    expect(spellingTarget({ en: 'Dog', he: 'כלב' })).toEqual({ word: 'dog', lang: 'en', prompt: 'כלב' });
    // An English phrase is not turned into Hebrew spelling.
    expect(spellingTarget({ en: 'good morning', he: 'בוקר' })).toBeNull();
    expect(spellingTarget({ en: 'גדול', he: 'גדול מאוד' })).toBeNull();
  });

  it('pick spellable pairs from a Hebrew–Hebrew list', () => {
    const list = [{ en: 'חם', he: 'קר' }, { en: 'גדול', he: 'קטן' }, { en: 'יום', he: 'לילה ארוך' }];
    expect(pickSpellingPairs(list, 5, mulberry32(1)).map((p) => p.he).sort()).toEqual(['קטן', 'קר'].sort());
  });

  it('a run puts Hebrew letters on the rocks', () => {
    const r = new SpellingRun({ en: 'גדול', he: 'קטן' }, { choices: 3, random: mulberry32(2) });
    expect(r.lang).toBe('he');
    expect(r.prompt).toBe('גדול');
    expect(r.columns.map((c) => c.answer)).toEqual(['ק', 'ט', 'ן']);
    for (const c of r.columns) {
      expect(c.letters).toHaveLength(3);
      c.letters.forEach((l) => expect(l).toMatch(/^[א-ת]$/));
    }
    ['ק', 'ט', 'ן'].forEach((l) => r.jump(l));
    expect(r.done).toBe(true);
  });

  it('typing reads Hebrew letters from either keyboard layout', () => {
    expect(typedLetter({ key: 'ק', code: 'KeyE' }, 'he')).toBe('ק');
    expect(typedLetter({ key: 'e', code: 'KeyE' }, 'he')).toBe('ק'); // English layout on
    expect(typedLetter({ key: 'i', code: 'KeyI' }, 'he')).toBe('ן');
    expect(typedLetter({ key: ',', code: 'Comma' }, 'he')).toBe('ת');
    expect(typedLetter({ key: '5', code: 'Digit5' }, 'he')).toBeNull();
    expect(typedLetter({ key: 'ג', code: 'KeyD' })).toBe('d'); // English words still read the key's letter
  });
});
