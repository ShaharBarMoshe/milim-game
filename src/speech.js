// Says words out loud with real recordings, found with one MediaWiki API request per word (no key, CORS
// allowed with origin=*): English ones on the word's Wiktionary page, Hebrew ones among the Lingua Libre
// recordings on Wikimedia Commons. A word with no recording is said by the browser's own voice for its
// language (speechSynthesis), when the device has one. Phaser-free. Speech is best effort: a word that can't
// be said, or whose request fails or takes too long, is skipped silently, and the game never waits for it.

export const WIKTIONARY_API = 'https://en.wiktionary.org/w/api.php';
export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

// The request listing the files on `word`'s Wiktionary page, with their URLs.
export function lookupUrl(word) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    titles: word, generator: 'images', gimlimit: 'max', prop: 'imageinfo', iiprop: 'url',
  });
  return `${WIKTIONARY_API}?${params}`;
}
// The search for Lingua Libre's Hebrew recordings of `word` on Commons, named like
// "LL-Q9288 (heb)-<speaker>-<word>.wav" (Q9288 is Hebrew on Wikidata), with their URLs.
export function hebrewLookupUrl(word) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrnamespace: '6', gsrlimit: '50', gsrsearch: `intitle:"LL-Q9288" intitle:"${word}"`,
    prop: 'imageinfo', iiprop: 'url',
  });
  return `${COMMONS_API}?${params}`;
}

// Longest wait for a word, from asking to the recording starting; after that it is dropped.
export const SPEAK_TIMEOUT_MS = 6000;
// A recording is a second or two; never hold the queue longer than this once it plays.
const MAX_PLAY_MS = 4000;
// Lookups are saved in the browser, so a word is asked about once, not on every visit. A word with no
// recording is asked about again after NO_RECORDING_DAYS, since Wiktionary may have gained one by then.
export const CACHE_KEY = 'balloon-archer-speech';
const NO_RECORDING_DAYS = 30;
const MAX_CACHED_WORDS = 1000;

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

// A word the browser wouldn't play yet is tried again on the next click or key press, unless it's older than this.
const RETRY_WITHIN_MS = 20000;

// Calls `retry` once, inside the page's next click, tap or key press: browsers only let a page start sound
// after the player has interacted with it (opening ?level=lava directly, for example, plays nothing).
function onNextGesture(retry) {
  const target = globalThis.window;
  if (!target?.addEventListener) return;
  const once = () => {
    target.removeEventListener('pointerdown', once, true);
    target.removeEventListener('keydown', once, true);
    retry();
  };
  target.addEventListener('pointerdown', once, true);
  target.addEventListener('keydown', once, true);
}

// The word to look up, or null when the text isn't plain English (Hebrew, digits, accents, …).
export function speakable(text) {
  const word = String(text ?? '').trim().toLowerCase();
  return /^[a-z]+(?:[ '-][a-z]+)*$/.test(word) ? word : null;
}

// Hebrew vowel points and cantillation marks: recordings are named without them. (U+05BE, the maqaf, is a hyphen.)
const HEBREW_MARKS = /[\u0591-\u05BD\u05BF-\u05C7]/g;

// What to say and in which language: { word, lang: 'en' | 'he' }, or null for anything else (digits, mixed
// alphabets, other languages).
export function speechWord(text) {
  const en = speakable(text);
  if (en) return { word: en, lang: 'en' };
  const he = String(text ?? '').replace(HEBREW_MARKS, '').replace(/\u05BE/g, '-').trim().replace(/\s+/g, ' ');
  return /^[א-ת]+(?:[ -][א-ת]+)*$/.test(he) ? { word: he, lang: 'he' } : null;
}

// How good a Commons file name is as the recording of `word` (0 = not an English recording of it).
// Names look like en-us-dog.ogg, en-us-house-noun.ogg, En-uk-dog.ogg or LL-Q1860_(eng)-Speaker-dog.wav.
function audioRank(file, word) {
  const name = file.replace(/^File:/i, '').replace(/ /g, '_').toLowerCase();
  const base = name.replace(/\.(ogg|oga|opus|mp3|wav|flac)$/, '');
  if (base === name) return 0;
  const w = word.replace(/ /g, '_');
  if (base === `en-us-${w}`) return 5;
  if (base.startsWith(`en-us-${w}-`)) return 4;
  if (/^en-us-/.test(base) && base.endsWith(`-${w}`)) return 3;
  if (/^en-[a-z]+-/.test(base) && base.endsWith(`-${w}`)) return 2;
  if (/^ll-q1860_\(eng\)-/.test(base) && base.endsWith(`-${w}`)) return 1;
  return 0;
}

// The URL of the best English recording of `word` in a lookupUrl() response, or null.
export function pickAudio(response, word) {
  let best = null;
  let bestRank = 0;
  for (const page of response?.query?.pages ?? []) {
    const url = page?.imageinfo?.[0]?.url;
    const rank = typeof page?.title === 'string' && typeof url === 'string' ? audioRank(page.title, word) : 0;
    if (rank > bestRank) [best, bestRank] = [url, rank];
  }
  return best;
}

// The URL of a Hebrew recording of exactly `word` in a hebrewLookupUrl() response, or null. The search
// also finds longer phrases with the word in them ("כלב ים" for "כלב"), so the name must end in it.
export function pickHebrewAudio(response, word) {
  const pages = [...(response?.query?.pages ?? [])].sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));
  for (const page of pages) {
    const url = page?.imageinfo?.[0]?.url;
    const name = typeof page?.title === 'string' ? page.title.replace(/^File:/i, '').replace(/_/g, ' ') : '';
    // Some names have vowel points (בַּיִת); a maqaf stays, so "אלף־בית" isn't taken for "בית".
    const base = name.replace(/\.(wav|ogg|oga|opus|mp3|flac)$/i, '').replace(HEBREW_MARKS, '');
    const ends = [word, word.replace(/-/g, '\u05BE')].some((w) => base.endsWith(`-${w}`));
    if (typeof url === 'string' && base.length < name.length && /^LL-Q9288 \(heb\)-/i.test(base) && ends) return url;
  }
  return null;
}

