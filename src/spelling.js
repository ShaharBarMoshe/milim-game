// Spelling logic for the lava level. No Phaser here, so it runs (and is tested) in Node.

import { shuffle } from './quiz.js';

// Letters for the wrong rocks. Hebrew final forms (ך ם ן ף ץ) only appear when the word has one.
const ALPHABETS = { en: 'abcdefghijklmnopqrstuvwxyz', he: 'אבגדהוזחטיכלמנסעפצקרשת' };
const WORD = { en: /^[a-z]+$/, he: /^[א-ת]+$/ };
const HEBREW = /[֐-׿]/;
const MIN_LENGTH = 2;
const MAX_LENGTH = 12;

// Share of questions answered right; unlike Quiz accuracy, escaped waves count as failures.
export function successRate(stats) {
  const asked = stats.correct + stats.wrong + stats.missed;
  return asked ? Math.round((stats.correct / asked) * 100) : 0;
}

// The letters the player has to jump on, or null when the word can't be spelled on rocks
// (spaces, digits, accents, Hebrew vowel marks, too short or too long). `lang` is 'en' or 'he'.
export function spellingWord(text, lang = 'en') {
  const word = String(text ?? '').trim().toLowerCase();
  if (!WORD[lang]?.test(word) || word.length < MIN_LENGTH || word.length > MAX_LENGTH) return null;
  return word;
}

// What the lava level does with a pair: an English–Hebrew pair spells its English word for the Hebrew
// one; a Hebrew–Hebrew pair spells its second word for the first. Null when it can't be spelled.
export function spellingTarget(pair) {
  const en = spellingWord(pair?.en, 'en');
  if (en) return { word: en, lang: 'en', prompt: pair.he };
  const he = HEBREW.test(pair?.en ?? '') && spellingWord(pair?.he, 'he');
  return he ? { word: he, lang: 'he', prompt: pair.en } : null;
}

// Up to `count` different pairs whose English side can be spelled, in random order.
export function pickSpellingPairs(pairs, count, random = Math.random) {
  const seen = new Set();
  const usable = [];
  for (const pair of pairs) {
    const word = spellingTarget(pair)?.word;
    if (word && !seen.has(word)) {
      seen.add(word);
      usable.push(pair);
    }
  }
  return shuffle(usable, random).slice(0, count);
}

// `count` different letters in random order, one of them `answer`.
export function letterChoices(answer, count, random = Math.random, lang = 'en') {
  const others = shuffle([...ALPHABETS[lang]].filter((l) => l !== answer), random).slice(0, count - 1);
  return shuffle([answer, ...others], random);
}

// One word's crossing: a column of rocks per letter, and how far the player has got.
export class SpellingRun {
  constructor(pair, { choices = 3, random = Math.random } = {}) {
    const target = spellingTarget(pair);
    if (!target) throw new Error(`"${pair?.en}" can't be spelled on rocks`);
    this.word = target.word;
    this.lang = target.lang;
    this.prompt = target.prompt; // the word shown in the banner
    this.pair = pair;
    this.columns = [...this.word].map((answer) => ({ answer, letters: letterChoices(answer, choices, random, this.lang) }));
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

// The Hebrew letter on each key of the standard Israeli layout.
const HEBREW_KEYS = {
  KeyE: 'ק', KeyR: 'ר', KeyT: 'א', KeyY: 'ט', KeyU: 'ו', KeyI: 'ן', KeyO: 'ם', KeyP: 'פ',
  KeyA: 'ש', KeyS: 'ד', KeyD: 'ג', KeyF: 'כ', KeyG: 'ע', KeyH: 'י', KeyJ: 'ח', KeyK: 'ל', KeyL: 'ך', Semicolon: 'ף',
  KeyZ: 'ז', KeyX: 'ס', KeyC: 'ב', KeyV: 'ה', KeyB: 'נ', KeyN: 'מ', KeyM: 'צ', Comma: 'ת', Period: 'ץ',
};

// The letter for a key press, by physical key, so it works whatever keyboard layout is on: English
// letters on a Hebrew layout (the D key types ג, read as d), and Hebrew letters on an English one.
export function typedLetter(event, lang = 'en') {
  if (lang === 'he') {
    if (/^[א-ת]$/.test(event.key ?? '')) return event.key;
    return HEBREW_KEYS[event.code] ?? null;
  }
  const code = /^Key([A-Z])$/.exec(event.code ?? '');
  if (code) return code[1].toLowerCase();
  return /^[a-z]$/i.test(event.key ?? '') ? event.key.toLowerCase() : null;
}
