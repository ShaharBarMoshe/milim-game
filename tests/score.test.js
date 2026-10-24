import { describe, it, expect } from 'vitest';
import { WORDS_KEY, WordHistory, balloonPoints, lengthBonus, letterCount, spellingPoints } from '../src/score.js';
import { Quiz } from '../src/quiz.js';
import { memoryStorage, mulberry32, throwingStorage } from './helpers.js';

const DOG = { en: 'dog', he: 'כלב' };
const PAIRS = [DOG, { en: 'cat', he: 'חתול' }, { en: 'sun', he: 'שמש' }, { en: 'tree', he: 'עץ' }];

describe('letterCount()', () => {
  it.each([
    ['dog', 3],
    ['good morning', 11],
    ['ice-cream', 8],
    ['כלב', 3],
    ['שָׁלוֹם', 4], // vowel marks don't count
    ['', 0],
    [null, 0],
  ])('%j has %i letters', (text, n) => {
    expect(letterCount(text)).toBe(n);
  });
});

describe('lengthBonus()', () => {
  it('gives 2 points a letter past 4, up to 12', () => {
    expect(lengthBonus({ en: 'dog', he: 'כלב' })).toBe(0);
    expect(lengthBonus({ en: 'tree', he: 'עץ' })).toBe(0);
    expect(lengthBonus({ en: 'house', he: 'בית' })).toBe(2);
    expect(lengthBonus({ en: 'morning', he: 'בוקר' })).toBe(6);
    expect(lengthBonus({ en: 'butterfly', he: 'פרפר' })).toBe(10);
    expect(lengthBonus({ en: 'refrigerator', he: 'מקרר' })).toBe(12);
    expect(lengthBonus({ en: 'extraordinarily', he: 'x' })).toBe(12);
  });

  it('measures the longer side, so Hebrew–Hebrew lists count too', () => {
    expect(lengthBonus({ en: 'ים', he: 'אוקיינוס' })).toBe(8);
  });
});

describe('balloonPoints()', () => {
  it('is 10 for a short word with no streak', () => {
    expect(balloonPoints(DOG)).toBe(10);
  });

  it('adds 2 a streak step up to +10', () => {
    expect([0, 1, 2, 5, 9].map((streak) => balloonPoints(DOG, { streak }))).toEqual([10, 12, 14, 20, 20]);
  });

  it('adds 5 for each earlier miss of a tricky word', () => {
    expect(balloonPoints(DOG, { tricky: 1 })).toBe(15);
    expect(balloonPoints(DOG, { tricky: 2 })).toBe(20);
  });

  it('pays more for a long word than a short one', () => {
    expect(balloonPoints({ en: 'butterfly', he: 'פרפר' })).toBeGreaterThan(balloonPoints(DOG));
  });

  it('adds all the bonuses together', () => {
    expect(balloonPoints({ en: 'morning', he: 'בוקר' }, { streak: 3, tricky: 1 })).toBe(10 + 6 + 6 + 5);
  });
});

describe('spellingPoints()', () => {
  it('is 10 a letter, +20 with no mistakes', () => {
    expect(spellingPoints('dog')).toBe(50);
    expect(spellingPoints('dog', { mistakes: 2 })).toBe(30);
    expect(spellingPoints('elephant')).toBe(100);
  });

  it('adds 10 for each earlier miss of a tricky word', () => {
    expect(spellingPoints('dog', { tricky: 2 })).toBe(70);
  });

  it('counts Hebrew letters', () => {
    expect(spellingPoints('כלב', { mistakes: 1 })).toBe(30);
  });
});

describe('WordHistory', () => {
  it('starts with no tricky words', () => {
    expect(new WordHistory(memoryStorage()).tricky(DOG)).toBe(0);
  });

  it('counts misses up to 2, and a clean right answer takes one away', () => {
    const history = new WordHistory(memoryStorage());
    history.missed(DOG);
    expect(history.tricky(DOG)).toBe(1);
    history.missed(DOG);
    history.missed(DOG);
    expect(history.tricky(DOG)).toBe(2);
    history.learned(DOG);
    expect(history.tricky(DOG)).toBe(1);
    history.learned(DOG);
    history.learned(DOG);
    expect(history.tricky(DOG)).toBe(0);
    expect(history.tricky({ en: 'cat', he: 'חתול' })).toBe(0);
  });

  it('tells apart pairs that share a word', () => {
    const history = new WordHistory(memoryStorage());
    history.missed({ en: 'light', he: 'אור' });
    expect(history.tricky({ en: 'light', he: 'קל' })).toBe(0);
  });

  it('is saved between games, and forgets learned words', () => {
    const storage = memoryStorage();
    const history = new WordHistory(storage);
    history.missed(DOG);
    expect(new WordHistory(storage).tricky(DOG)).toBe(1);
    history.learned(DOG);
    expect(JSON.parse(storage.getItem(WORDS_KEY))).toEqual({});
  });

  it.each(['not json', '[1]', '"x"', '{"dog|כלב": -1}', '{"dog|כלב": 1.5}'])('reads broken data %j as no tricky words', (raw) => {
    expect(new WordHistory(memoryStorage({ [WORDS_KEY]: raw })).tricky(DOG)).toBe(0);
  });

  it('caps saved counts at 2', () => {
    expect(new WordHistory(memoryStorage({ [WORDS_KEY]: '{"dog|כלב": 9}' })).tricky(DOG)).toBe(2);
  });

  it('never throws when storage is blocked or missing', () => {
    for (const storage of [throwingStorage(), undefined, null]) {
      const history = new WordHistory(storage);
      history.missed(DOG);
      expect(history.tricky(DOG)).toBe(1);
      history.learned(DOG);
    }
  });
});

describe('Quiz with a WordHistory', () => {
  const quizOn = (history, seed = 3) => new Quiz(PAIRS, { random: mulberry32(seed), history });
  const askFor = (quiz, pair) => {
    for (let i = 0; i < 200; i++) {
      const q = quiz.next();
      if (q.pair.en === pair.en) return q;
    }
    throw new Error(`never asked ${pair.en}`);
  };

  it('pays more for a word missed in an earlier game', () => {
    const history = new WordHistory(memoryStorage());
    history.missed(DOG);
    const quiz = quizOn(history);
    const q = askFor(quiz, DOG);
    expect(q.tricky).toBe(1);
    expect(quiz.answer(q.answer).points).toBe(15);
    expect(history.tricky(DOG)).toBe(0); // learned
  });

  it('a wrong answer makes the word tricky for later games, not for this question', () => {
    const history = new WordHistory(memoryStorage());
    const quiz = quizOn(history);
    const q = askFor(quiz, DOG);
    quiz.answer(q.options.find((o) => o !== q.answer));
    quiz.answer(q.options.find((o) => o !== q.answer)); // a second wrong try counts once
    expect(history.tricky(DOG)).toBe(1);
    expect(quiz.answer(q.answer).points).toBe(10); // no bonus, and the miss isn't undone
    expect(history.tricky(DOG)).toBe(1);
  });

  it('an escaped wave counts as a miss', () => {
    const history = new WordHistory(memoryStorage());
    const quiz = quizOn(history);
    const q = askFor(quiz, DOG);
    quiz.skip();
    expect(history.tricky(q.pair)).toBe(1);
  });

  it('works without a history', () => {
    const quiz = quizOn(null);
    const q = quiz.next();
    expect(q.tricky).toBe(0);
    expect(quiz.answer(q.answer).correct).toBe(true);
  });
});