// The browser's voice for `lang` ('en' or 'he'), preferring the country's own (en-US, he-IL). Hebrew may
// still carry its old code, iw.
export function pickVoice(voices, lang) {
  const code = (v) => String(v?.lang ?? '').replace('_', '-').toLowerCase();
  const prefixes = lang === 'he' ? ['he', 'iw'] : [lang];
  const fits = [...(voices ?? [])].filter((v) => prefixes.some((p) => code(v) === p || code(v).startsWith(`${p}-`)));
  const home = lang === 'he' ? ['he-il', 'iw-il'] : ['en-us'];
  return fits.find((v) => home.includes(code(v))) ?? fits[0] ?? null;
}

const browserSynth = () => {
  try {
    return globalThis.speechSynthesis ?? null;
  } catch {
    return null;
  }
};
const browserUtterance = (text) => new globalThis.SpeechSynthesisUtterance(text);
// How long to wait for the browser's voice list, which some browsers fill in only after a moment.
const VOICES_WAIT_MS = 1000;

export class Speaker {
  constructor({
    fetch = (...args) => globalThis.fetch(...args),
    createAudio = (url) => new Audio(url),
    now = () => Date.now(),
    timeout = SPEAK_TIMEOUT_MS,
    waitForGesture = onNextGesture,
    storage = defaultStorage(),
    synth = browserSynth(),
    createUtterance = browserUtterance,
  } = {}) {
    this.storage = storage;
    this.synth = synth; // speechSynthesis, for words with no recording (null: stay silent)
    this.createUtterance = createUtterance;
    this.saved = null; // word -> { url: string | null, at }, read from storage on first use
    this.fetch = fetch;
    this.waitForGesture = waitForGesture;
    this.blocked = null; // { replay, generation, at }: the last word the browser refused to start
    this.createAudio = createAudio;
    this.now = now;
    this.timeout = timeout;
    this.urls = new Map(); // word -> Promise<url | null>
    this.queue = Promise.resolve();
    this.generation = 0;
    this.playing = null;
  }

  // Queue `text` to be said after anything already queued. Resolves true if it was heard, never rejects.
  say(text) {
    const word = speechWord(text);
    if (!word) return Promise.resolve(false);
    const deadline = this.now() + this.timeout;
    const generation = this.generation;
    const turn = this.queue.then(() => this.speak(word, deadline, generation)).catch(() => false);
    this.queue = turn;
    return turn;
  }

  // Drop everything queued and silence the current word (leaving a scene).
  stop() {
    this.generation++;
    this.blocked = null;
    this.playing?.pause();
    this.playing = null;
    if (this.speaking) {
      this.speaking = null;
      try {
        this.synth?.cancel?.();
      } catch {
        // nothing to silence
      }
    }
  }

  // `item` is a speechWord(): { word, lang }.
  async speak(item, deadline, generation) {
    const current = () => generation === this.generation && this.now() < deadline;
    if (!current()) return false;
    const url = await this.lookup(item, deadline);
    if (!current()) return false;
    return url ? this.play(url, deadline, generation) : this.sayAloud(item, deadline, generation);
  }

  lookup({ word, lang }, deadline) {
    if (!this.urls.has(word)) {
      const saved = this.savedLookup(word);
      if (saved !== undefined) {
        this.urls.set(word, Promise.resolve(saved));
      } else {
        const request = this.request(word, lang, deadline);
        this.urls.set(word, request);
        // A failed or slow request isn't remembered: it may work next time.
        request.then((url) => (url === undefined ? this.urls.delete(word) : this.saveLookup(word, url)));
      }
    }
    return this.urls.get(word).then((url) => url ?? null);
  }

  // ------------------------------------------------ the saved lookups

  readSaved() {
    if (this.saved) return this.saved;
    this.saved = new Map();
    try {
      const data = JSON.parse(this.storage?.getItem(CACHE_KEY) ?? 'null');
      for (const [word, entry] of Object.entries(data && typeof data === 'object' ? data : {})) {
        if ((typeof entry?.url === 'string' || entry?.url === null) && Number.isFinite(entry?.at)) this.saved.set(word, entry);
      }
    } catch {
      // unreadable: start afresh
    }
    return this.saved;
  }

