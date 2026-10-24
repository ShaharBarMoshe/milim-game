import { describe, it, expect } from 'vitest';
import { Quiz, DIRECTIONS, shuffle } from '../src/quiz.js';
import { lengthBonus } from '../src/score.js';
import { mulberry32, HEBREW_RE, LATIN_RE } from './helpers.js';

const PAIRS = [
  { en: 'dog', he: 'כלב' },
  { en: 'cat', he: 'חתול' },
  { en: 'house', he: 'בית' },
  { en: 'sun', he: 'שמש' },
  { en: 'moon', he: 'ירח' },
  { en: 'tree', he: 'עץ' },
];

const makeQuiz = (pairs = PAIRS, opts = {}, seed = 1) =>
  new Quiz(pairs, { random: mulberry32(seed), ...opts });

function wrongOption(q) {
  return q.options.find((o) => o !== q.answer);
}

function isPair(q, pairs = PAIRS) {
  return pairs.some((p) =>
    q.direction === 'en-he' ? p.en === q.prompt && p.he === q.answer : p.he === q.prompt && p.en === q.answer,
  );
}

describe('DIRECTIONS', () => {
  it('has the documented values', () => {
    expect(DIRECTIONS).toEqual({ EN_HE: 'en-he', HE_EN: 'he-en', MIXED: 'mixed' });
  });
});

describe('Quiz constructor', () => {
  it('throws with fewer than 2 pairs', () => {
    expect(() => new Quiz([])).toThrow(Error);
    expect(() => new Quiz([{ en: 'dog', he: 'כלב' }])).toThrow(Error);
  });

  it('accepts exactly 2 pairs', () => {
    expect(() => new Quiz(PAIRS.slice(0, 2))).not.toThrow();
  });

  it('starts with no current question and zero stats', () => {
    const quiz = makeQuiz();
    expect(quiz.current).toBeNull();
    const s = quiz.stats();
    expect(s).toMatchObject({ correct: 0, wrong: 0, missed: 0, streak: 0, bestStreak: 0 });
    expect(s.missedPairs).toEqual([]);
    expect(Number.isInteger(s.accuracy)).toBe(true);
    expect(s.accuracy).toBeGreaterThanOrEqual(0);
    expect(s.accuracy).toBeLessThanOrEqual(100);
  });
});

