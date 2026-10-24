// Word-list parsing and persistence. No Phaser or DOM here, so it runs (and is tested) in Node.

export const STORAGE_KEY = 'balloon-archer-words';

export const SAMPLE_PAIRS = [
  { en: 'dog', he: 'כלב' },
  { en: 'cat', he: 'חתול' },
  { en: 'house', he: 'בית' },
  { en: 'water', he: 'מים' },
  { en: 'apple', he: 'תפוח' },
  { en: 'book', he: 'ספר' },
  { en: 'sun', he: 'שמש' },
  { en: 'tree', he: 'עץ' },
  { en: 'car', he: 'מכונית' },
  { en: 'bread', he: 'לחם' },
  { en: 'friend', he: 'חבר' },
  { en: 'good morning', he: 'בוקר טוב' },
];

const HEBREW = /[֐-׿]/;
const LATIN = /[A-Za-z]/;
const SINGLE_SEPARATORS = ['-', '–', '—', ',', ':', '='];

// Tab and ' - ' win over the bare characters so entries like "ice-cream - גלידה" keep their hyphen.
// `extra` adds more single-character separators (an uploaded file also splits on ';').
export function splitLine(line, extra = []) {
  for (const sep of ['\t', ' - ']) {
    const i = line.indexOf(sep);
    if (i >= 0) return [line.slice(0, i), line.slice(i + sep.length)];
  }
  let best = -1;
  for (const sep of [...SINGLE_SEPARATORS, ...extra]) {
    const i = line.indexOf(sep);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best < 0 ? null : [line.slice(0, best), line.slice(best + 1)];
}

export function parseWordList(text) {
  const pairs = [];
  const errors = [];
  const seen = new Set();
  String(text ?? '')
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const parts = splitLine(line);
      let pair = null;
      if (parts) {
        const [left, right] = parts.map((s) => s.trim());
        if (LATIN.test(left) && HEBREW.test(right) && !HEBREW.test(left)) pair = { en: left, he: right };
        else if (HEBREW.test(left) && LATIN.test(right) && !HEBREW.test(right)) pair = { en: right, he: left };
      }
      if (!pair) {
        errors.push({ line: index + 1, text: raw });
        return;
      }
      const key = `${pair.en.toLowerCase()}\u0000${pair.he}`;
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push(pair);
    });
  return { pairs, errors };
}

export function serializeWordList(pairs) {
  return (pairs ?? []).map(({ en, he }) => `${en} - ${he}`).join('\n');
}

// Reading globalThis.localStorage can itself throw (blocked storage, Node without a storage file).
function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadWordList(storage = defaultStorage()) {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function saveWordList(text, storage = defaultStorage()) {
  try {
    storage?.setItem(STORAGE_KEY, String(text));
  } catch {
    // storage unavailable (private mode) — the list just won't be remembered
  }
}
