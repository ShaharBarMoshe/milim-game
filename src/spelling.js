// Spelling logic for the lava level. No Phaser here, so it runs (and is tested) in Node.

import { shuffle } from './quiz.js';

// Success needed in a balloon round to unlock the lava level.
export const UNLOCK_SUCCESS = 90;
export const UNLOCK_MIN_CORRECT = 5;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const MIN_LENGTH = 2;
const MAX_LENGTH = 8;

// Share of questions answered right; unlike Quiz accuracy, escaped waves count as failures,
// so the level can't be unlocked by letting hard words float away.
export function successRate(stats) {
  const asked = stats.correct + stats.wrong + stats.missed;
  return asked ? Math.round((stats.correct / asked) * 100) : 0;
}

export function lavaUnlocked(stats) {
  return stats.correct >= UNLOCK_MIN_CORRECT && successRate(stats) >= UNLOCK_SUCCESS;
}

// The letters the player has to jump on, or null when the word can't be spelled on rocks
// (spaces, digits, accents, too short or too long).
export function spellingWord(en) {
  const word = String(en).trim().toLowerCase();
  if (!/^[a-z]+$/.test(word) || word.length < MIN_LENGTH || word.length > MAX_LENGTH) return null;
  return word;
}

// Up to `count` different pairs whose English side can be spelled, in random order.
export function pickSpellingPairs(pairs, count, random = Math.random) {
  const seen = new Set();
  const usable = [];
  for (const pair of pairs) {
    const word = spellingWord(pair.en);
    if (word && !seen.has(word)) {
      seen.add(word);
      usable.push(pair);
    }
  }
  return shuffle(usable, random).slice(0, count);
}

// `count` different letters in random order, one of them `answer`.
export function letterChoices(answer, count, random = Math.random) {
  const others = shuffle([...ALPHABET].filter((l) => l !== answer), random).slice(0, count - 1);
  return shuffle([answer, ...others], random);
}

// One word's crossing: a column of rocks per letter, and how far the player has got.
export class SpellingRun {
  constructor(pair, { choices = 3, random = Math.random } = {}) {
    this.word = spellingWord(pair.en);
    if (!this.word) throw new Error(`"${pair.en}" can't be spelled on rocks`);
    this.pair = pair;
    this.columns = [...this.word].map((answer) => ({ answer, letters: letterChoices(answer, choices, random) }));
    this.position = 0; // letters spelled so far
    this.mistakes = 0;
  }

  get done() {
    return this.position === this.word.length;
  }

  // Jump onto the rock with `letter` in the next column.
  jump(letter) {
    if (this.done) throw new Error('word already spelled');
    const column = this.columns[this.position];
    if (letter !== column.answer) {
      this.mistakes++;
      // The rock sinks, so the same wrong letter can't be picked twice.
      column.letters = column.letters.filter((l) => l !== letter);
      return { correct: false, done: false };
    }
    this.position++;
    return { correct: true, done: this.done };
  }

  // The word so far, with blanks for the letters still to come: "do_".
  progress(blank = '_') {
    return this.word.slice(0, this.position) + blank.repeat(this.word.length - this.position);
  }
}

// The letter for a key press, by physical key, so it also works with a Hebrew keyboard layout
// (where the D key types ג).
export function typedLetter(event) {
  const code = /^Key([A-Z])$/.exec(event.code ?? '');
  if (code) return code[1].toLowerCase();
  return /^[a-z]$/i.test(event.key ?? '') ? event.key.toLowerCase() : null;
}