describe('Quiz.next()', () => {
  it('returns a question and stores it as current', () => {
    const quiz = makeQuiz();
    const q = quiz.next();
    expect(q).toEqual(
      expect.objectContaining({
        prompt: expect.any(String),
        answer: expect.any(String),
        options: expect.any(Array),
        direction: expect.stringMatching(/^(en-he|he-en)$/),
      }),
    );
    expect(quiz.current).toEqual(q);
  });

  it('option count is min(optionCount, pairs.length)', () => {
    expect(makeQuiz(PAIRS).next().options).toHaveLength(4); // default 4
    expect(makeQuiz(PAIRS, { optionCount: 3 }).next().options).toHaveLength(3);
    expect(makeQuiz(PAIRS, { optionCount: 10 }).next().options).toHaveLength(PAIRS.length);
    expect(makeQuiz(PAIRS.slice(0, 2)).next().options).toHaveLength(2);
    expect(makeQuiz(PAIRS.slice(0, 3)).next().options).toHaveLength(3);
  });

  for (const direction of ['en-he', 'he-en', 'mixed']) {
    it(`options are valid over many draws (${direction})`, () => {
      for (const seed of [1, 2, 3]) {
        const quiz = makeQuiz(PAIRS, { direction }, seed);
        for (let i = 0; i < 200; i++) {
          const q = quiz.next();
          expect(q.options.filter((o) => o === q.answer)).toHaveLength(1);
          expect(new Set(q.options).size).toBe(q.options.length);
          expect(isPair(q)).toBe(true);
          const answerRe = q.direction === 'en-he' ? HEBREW_RE : LATIN_RE;
          const promptRe = q.direction === 'en-he' ? LATIN_RE : HEBREW_RE;
          expect(q.prompt).toMatch(promptRe);
          for (const o of q.options) expect(o).toMatch(answerRe);
          // distractors must be real words of the same language from other pairs
          const pool = q.direction === 'en-he' ? PAIRS.map((p) => p.he) : PAIRS.map((p) => p.en);
          for (const o of q.options) expect(pool).toContain(o);
        }
      }
    });
  }

  it('en-he: prompt is English, answer Hebrew, direction en-he', () => {
    const quiz = makeQuiz(PAIRS, { direction: DIRECTIONS.EN_HE });
    for (let i = 0; i < 50; i++) {
      const q = quiz.next();
      expect(q.direction).toBe('en-he');
      expect(PAIRS.map((p) => p.en)).toContain(q.prompt);
      expect(PAIRS.find((p) => p.en === q.prompt).he).toBe(q.answer);
    }
  });

  it('he-en: prompt is Hebrew, answer English, direction he-en', () => {
    const quiz = makeQuiz(PAIRS, { direction: DIRECTIONS.HE_EN });
    for (let i = 0; i < 50; i++) {
      const q = quiz.next();
      expect(q.direction).toBe('he-en');
      expect(PAIRS.map((p) => p.he)).toContain(q.prompt);
      expect(PAIRS.find((p) => p.he === q.prompt).en).toBe(q.answer);
    }
  });

  it('defaults to en-he', () => {
    const quiz = new Quiz(PAIRS, { random: mulberry32(5) });
    for (let i = 0; i < 20; i++) expect(quiz.next().direction).toBe('en-he');
  });

  it('mixed produces both directions', () => {
    const quiz = makeQuiz(PAIRS, { direction: DIRECTIONS.MIXED });
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(quiz.next().direction);
    expect([...seen].sort()).toEqual(['en-he', 'he-en']);
  });

  it('never asks the same pair twice in a row', () => {
    for (const [pairs, direction] of [
      [PAIRS, 'en-he'],
      [PAIRS.slice(0, 2), 'en-he'],
      [PAIRS.slice(0, 3), 'mixed'],
    ]) {
      const quiz = makeQuiz(pairs, { direction }, 42);
      const key = (q) => (q.direction === 'en-he' ? q.prompt : q.answer); // en of the pair
      let prev = key(quiz.next());
      for (let i = 0; i < 500; i++) {
        const k = key(quiz.next());
        expect(k).not.toBe(prev);
        prev = k;
      }
    }
  });

  it('eventually asks every pair', () => {
    const quiz = makeQuiz();
    const seen = new Set();
    for (let i = 0; i < 300; i++) seen.add(quiz.next().prompt);
    expect(seen.size).toBe(PAIRS.length);
  });

  it('shuffles option order (answer position varies)', () => {
    const quiz = makeQuiz();
    const positions = new Set();
    const orders = new Set();
    for (let i = 0; i < 200; i++) {
      const q = quiz.next();
      positions.add(q.options.indexOf(q.answer));
      orders.add(q.options.join('|'));
    }
    expect(positions.size).toBe(4);
    expect(orders.size).toBeGreaterThan(10);
  });

  it('is deterministic for the same seed', () => {
    const a = makeQuiz(PAIRS, { direction: 'mixed' }, 99);
    const b = makeQuiz(PAIRS, { direction: 'mixed' }, 99);
    for (let i = 0; i < 30; i++) expect(a.next()).toEqual(b.next());
  });

  it('uses the injected random function', () => {
    let calls = 0;
    const rnd = mulberry32(3);
    const quiz = new Quiz(PAIRS, {
      random: () => {
        calls++;
        return rnd();
      },
    });
    quiz.next();
    expect(calls).toBeGreaterThan(0);
  });
});

describe('Quiz.answer()', () => {
  it('throws when there is no current question', () => {
    expect(() => makeQuiz().answer('כלב')).toThrow();
  });

  it('scores 10 + 2*min(streak,5) (+ the long word bonus) across 7 correct answers', () => {
    const quiz = makeQuiz();
    const got = [];
    for (let i = 0; i < 7; i++) {
      const q = quiz.next();
      const r = quiz.answer(q.answer);
      expect(r.correct).toBe(true);
      got.push(r.points - lengthBonus(q.pair));
    }
    expect(got).toEqual([10, 12, 14, 16, 18, 20, 20]);
    const s = quiz.stats();
    expect(s.correct).toBe(7);
    expect(s.streak).toBe(7);
    expect(s.bestStreak).toBe(7);
    expect(s.accuracy).toBe(100);
  });

  it('wrong answer gives -5 and resets the streak', () => {
    const quiz = makeQuiz();
    for (let i = 0; i < 3; i++) quiz.answer(quiz.next().answer);
    expect(quiz.stats().streak).toBe(3);
    const q = quiz.next();
    const r = quiz.answer(wrongOption(q));
    expect(r).toEqual({ correct: false, points: -5 });
    const s = quiz.stats();
    expect(s.wrong).toBe(1);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(3);
    // streak bonus restarts from zero
    const q2 = quiz.next();
    const r2 = quiz.answer(q2.answer);
    expect(r2).toEqual({ correct: true, points: 10 + lengthBonus(q2.pair) });
  });

  it('a wrong answer keeps the question so it can be answered again', () => {
    const quiz = makeQuiz();
    const q = quiz.next();
    quiz.answer(wrongOption(q));
    expect(quiz.current).not.toBeNull();
    expect(quiz.current.prompt).toBe(q.prompt);
    expect(quiz.answer(q.answer).correct).toBe(true);
  });

  it('wrong answer is -5 even on the first question (quiz does not clamp)', () => {
    const quiz = makeQuiz();
    const q = quiz.next();
    expect(quiz.answer(wrongOption(q)).points).toBe(-5);
  });
});

