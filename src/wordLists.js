// Saved word lists: a few ready-made lists plus the player's own. Every list can be edited until the
// player locks it. No Phaser or DOM here, so it runs (and is tested) in Node.
//
// A list is English–Hebrew or Hebrew–Hebrew (e.g. opposites). Pairs keep the keys `en` and `he` for
// their first and second word either way, so in a Hebrew–Hebrew list both are Hebrew.

import { SAMPLE_PAIRS, loadWordList, parseWordList, splitLine } from './vocab.js';

export const LIBRARY_KEY = 'balloon-archer-lists';
export const MIN_PAIRS = 2;
export const MAX_WORD_LENGTH = 30;

const HEBREW = /[֐-׿]/;
const LATIN = /[A-Za-z]/;

export const KINDS = {
  EN_HE: 'en-he',
  HE_HE: 'he-he',
};

// What each kind of list calls its two words, and its direction choices.
export const KIND_LABELS = {
  [KINDS.EN_HE]: {
    name: 'English – Hebrew',
    first: 'English',
    second: 'עברית',
    firstHint: 'English, e.g. dog',
    secondHint: 'עברית, למשל כלב',
    forward: 'English → Hebrew',
    backward: 'Hebrew → English',
  },
  [KINDS.HE_HE]: {
    name: 'Hebrew – Hebrew',
    first: 'מילה',
    second: 'מילה מתאימה',
    firstHint: 'מילה, למשל גדול',
    secondHint: 'מילה מתאימה, למשל קטן',
    forward: 'Left word → right word',
    backward: 'Right word → left word',
  },
};

const pairs = (text) =>
  text.split(',').map((item) => {
    const [en, he] = item.split('=').map((s) => s.trim());
    return { en, he };
  });

export const PRESET_LISTS = [
  { id: 'preset-everyday', name: 'Everyday words', pairs: SAMPLE_PAIRS },
  {
    id: 'preset-animals',
    name: 'Animals',
    pairs: pairs('dog=כלב, cat=חתול, horse=סוס, cow=פרה, bird=ציפור, fish=דג, lion=אריה, elephant=פיל, monkey=קוף, rabbit=ארנב'),
  },
  {
    id: 'preset-food',
    name: 'Food',
    pairs: pairs('bread=לחם, apple=תפוח, milk=חלב, egg=ביצה, cheese=גבינה, banana=בננה, water=מים, cake=עוגה, rice=אורז, orange=תפוז'),
  },
  {
    id: 'preset-home',
    name: 'Home',
    pairs: pairs('house=בית, door=דלת, window=חלון, table=שולחן, chair=כיסא, bed=מיטה, kitchen=מטבח, room=חדר, key=מפתח, lamp=מנורה'),
  },
  {
    id: 'preset-school',
    name: 'School',
    pairs: pairs('book=ספר, pen=עט, pencil=עיפרון, teacher=מורה, student=תלמיד, class=כיתה, bag=תיק, notebook=מחברת, lesson=שיעור, desk=שולחן כתיבה'),
  },
  {
    id: 'preset-colors',
    name: 'Colors',
    pairs: pairs('red=אדום, blue=כחול, green=ירוק, yellow=צהוב, black=שחור, white=לבן, pink=ורוד, brown=חום, orange=כתום, purple=סגול'),
  },
  {
    id: 'preset-opposites',
    name: 'הפכים (Opposites)',
    kind: KINDS.HE_HE,
    pairs: pairs('גדול=קטן, חם=קר, יום=לילה, למעלה=למטה, פתוח=סגור, שמח=עצוב, ארוך=קצר, חזק=חלש, מהיר=איטי, ישן=חדש'),
  },
];

const clean = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

function checkWord(word, field, hebrew) {
  const name = field === 'en' ? (hebrew ? 'first' : 'English') : hebrew ? 'second' : 'Hebrew';
  if (!word) return { ok: false, field, error: `Type the ${name} word` };
  const wantHebrew = field === 'he' || hebrew;
  if (wantHebrew ? LATIN.test(word) || !HEBREW.test(word) : HEBREW.test(word) || !LATIN.test(word)) {
    return { ok: false, field, error: `The ${name} word needs ${wantHebrew ? 'Hebrew' : 'English'} letters` };
  }
  if (word.length > MAX_WORD_LENGTH) return { ok: false, field, error: `Keep it under ${MAX_WORD_LENGTH} letters` };
  return null;
}

