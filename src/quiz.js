// Question/answer/scoring logic for the vocabulary game. Phaser-free; pass `random` for determinism.

export const DIRECTIONS = { EN_HE: 'en-he', HE_EN: 'he-en', MIXED: 'mixed' };

const BASE_POINTS = 10;
const STREAK_BONUS = 2;
const MAX_STREAK_BONUS_STEPS = 5;
const WRONG_POINTS = -5;

export function shuffle(array, random = Math.random) {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class Quiz {
  constructor(pairs, { direction = DIRECTIONS.EN_HE, optionCount = 4, random = Math.random } = {}) {
    if (!Array.isArray(pairs) || pairs.length < 2) throw new Error('Quiz needs at least 2 word pairs');
    this.pairs = pairs.map(({ en, he }) => ({ en, he }));
    this.direction = direction;
    this.optionCount = optionCount;
    this.random = random;
    this.current = null;
    this.lastIndex = -1;
    this.streak = 0;
    this.bestStreak = 0;
    this.correct = 0;
    this.wrong = 0;
    this.missed = 0;
    this.missedPairs = [];
  }

  next() {
    const n = this.pairs.length;
    let index;
    if (this.lastIndex < 0) {
      index = Math.floor(this.random() * n);
    } else {
      // Draw from the other n-1 pairs so the same word never comes twice in a row.
      index = Math.floor(this.random() * (n - 1));
      if (index >= this.lastIndex) index++;
    }
    index = Math.min(index, n - 1);
    this.lastIndex = index;
    const pair = this.pairs[index];

    let direction = this.direction;
    if (direction === DIRECTIONS.MIXED) direction = this.random() < 0.5 ? DIRECTIONS.EN_HE : DIRECTIONS.HE_EN;
    const promptKey = direction === DIRECTIONS.HE_EN ? 'he' : 'en';
    const answerKey = promptKey === 'en' ? 'he' : 'en';
    const answer = pair[answerKey];

    // Two pairs may share a translation; never offer a distractor that reads the same as the answer.
    const seen = new Set([answer]);
    const candidates = [];
    for (const p of this.pairs) {
      const word = p[answerKey];
      if (p === pair || seen.has(word)) continue;
      seen.add(word);
      candidates.push(word);
    }
    const count = Math.min(this.optionCount, n);
    const distractors = shuffle(candidates, this.random).slice(0, Math.max(0, count - 1));
    const options = shuffle([answer, ...distractors], this.random);

    this.current = { prompt: pair[promptKey], answer, options, direction, pair };
    return this.current;
  }

  answer(option) {
    if (!this.current) throw new Error('No current question');
    if (option === this.current.answer) {
      const points = BASE_POINTS + STREAK_BONUS * Math.min(this.streak, MAX_STREAK_BONUS_STEPS);
      this.correct++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      return { correct: true, points };
    }
    this.wrong++;
    this.streak = 0;
    this.recordMiss(this.current.pair);
    return { correct: false, points: WRONG_POINTS };
  }

  skip() {
    if (!this.current) return;
    this.missed++;
    this.streak = 0;
    this.recordMiss(this.current.pair);
  }

  recordMiss(pair) {
    if (!this.missedPairs.some((p) => p.en === pair.en && p.he === pair.he)) {
      this.missedPairs.push({ en: pair.en, he: pair.he });
    }
  }

  stats() {
    const attempts = this.correct + this.wrong;
    return {
      correct: this.correct,
      wrong: this.wrong,
      missed: this.missed,
      streak: this.streak,
      bestStreak: this.bestStreak,
      accuracy: attempts ? Math.round((this.correct / attempts) * 100) : 0,
      missedPairs: this.missedPairs.map((p) => ({ ...p })),
    };
  }
}