describe('Quiz.skip()', () => {
  it('counts a miss, resets the streak and records the pair', () => {
    const quiz = makeQuiz();
    quiz.answer(quiz.next().answer);
    quiz.answer(quiz.next().answer);
    const q = quiz.next();
    quiz.skip();
    const s = quiz.stats();
    expect(s.missed).toBe(1);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(2);
    expect(s.correct).toBe(2);
    expect(s.wrong).toBe(0);
    const pair = PAIRS.find((p) => p.en === q.prompt);
    expect(s.missedPairs).toHaveLength(1);
    expect(s.missedPairs[0]).toMatchObject({ en: pair.en, he: pair.he });
  });

  it('records missed pairs in he-en direction as {en, he}', () => {
    const quiz = makeQuiz(PAIRS, { direction: 'he-en' });
    const q = quiz.next();
    quiz.skip();
    expect(quiz.stats().missedPairs[0]).toMatchObject({ en: q.answer, he: q.prompt });
  });
});

describe('Quiz.stats()', () => {
  it('accuracy is an integer percentage', () => {
    const quiz = makeQuiz();
    quiz.answer(quiz.next().answer);
    let q = quiz.next();
    quiz.answer(wrongOption(q));
    expect(quiz.stats().accuracy).toBe(50);
    quiz.answer(wrongOption(q));
    const s = quiz.stats();
    expect(s.accuracy).toBe(33);
    expect(Number.isInteger(s.accuracy)).toBe(true);
  });

  it('accuracy stays within 0..100 across a random session', () => {
    const quiz = makeQuiz(PAIRS, { direction: 'mixed' }, 7);
    const r = mulberry32(8);
    for (let i = 0; i < 100; i++) {
      const q = quiz.next();
      const x = r();
      if (x < 0.5) quiz.answer(q.answer);
      else if (x < 0.8) quiz.answer(wrongOption(q));
      else quiz.skip();
      const s = quiz.stats();
      expect(Number.isInteger(s.accuracy)).toBe(true);
      expect(s.accuracy).toBeGreaterThanOrEqual(0);
      expect(s.accuracy).toBeLessThanOrEqual(100);
    }
  });

  it('tracks bestStreak across resets', () => {
    const quiz = makeQuiz();
    for (let i = 0; i < 3; i++) quiz.answer(quiz.next().answer);
    quiz.answer(wrongOption(quiz.next()));
    quiz.answer(quiz.next().answer);
    let s = quiz.stats();
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(3);
    for (let i = 0; i < 4; i++) quiz.answer(quiz.next().answer);
    s = quiz.stats();
    expect(s.streak).toBe(5);
    expect(s.bestStreak).toBe(5);
  });
});

describe('shuffle()', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('returns a new array with the same elements and does not mutate the input', () => {
    const copy = [...input];
    const out = shuffle(input, mulberry32(1));
    expect(out).not.toBe(input);
    expect(input).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(copy);
  });

  it('is deterministic with a seeded random', () => {
    expect(shuffle(input, mulberry32(123))).toEqual(shuffle(input, mulberry32(123)));
  });

  it('actually reorders (different seeds give different orders)', () => {
    const orders = new Set();
    for (let s = 1; s <= 20; s++) orders.add(shuffle(input, mulberry32(s)).join(','));
    expect(orders.size).toBeGreaterThan(10);
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffle([], mulberry32(1))).toEqual([]);
    expect(shuffle(['a'], mulberry32(1))).toEqual(['a']);
  });

  it('works with the default Math.random', () => {
    const out = shuffle(input);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });
});
