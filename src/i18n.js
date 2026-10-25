// The game's UI language (English or Hebrew), with i18next. The texts live in src/locales/*.json as
// key → string config. No Phaser here, and the DOM is only touched when there is one, so it runs (and is
// tested) in Node. The chosen language is saved in the browser; nothing here throws on blocked storage.
import i18next from 'i18next';
import en from './locales/en.json';
import he from './locales/he.json';

export const LANG_KEY = 'balloon-archer-lang';
export const LANGUAGES = { en: { label: 'English', dir: 'ltr' }, he: { label: 'עברית', dir: 'rtl' } };
export const DEFAULT_LANGUAGE = 'en';

const listeners = new Set();

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function savedLanguage(storage) {
  try {
    const value = storage?.getItem(LANG_KEY);
    return LANGUAGES[value] ? value : null;
  } catch {
    return null;
  }
}

// <html lang dir>, so the HTML overlay flows right to left in Hebrew.
function applyToDocument(lng) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.lang = lng;
  document.documentElement.dir = LANGUAGES[lng].dir;
}

// Synchronous (the locales are bundled). The language is `lng`, else the saved one, else English.
export function initI18n({ storage = defaultStorage(), lng } = {}) {
  const language = LANGUAGES[lng] ? lng : savedLanguage(storage) ?? DEFAULT_LANGUAGE;
  if (i18next.isInitialized) {
    i18next.changeLanguage(language);
  } else {
    i18next.init({
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: Object.keys(LANGUAGES),
      resources: { en: { translation: en }, he: { translation: he } },
      initAsync: false,
      interpolation: { escapeValue: false }, // texts go into canvas text or textContent, never innerHTML
      returnNull: false,
    });
  }
  applyToDocument(language);
  return i18next;
}

export const t = (key, options) => i18next.t(key, options);

export const language = () => (LANGUAGES[i18next.language] ? i18next.language : DEFAULT_LANGUAGE);

export const isRtl = () => language() === 'he';

// Switch, save and tell the listeners. Unknown codes are ignored (false).
export function setLanguage(lng, storage = defaultStorage()) {
  if (!LANGUAGES[lng]) return false;
  if (!i18next.isInitialized) initI18n({ storage, lng });
  else i18next.changeLanguage(lng);
  try {
    storage?.setItem(LANG_KEY, lng);
  } catch {
    // storage unavailable (private mode): the language lasts until the page closes
  }
  applyToDocument(lng);
  listeners.forEach((fn) => fn(lng));
  return true;
}

export const toggleLanguage = (storage) => setLanguage(language() === 'he' ? 'en' : 'he', storage);

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// A Phaser text style, right to left in Hebrew.
export const textStyle = (style = {}) => (isRtl() ? { ...style, rtl: true } : style);
