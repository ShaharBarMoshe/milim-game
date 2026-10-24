// How many points an answer is worth, in both games. No Phaser or DOM here, so it runs (and is tested)
// in Node. Long words and tricky words (ones the player got wrong in earlier games) are worth more.

import { successRate } from './spelling.js';

export const WORDS_KEY = 'balloon-archer-tricky';

const BASE_POINTS = 10;
const STREAK_BONUS = 2;
const MAX_STREAK_BONUS_STEPS = 5;
export const WRONG_POINTS = -5;
// Letters past SHORT_WORD earn LETTER_BONUS each in the balloon game, up to MAX_LENGTH_BONUS.
const SHORT_WORD = 4;
const LETTER_BONUS = 2;
const MAX_LENGTH_BONUS = 12;
// A word missed in earlier games is tricky: each miss (up to MAX_TRICKY) adds a bonus until it's learned.
const MAX_TRICKY = 2;
const TRICKY_BONUS = 5;
const SPELL_LETTER_POINTS = 10;
const SPELL_CLEAN_BONUS = 20;
const SPELL_TRICKY_BONUS = 10;

// Letters in a word, in any alphabet (spaces, hyphens and Hebrew vowel marks don't count).
export function letterCount(text) {
  return (String(text ?? '').match(/\p{L}/gu) ?? []).length;
}

// Extra points for a pair's longer side.
export function lengthBonus(pair) {
  const letters = Math.max(letterCount(pair?.en), letterCount(pair?.he));
  return Math.min(MAX_LENGTH_BONUS, LETTER_BONUS * Math.max(0, letters - SHORT_WORD));
}

// A right balloon: 10, plus the long word and tricky word bonuses, plus 2 for each answer of the
// streak before it (up to +10). `tricky` is WordHistory.tricky() for the pair.
export function balloonPoints(pair, { streak = 0, tricky = 0 } = {}) {
  return BASE_POINTS + lengthBonus(pair) + TRICKY_BONUS * tricky + STREAK_BONUS * Math.min(streak, MAX_STREAK_BONUS_STEPS);
}

// A word crossed in the lava level: 10 a letter, 20 more with no mistakes, and the tricky word bonus.
export function spellingPoints(word, { mistakes = 0, tricky = 0 } = {}) {
  return SPELL_LETTER_POINTS * letterCount(word) + (mistakes ? 0 : SPELL_CLEAN_BONUS) + SPELL_TRICKY_BONUS * tricky;
}

// Extra points for completing a stage. A balloon round (Quiz.stats()) with at least 5 right answers
// earns 30, and 30 more at 80% success or better. A lava game with every word crossed
// ({ spelled, total, mistakes }) earns 50, and 50 more with no mistakes. Anything else earns 0.
export function stageBonus(game, result) {
  if (!result || typeof result !== 'object') return 0;
  if (game === 'balloons') {
    const { correct, wrong, missed } = result;
    if (![correct, wrong, missed].every(Number.isFinite) || correct < 5) return 0;
    return 30 + (successRate(result) >= 80 ? 30 : 0);
  }
  if (game === 'lava') {
    const { spelled, total, mistakes } = result;
    if (!Number.isFinite(total) || total <= 0 || spelled !== total) return 0;
    return 50 + (mistakes === 0 ? 50 : 0);
  }
  return 0;
}

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

const keyOf = (pair) => `${pair?.en ?? ''}|${pair?.he ?? ''}`;

// Which words the player keeps getting wrong, across games: a miss counts one up, a clean right answer
// one down. Saved in the browser; never throws.
export class WordHistory {
  constructor(storage = defaultStorage()) {
    this.storage = storage;
    let data = null;
    try {
      data = JSON.parse(storage?.getItem(WORDS_KEY) ?? 'null');
    } catch {
      data = null;
    }
    // pair key -> misses not yet made up for
    this.misses = {};
    for (const [key, count] of Object.entries(data && typeof data === 'object' && !Array.isArray(data) ? data : {})) {
      if (Number.isInteger(count) && count > 0) this.misses[key] = Math.min(count, MAX_TRICKY);
    }
  }

  save() {
    try {
      this.storage?.setItem(WORDS_KEY, JSON.stringify(this.misses));
    } catch {
      // storage unavailable (private mode) — tricky words are forgotten when the page closes
    }
  }

  // 0 (fine), 1 or 2 (missed that many times more than answered right).
  tricky(pair) {
    return this.misses[keyOf(pair)] ?? 0;
  }

  missed(pair) {
    const key = keyOf(pair);
    this.misses[key] = Math.min(MAX_TRICKY, this.tricky(pair) + 1);
    this.save();
  }

  learned(pair) {
    const key = keyOf(pair);
    if (!this.misses[key]) return;
    if (--this.misses[key] === 0) delete this.misses[key];
    this.save();
  }
}
