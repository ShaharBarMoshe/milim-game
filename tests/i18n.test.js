// TC-I18N-001…008: the English/Hebrew UI (src/i18n.js and the key → string files in src/locales/).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import en from '../src/locales/en.json';
import he from '../src/locales/he.json';
import {
  DEFAULT_LANGUAGE, LANG_KEY, LANGUAGES, initI18n, isRtl, language, onLanguageChange, setLanguage, t, textStyle, toggleLanguage,
} from '../src/i18n.js';
import { ITEMS } from '../src/shop.js';
import { HEBREW_RE, LATIN_RE, memoryStorage, throwingStorage } from './helpers.js';

// { a: { b: 'x' } } → { 'a.b': 'x' }
function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

const EN = flatten(en);
const HE = flatten(he);
const vars = (s) => [...String(s).matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]).sort();
const PLURAL = /_(zero|one|two|few|many|other)$/;

afterEach(() => {
  initI18n({ storage: memoryStorage(), lng: 'en' });
  delete globalThis.document;
});

describe('the translation files', () => {
  it('have exactly the same keys in English and Hebrew', () => {
    const enKeys = Object.keys(EN).sort();
    const heKeys = Object.keys(HE).sort();
    expect(enKeys.filter((k) => !(k in HE)), 'missing in he.json').toEqual([]);
    expect(heKeys.filter((k) => !(k in EN)), 'missing in en.json').toEqual([]);
    expect(enKeys.length).toBeGreaterThan(20);
  });

  it('hold only non-empty strings', () => {
    for (const [file, flat] of [['en', EN], ['he', HE]]) {
      for (const [key, value] of Object.entries(flat)) {
        expect(typeof value, `${file}:${key}`).toBe('string');
        expect(value.trim(), `${file}:${key}`).not.toBe('');
      }
    }
  });

  it('use the same {{variables}} in both languages for every key', () => {
    const mismatched = Object.keys(EN).filter((k) => k in HE && vars(EN[k]).join() !== vars(HE[k]).join());
    expect(mismatched.map((k) => `${k}: en ${vars(EN[k])} / he ${vars(HE[k])}`)).toEqual([]);
  });

  it('give every plural an _one and an _other form', () => {
    for (const flat of [EN, HE]) {
      const bases = new Set(Object.keys(flat).filter((k) => PLURAL.test(k)).map((k) => k.replace(PLURAL, '')));
      for (const base of bases) {
        expect(flat, `${base}_one`).toHaveProperty([`${base}_one`]);
        expect(flat, `${base}_other`).toHaveProperty([`${base}_other`]);
      }
    }
  });

  it('are really translated: a Hebrew string with words in it has Hebrew letters', () => {
    // Allowed to stay Latin: the language's own name ("English" on the switch button in the Hebrew UI).
    const names = Object.values(LANGUAGES).map((l) => l.label);
    const untranslated = Object.entries(HE).filter(([key, value]) => {
      const words = String(value).replace(/\{\{[^}]*\}\}/g, '');
      return LATIN_RE.test(EN[key] ?? '') && /[A-Za-z]{2}/.test(words) && !HEBREW_RE.test(words) && !names.includes(value);
    });
    expect(untranslated.map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });

  it('have no Hebrew in the English file', () => {
    const names = Object.values(LANGUAGES).map((l) => l.label);
    expect(Object.entries(EN).filter(([, v]) => HEBREW_RE.test(v) && !names.some((n) => v.includes(n))).map(([k]) => k)).toEqual([]);
  });

  it('name every shop item in both languages', () => {
    const keys = Object.keys(EN);
    for (const it of ITEMS) {
      const named = keys.filter((k) => k.split('.').includes(it.id));
      expect(named.length, `no translation key for shop item ${it.id}`).toBeGreaterThan(0);
      for (const k of named) expect(HE).toHaveProperty([k]);
    }
  });
});

describe('initI18n', () => {
  it('starts in English with nothing saved', () => {
    initI18n({ storage: memoryStorage() });
    expect(DEFAULT_LANGUAGE).toBe('en');
    expect(language()).toBe('en');
    expect(isRtl()).toBe(false);
  });

  it('uses the saved language', () => {
    initI18n({ storage: memoryStorage({ [LANG_KEY]: 'he' }) });
    expect(language()).toBe('he');
    expect(isRtl()).toBe(true);
  });

  it('prefers an explicit language over the saved one', () => {
    initI18n({ storage: memoryStorage({ [LANG_KEY]: 'he' }), lng: 'en' });
    expect(language()).toBe('en');
  });

  it.each(['fr', '', 'HE ', '{"x":1}', 'null', 'undefined'])('falls back to English for the saved value %j', (raw) => {
    initI18n({ storage: memoryStorage({ [LANG_KEY]: raw }) });
    expect(language()).toBe('en');
  });

  it('never throws when storage is blocked or missing', () => {
    for (const storage of [throwingStorage(), null]) {
      expect(() => initI18n({ storage })).not.toThrow();
      expect(language()).toBe('en');
      expect(() => setLanguage('he', storage)).not.toThrow();
      expect(language()).toBe('he');
    }
  });

  it('is ready at once (synchronous), with the strings loaded', () => {
    initI18n({ storage: memoryStorage(), lng: 'he' });
    const key = Object.keys(HE).find((k) => !PLURAL.test(k) && !vars(HE[k]).length);
    expect(t(key)).toBe(HE[key]);
  });
});

