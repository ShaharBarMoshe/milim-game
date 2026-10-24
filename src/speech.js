// Says English words out loud with Wiktionary's recordings: one MediaWiki API request lists the files on the
// word's page with their direct upload.wikimedia.org URLs (no key, CORS allowed with origin=*). Phaser-free. Speech is best effort: a word that isn't English, has no
// recording, or whose request fails or takes too long is skipped silently, and the game never waits for it.

export const WIKTIONARY_API = 'https://en.wiktionary.org/w/api.php';

// The request listing the files on `word`'s Wiktionary page, with their URLs.
export function lookupUrl(word) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    titles: word, generator: 'images', gimlimit: 'max', prop: 'imageinfo', iiprop: 'url',
  });
  return `${WIKTIONARY_API}?${params}`;
}
// Longest wait for a word, from asking to the recording starting; after that it is dropped.
export const SPEAK_TIMEOUT_MS = 6000;
// A recording is a second or two; never hold the queue longer than this once it plays.
const MAX_PLAY_MS = 4000;

// The word to look up, or null when the text isn't plain English (Hebrew, digits, accents, …).
export function speakable(text) {
  const word = String(text ?? '').trim().toLowerCase();
  return /^[a-z]+(?:[ '-][a-z]+)*$/.test(word) ? word : null;
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

export class Speaker {
  constructor({
    fetch = (...args) => globalThis.fetch(...args),
    createAudio = (url) => new Audio(url),
    now = () => Date.now(),
    timeout = SPEAK_TIMEOUT_MS,
  } = {}) {
    this.fetch = fetch;
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
    const word = speakable(text);
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
    this.playing?.pause();
    this.playing = null;
  }

  async speak(word, deadline, generation) {
    if (generation !== this.generation || this.now() >= deadline) return false;
    const url = await this.lookup(word, deadline);
    if (!url || generation !== this.generation || this.now() >= deadline) return false;
    return this.play(url, deadline, generation);
  }

  lookup(word, deadline) {
    if (!this.urls.has(word)) {
      const request = this.request(word, deadline);
      this.urls.set(word, request);
      // Only "no such word" is remembered; a failed or slow request may work next time.
      request.then((url) => url === undefined && this.urls.delete(word));
    }
    return this.urls.get(word).then((url) => url ?? null);
  }

  // The recording URL, null when Wiktionary has none, undefined when the request failed.
  async request(word, deadline) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), Math.max(0, deadline - this.now()));
    try {
      const res = await Promise.race([
        this.fetch(lookupUrl(word), { signal: controller?.signal }),
        new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - this.now()))),
      ]);
      if (!res) return undefined;
      if (res.status === 404) return null;
      if (!res.ok) return undefined;
      return pickAudio(await res.json(), word);
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
          .catch(() => done(false));
      } catch {
        done(false);
      }
    });
  }
}

// The game's one voice.
export const voice = new Speaker();