// Checks one pair before it goes into `list`. `ignoreIndex` is the pair being edited, so it doesn't
// clash with itself. Returns { ok: true, pair } or { ok: false, field, error }.
export function checkPair(en, he, list = [], ignoreIndex = -1, kind = KINDS.EN_HE) {
  en = clean(en);
  he = clean(he);
  const hebrew = kind === KINDS.HE_HE;
  const problem = checkWord(en, 'en', hebrew) ?? checkWord(he, 'he', hebrew);
  if (problem) return problem;
  if (hebrew && en === he) return { ok: false, field: 'he', error: 'The two words must be different' };
  const others = list.filter((_, i) => i !== ignoreIndex);
  // Two pairs with the same word on either side would put two right answers on the balloons.
  if (others.some((p) => p.en.toLowerCase() === en.toLowerCase())) return { ok: false, field: 'en', error: `"${en}" is already in this list` };
  if (others.some((p) => p.he === he)) return { ok: false, field: 'he', error: `"${he}" is already in this list` };
  return { ok: true, pair: { en, he } };
}

// The lines of an uploaded file that hold words: numbered from 1, blank lines and # comments left out.
function fileLines(text) {
  return String(text ?? '')
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .map((raw, index) => ({ line: index + 1, text: raw.trim() }))
    .filter((l) => l.text && !l.text.startsWith('#'));
}