  // The saved recording URL, null for "Wiktionary has none", undefined when it must be looked up.
  savedLookup(word) {
    const entry = this.readSaved().get(word);
    if (!entry) return undefined;
    if (entry.url === null && this.now() - entry.at > NO_RECORDING_DAYS * 86_400_000) return undefined;
    return entry.url;
  }

  saveLookup(word, url) {
    const saved = this.readSaved();
    saved.delete(word);
    saved.set(word, { url, at: this.now() });
    // Keep the newest words when there are too many.
    while (saved.size > MAX_CACHED_WORDS) saved.delete(saved.keys().next().value);
    try {
      this.storage?.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(saved)));
    } catch {
      // storage full or blocked: the word is still remembered until the page closes
    }
  }

  // The recording URL, null when there is none, undefined when the request failed.
  async request(word, lang, deadline) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), Math.max(0, deadline - this.now()));
    try {
      const res = await Promise.race([
        this.fetch(lang === 'he' ? hebrewLookupUrl(word) : lookupUrl(word), { signal: controller?.signal }),
        new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - this.now()))),
      ]);
      if (!res) return undefined;
      if (res.status === 404) return null;
      if (!res.ok) return undefined;
      const body = await res.json();
      return lang === 'he' ? pickHebrewAudio(body, word) : pickAudio(body, word);
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  play(url, deadline, generation) {
    return new Promise((resolve) => {
      let audio;
      let started = false;
      let timer;
      const done = (heard) => {
        clearTimeout(timer);
        if (this.playing === audio) this.playing = null;
        resolve(heard);
      };
      try {
        audio = this.createAudio(url);
        this.playing = audio;
        audio.addEventListener?.('ended', () => done(true));
        audio.addEventListener?.('error', () => done(started));
        // Not playing by the deadline: give up on it. Playing: let it finish, up to MAX_PLAY_MS.
        timer = setTimeout(() => {
          if (!started) audio.pause?.();
          done(started);
        }, Math.max(0, deadline - this.now()));
        Promise.resolve(audio.play())
          .then(() => {
            if (generation !== this.generation) return audio.pause?.();
            started = true;
            clearTimeout(timer);
            timer = setTimeout(() => done(true), MAX_PLAY_MS);
          })
          .catch((error) => {
            if (error?.name === 'NotAllowedError') this.retryOnGesture(() => Promise.resolve(this.createAudio(url).play()).catch(() => {}), generation);
            done(false);
          });
      } catch {
        done(false);
      }
    });
  }

  // ------------------------------------------------ the browser's voice

  // Say `word` with the browser's voice for its language. False when there's no such voice or it fails.
  async sayAloud({ word, lang }, deadline, generation) {
    const synth = this.synth;
    if (!synth?.speak || !this.createUtterance) return false;
    const voice = pickVoice(await this.voices(deadline), lang);
    if (!voice || generation !== this.generation || this.now() >= deadline) return false;
    const utter = () => {
      const u = this.createUtterance(word);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 0.85; // a little slower, for learners
      return u;
    };
    return new Promise((resolve) => {
      let timer;
      let utterance;
      const done = (heard) => {
        clearTimeout(timer);
        if (this.speaking === utterance) this.speaking = null;
        resolve(heard);
      };
      try {
        utterance = utter();
        utterance.onend = () => done(true);
        utterance.onerror = (event) => {
          // Like <audio>, the browser won't speak before the player has clicked or typed.
          if (event?.error === 'not-allowed') this.retryOnGesture(() => synth.speak(utter()), generation);
          done(false);
        };
        this.speaking = utterance;
        synth.speak(utterance);
        // Some browsers never fire 'end': don't hold the queue past a word's length.
        timer = setTimeout(() => done(true), MAX_PLAY_MS);
      } catch {
        done(false);
      }
    });
  }

  // The browser's voices, waiting a moment for the list when it's still empty.
  voices(deadline) {
    const read = () => {
      try {
        return this.synth.getVoices?.() ?? [];
      } catch {
        return [];
      }
    };
    const now = read();
    if (now.length || !this.synth.addEventListener) return Promise.resolve(now);
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.synth.removeEventListener?.('voiceschanged', finish);
        resolve(read());
      };
      const timer = setTimeout(finish, Math.max(0, Math.min(VOICES_WAIT_MS, deadline - this.now())));
      this.synth.addEventListener('voiceschanged', finish);
    });
  }

  // Say the refused word as soon as the player clicks or types (only the latest one, while still current).
  retryOnGesture(replay, generation) {
    this.blocked = { replay, generation, at: this.now() };
    if (this.listening) return;
    this.listening = true;
    this.waitForGesture(() => {
      this.listening = false;
      const word = this.blocked;
      this.blocked = null;
      if (!word || word.generation !== this.generation || this.now() - word.at > RETRY_WITHIN_MS) return;
      try {
        word.replay();
      } catch {
        // still refused: give up on this word
      }
    });
  }
}

// The game's one voice.
export const voice = new Speaker();