describe('switching language', () => {
  it('saves the choice and tells the listeners, until they unsubscribe', () => {
    const storage = memoryStorage();
    initI18n({ storage });
    const heard = vi.fn();
    const off = onLanguageChange(heard);
    expect(setLanguage('he', storage)).toBe(true);
    expect(language()).toBe('he');
    expect(storage.getItem(LANG_KEY)).toBe('he');
    expect(heard).toHaveBeenCalledTimes(1);
    off();
    setLanguage('en', storage);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(storage.getItem(LANG_KEY)).toBe('en');
  });

  it('ignores an unknown language', () => {
    const storage = memoryStorage();
    initI18n({ storage });
    const heard = vi.fn();
    onLanguageChange(heard);
    expect(setLanguage('fr', storage)).toBe(false);
    expect(language()).toBe('en');
    expect(storage.getItem(LANG_KEY)).toBeNull();
    expect(heard).not.toHaveBeenCalled();
  });

  it('toggles English ↔ Hebrew', () => {
    initI18n({ storage: memoryStorage() });
    toggleLanguage();
    expect(language()).toBe('he');
    toggleLanguage();
    expect(language()).toBe('en');
  });

  it('sets the page direction and language when there is a page', () => {
    globalThis.document = { documentElement: { lang: 'en', dir: 'ltr' } };
    initI18n({ storage: memoryStorage() });
    setLanguage('he');
    expect(document.documentElement).toMatchObject({ lang: 'he', dir: 'rtl' });
    setLanguage('en');
    expect(document.documentElement).toMatchObject({ lang: 'en', dir: 'ltr' });
  });

  it('describes both languages, Hebrew right to left', () => {
    expect(LANGUAGES.en).toMatchObject({ dir: 'ltr' });
    expect(LANGUAGES.he).toMatchObject({ dir: 'rtl' });
    expect(HEBREW_RE.test(LANGUAGES.he.label)).toBe(true);
  });
});

describe('t() and textStyle()', () => {
  it('fills {{variables}} in both languages', () => {
    const key = Object.keys(EN).find((k) => vars(EN[k]).length && !PLURAL.test(k));
    expect(key, 'some string has a {{variable}}').toBeTruthy();
    const values = Object.fromEntries(vars(EN[key]).map((v) => [v, 'ZQ7']));
    for (const lng of ['en', 'he']) {
      initI18n({ storage: memoryStorage(), lng });
      const text = t(key, values);
      expect(text).toContain('ZQ7');
      expect(text).not.toMatch(/\{\{/);
    }
  });

  it('picks the plural form by count', () => {
    const base = Object.keys(EN).find((k) => k.endsWith('_one'))?.replace(/_one$/, '');
    if (!base) return; // no plurals in the files
    initI18n({ storage: memoryStorage(), lng: 'en' });
    expect(t(base, { count: 1 })).toBe(t(`${base}_one`, { count: 1 }));
    expect(t(base, { count: 5 })).toBe(t(`${base}_other`, { count: 5 }));
  });

  it('returns the key for a missing string, so nothing crashes', () => {
    initI18n({ storage: memoryStorage(), lng: 'he' });
    expect(t('no.such.key')).toBe('no.such.key');
  });

  it('adds rtl to a Phaser text style only in Hebrew, without changing the original', () => {
    const style = { fontSize: '20px', color: '#fff' };
    initI18n({ storage: memoryStorage(), lng: 'en' });
    expect(textStyle(style).rtl).toBeFalsy();
    expect(textStyle(style)).toMatchObject(style);
    initI18n({ storage: memoryStorage(), lng: 'he' });
    expect(textStyle(style)).toMatchObject({ ...style, rtl: true });
    expect(style).not.toHaveProperty('rtl');
  });
});

// TC-I18N-007: a pragmatic scan of the scenes for English UI text that skipped t(). It looks at the string
// literals passed straight to the calls that put text on screen; anything else (keys, texture names, colours)
// is not UI text. A literal counts as English when it has a run of 2+ Latin letters outside ${…}.
describe('no hard-coded English UI text in the scenes', () => {
  const SCENES = fileURLToPath(new URL('../src/scenes/', import.meta.url));
  const CALLS = [
    { re: /\.add\.text\(/g, arg: 2 },
    { re: /\.setText\(/g, arg: 0 },
    { re: /\bmakeButton\(/g, arg: 2 },
    { re: /\bshowMessage\(/g, arg: 0 },
    { re: /\bendGame\(/g, arg: 0 },
    { re: /\bendGame\(/g, arg: 1 },
  ];
  // Text that is the same in every language. Keep this short; prefer t().
  const ALLOW = new Set(['SHOP']);

  // The raw source of argument `n` of the call whose "(" is at `open`.
  function argAt(src, open, n) {
    let depth = 0;
    let quote = null;
    let index = 0;
    let start = open + 1;
    for (let i = open + 1; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') quote = c;
      else if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) {
        if (depth === 0) return index === n ? src.slice(start, i).trim() : null;
        depth--;
      } else if (c === ',' && depth === 0) {
        if (index === n) return src.slice(start, i).trim();
        index++;
        start = i + 1;
      }
    }
    return null;
  }

  const english = (literal) => {
    const body = literal.slice(1, -1).replace(/\$\{[^}]*\}/g, '');
    return /[A-Za-z]{2}/.test(body) && !ALLOW.has(body.trim());
  };

  it('every on-screen literal goes through t()', () => {
    const found = [];
    for (const file of readdirSync(SCENES).filter((f) => f.endsWith('.js'))) {
      const src = readFileSync(SCENES + file, 'utf8');
      for (const { re, arg } of CALLS) {
        for (const m of src.matchAll(re)) {
          const raw = argAt(src, m.index + m[0].length - 1, arg);
          if (!raw || !/^['"`]/.test(raw) || !/['"`]$/.test(raw)) continue; // not a plain literal (t(...), a variable, ...)
          if (english(raw)) found.push(`${file}:${src.slice(0, m.index).split('\n').length}  ${raw.slice(0, 60)}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