const unquote = (s) => s.trim().replace(/^(["'])(.*)\1$/, '$2').trim();
const splitFileLine = (text) => splitLine(text, [';'])?.map(unquote) ?? null;

// Hebrew–Hebrew when most lines have Hebrew on both sides and no English letters.
export function detectKind(text) {
  const lines = fileLines(text);
  const hebrew = lines.filter(({ text: t }) => {
    const parts = splitFileLine(t);
    return parts && !LATIN.test(t) && HEBREW.test(parts[0]) && HEBREW.test(parts[1]);
  });
  return hebrew.length > lines.length / 2 ? KINDS.HE_HE : KINDS.EN_HE;
}

const HEADER = /english|hebrew|word|translation|אנגלית|עברית|מילה/i;

// The pairs in an uploaded file, one per line ("dog,כלב", "dog - כלב", a tab...), checked against
// `existing` and each other. Returns { pairs, skipped: [{ line, text, error }] }. A header row is dropped.
export function importWords(text, kind = KINDS.EN_HE, existing = []) {
  const pairs = [];
  const skipped = [];
  fileLines(text).forEach(({ line, text: raw }, i) => {
    const parts = splitFileLine(raw);
    let check = null;
    if (parts) {
      const [left, right] = parts;
      if (kind === KINDS.HE_HE) check = checkPair(left, right, [...existing, ...pairs], -1, kind);
      else if (LATIN.test(left) && HEBREW.test(right) && !HEBREW.test(left)) check = checkPair(left, right, [...existing, ...pairs], -1, kind);
      else if (HEBREW.test(left) && LATIN.test(right) && !HEBREW.test(right)) check = checkPair(right, left, [...existing, ...pairs], -1, kind);
    }
    if (check?.ok) {
      pairs.push(check.pair);
      return;
    }
    if (i === 0 && HEADER.test(raw)) return;
    skipped.push({ line, text: raw, error: check?.error ?? 'Not a word pair' });
  });
  return { pairs, skipped };
}

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

const presetCopies = () =>
  PRESET_LISTS.map((l) => ({ kind: KINDS.EN_HE, ...l, locked: false, pairs: l.pairs.map((p) => ({ ...p })) }));

// Keeps only well-formed lists and pairs from stored data, which may be old, hand-edited or broken.
function normalize(data) {
  const lists = (Array.isArray(data?.lists) ? data.lists : [])
    .filter((l) => l && typeof l.id === 'string' && typeof l.name === 'string')
    .map((l) => {
      const kind = Object.values(KINDS).includes(l.kind) ? l.kind : KINDS.EN_HE;
      return {
        id: l.id,
        name: clean(l.name) || 'Untitled',
        kind,
        locked: l.locked === true,
        pairs: (Array.isArray(l.pairs) ? l.pairs : []).reduce((kept, p) => {
          const check = checkPair(p?.en, p?.he, kept, -1, kind);
          if (check.ok) kept.push(check.pair);
          return kept;
        }, []),
      };
    });
  return lists.length ? { lists, selectedId: data.selectedId } : null;
}

export class WordLibrary {
  constructor(data, storage) {
    const valid = normalize(data);
    this.lists = valid?.lists ?? presetCopies();
    this.selectedId = this.lists.some((l) => l.id === valid?.selectedId) ? valid.selectedId : this.lists[0].id;
    this.storage = storage;
  }

  // The saved library; the first time, the ready-made lists plus any list typed in the old text box.
  static load(storage = defaultStorage()) {
    let data = null;
    try {
      data = JSON.parse(storage?.getItem(LIBRARY_KEY) ?? 'null');
    } catch {
      data = null;
    }
    const library = new WordLibrary(data, storage);
    if (!normalize(data)) {
      const old = parseWordList(loadWordList(storage) ?? '').pairs;
      if (old.length) {
        const mine = library.create('My words');
        old.forEach((p) => library.addPair(mine.id, p.en, p.he));
      }
    }
    return library;
  }

  save() {
    try {
      this.storage?.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, selectedId: this.selectedId, lists: this.lists }));
    } catch {
      // storage unavailable (private mode) — the lists just won't be remembered
    }
  }

  get(id) {
    const list = this.lists.find((l) => l.id === id);
    if (!list) throw new Error(`no word list "${id}"`);
    return list;
  }

  get selected() {
    return this.get(this.selectedId);
  }

  select(id) {
    this.selectedId = this.get(id).id;
    this.save();
  }

  editable(id) {
    const list = this.get(id);
    if (list.locked) throw new Error(`"${list.name}" is locked`);
    return list;
  }

  // A new empty list, selected. The name gets a number if it's taken.
  create(name = 'New list', kind = KINDS.EN_HE) {
    if (!Object.values(KINDS).includes(kind)) throw new Error(`unknown list kind "${kind}"`);
    const base = clean(name) || 'New list';
    let unique = base;
    for (let n = 2; this.lists.some((l) => l.name === unique); n++) unique = `${base} ${n}`;
    let id;
    do id = `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    while (this.lists.some((l) => l.id === id));
    const list = { id, name: unique, kind, locked: false, pairs: [] };
    this.lists.push(list);
    this.selectedId = id;
    this.save();
    return list;
  }

  // A new list from an uploaded file, named after it and selected. Returns { ok, id, added, skipped },
  // or { ok: false, error, skipped } (and no list) when the file has too few good pairs.
  importFile(name, text) {
    const kind = detectKind(text);
    const { pairs: found, skipped } = importWords(text, kind);
    if (found.length < MIN_PAIRS) return { ok: false, error: 'The file needs at least 2 word pairs', skipped };
    const list = this.create(clean(String(name ?? '').replace(/\.[^.]*$/, '')) || 'Uploaded words', kind);
    list.pairs = found;
    this.save();
    return { ok: true, id: list.id, added: found.length, skipped };
  }

  rename(id, name) {
    const list = this.editable(id);
    list.name = clean(name) || list.name;
    this.save();
    return list;
  }

  // The last list can't go, so there is always something to play.
  remove(id) {
    this.editable(id);
    if (this.lists.length === 1) throw new Error("can't delete the only list");
    const index = this.lists.findIndex((l) => l.id === id);
    this.lists.splice(index, 1);
    if (this.selectedId === id) this.selectedId = this.lists[Math.min(index, this.lists.length - 1)].id;
    this.save();
  }

  // Only while the list is empty: its words were checked for the old kind.
  setKind(id, kind) {
    const list = this.editable(id);
    if (!Object.values(KINDS).includes(kind)) throw new Error(`unknown list kind "${kind}"`);
    if (list.pairs.length && kind !== list.kind) throw new Error("can't change the kind of a list with words");
    list.kind = kind;
    this.save();
  }

  setLocked(id, locked) {
    this.get(id).locked = Boolean(locked);
    this.save();
  }

  addPair(id, en, he) {
    const list = this.editable(id);
    const check = checkPair(en, he, list.pairs, -1, list.kind);
    if (check.ok) {
      list.pairs.push(check.pair);
      this.save();
    }
    return check;
  }

  updatePair(id, index, en, he) {
    const list = this.editable(id);
    if (!list.pairs[index]) throw new Error(`no pair ${index}`);
    const check = checkPair(en, he, list.pairs, index, list.kind);
    if (check.ok) {
      list.pairs[index] = check.pair;
      this.save();
    }
    return check;
  }

  removePair(id, index) {
    const list = this.editable(id);
    if (!list.pairs[index]) throw new Error(`no pair ${index}`);
    list.pairs.splice(index, 1);
    this.save();
  }
}
