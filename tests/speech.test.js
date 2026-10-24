import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Speaker, speakable, pickAudio, lookupUrl, SPEAK_TIMEOUT_MS, CACHE_KEY } from '../src/speech.js';
import { memoryStorage, throwingStorage } from './helpers.js';

// A lookupUrl() response (the files on a Wiktionary page), trimmed to what the game reads.
const FILE_URL = 'https://upload.wikimedia.org/x/';
const media = (...titles) => ({
  query: { pages: titles.map((title) => ({ title, imageinfo: [{ url: FILE_URL + title.replace(/^File:/, '') }] })) },
});
const DOG = media('File:Dog.jpg', 'File:En-uk-dog.ogg', 'File:en-us-dog.ogg', 'File:Nl-dog.ogg');
const DOG_URL = `${FILE_URL}en-us-dog.ogg`;

// A fake <audio>: play() resolves at once and 'ended' fires after `length` ms.
function fakeAudio(played, { length = 500, fail = false } = {}) {
  return (url) => {
    const listeners = {};
    const audio = {
      url,
      paused: true,
      addEventListener: (type, fn) => (listeners[type] = fn),
      pause: () => (audio.paused = true),
      play: () => {
        if (fail) return Promise.reject(new Error('NotAllowedError'));
        audio.paused = false;
        played.push(url);
        setTimeout(() => !audio.paused && listeners.ended?.(), length);
        return Promise.resolve();
      },
    };
    return audio;
  };
}

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

describe('what can be spoken', () => {
  it('takes plain English words and phrases', () => {
    expect(speakable(' Dog ')).toBe('dog');
    expect(speakable('ice cream')).toBe('ice cream');
    expect(speakable("o'clock")).toBe("o'clock");
    expect(speakable('t-shirt')).toBe('t-shirt');
  });

  it('ignores anything with non-English characters', () => {
    for (const text of ['כלב', 'dog כלב', 'café', 'room 101', '', '  ', null, undefined, '-dog']) {
      expect(speakable(text)).toBe(null);
    }
  });

  it('picks the best English recording of the word itself', () => {
    expect(pickAudio(DOG, 'dog')).toBe(DOG_URL);
    expect(pickAudio(media('File:En-uk-house.ogg', 'File:en-us-house-noun.ogg'), 'house')).toBe(`${FILE_URL}en-us-house-noun.ogg`);
    expect(pickAudio(media('File:LL-Q1860_(eng)-Someone-cat.wav', 'File:En-uk-cat.ogg'), 'cat')).toBe(`${FILE_URL}En-uk-cat.ogg`);
    // The API names files with spaces.
    expect(pickAudio(media('File:LL-Q1860 (eng)-Vealhurl-ice cream.wav'), 'ice cream'))
      .toBe(`${FILE_URL}LL-Q1860 (eng)-Vealhurl-ice cream.wav`);
    expect(pickAudio({ query: { pages: [{ title: 'File:en-us-dog.ogg' }] } }, 'dog')).toBe(null);
  });

  it('finds nothing without an English recording of that word', () => {
    expect(pickAudio(media('File:En-uk-a_cat.ogg', 'File:Nl-cat.ogg', 'File:LL-Q809_(pol)-Olaf-cat.wav', 'File:Cat.jpg'), 'cat')).toBe(null);
    expect(pickAudio(media('File:en-us-hotdog.ogg'), 'dog')).toBe(null);
    expect(pickAudio({}, 'dog')).toBe(null);
    expect(pickAudio(null, 'dog')).toBe(null);
  });
});

describe('Speaker', () => {
  let played;
  beforeEach(() => {
    vi.useFakeTimers();
    played = [];
  });
  afterEach(() => vi.useRealTimers());

  const speaker = (fetch, audio = {}, storage = memoryStorage()) => new Speaker({ fetch, createAudio: fakeAudio(played, audio), storage });

  it('looks the word up and plays its recording', async () => {
    const fetch = vi.fn(async () => json(DOG));
    const heard = speaker(fetch).say('Dog');
    await vi.runAllTimersAsync();
    expect(await heard).toBe(true);
    expect(fetch.mock.calls[0][0]).toBe(lookupUrl('dog'));
    expect(new URL(lookupUrl('dog')).searchParams.get('titles')).toBe('dog');
    expect(played).toEqual([DOG_URL]);
  });

  it('looks phrases up by their page name', async () => {
    const fetch = vi.fn(async () => json(media('File:en-us-ice cream.ogg')));
    const heard = speaker(fetch).say('Ice Cream');
    await vi.runAllTimersAsync();
    expect(await heard).toBe(true);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('titles')).toBe('ice cream');
  });

  it('says nothing and asks nothing for non-English text', async () => {
    const fetch = vi.fn();
    expect(await speaker(fetch).say('כלב')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('plays words one after another, not on top of each other', async () => {
    const s = speaker(async (url) => json(media(`File:en-us-${new URL(url).searchParams.get('titles')}.ogg`)), { length: 1000 });
    s.say('dog');
    s.say('cat');
    await vi.advanceTimersByTimeAsync(500);
    expect(played).toEqual([DOG_URL]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(played).toEqual([DOG_URL, `${FILE_URL}en-us-cat.ogg`]);
  });

  it('looks each word up once', async () => {
    const fetch = vi.fn(async () => json(DOG));
    const s = speaker(fetch);
    s.say('dog');
    s.say('dog');
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(played).toHaveLength(2);
  });

  it('stays silent when Wiktionary has no such page, and remembers that', async () => {
    const fetch = vi.fn(async () => json({ batchcomplete: true }));
    const s = speaker(fetch);
    const results = [s.say('qwzx'), s.say('qwzx')];
    await vi.runAllTimersAsync();
    expect(await Promise.all(results)).toEqual([false, false]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(played).toEqual([]);
  });

  it('carries on after a failed request, and tries the word again next time', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(json({}, 530))
      .mockResolvedValue(json(DOG));
    const s = speaker(fetch);
    const results = [s.say('dog'), s.say('dog'), s.say('dog')];
    await vi.runAllTimersAsync();
    expect(await Promise.all(results)).toEqual([false, false, true]);
    expect(played).toEqual([DOG_URL]);
  });

  it('stays silent when the page has no English recording', async () => {
    const heard = speaker(async () => json(media('File:Nl-dog.ogg'))).say('dog');
    await vi.runAllTimersAsync();
    expect(await heard).toBe(false);
    expect(played).toEqual([]);
  });

  it(`gives up on a response slower than ${SPEAK_TIMEOUT_MS / 1000}s and aborts it`, async () => {
    let signal;
    const fetch = vi.fn((url, init) => {
      signal = init.signal;
      return new Promise(() => {}); // never answers
    });
    const s = speaker(fetch);
    const heard = s.say('dog');
    let settled = false;
    heard.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(SPEAK_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await heard).toBe(false);
    expect(signal.aborted).toBe(true);
    expect(played).toEqual([]);
  });

  it('drops a word whose turn comes after its deadline', async () => {
    const fetch = vi.fn(async (url) => (new URL(url).searchParams.get('titles') === 'slow' ? new Promise(() => {}) : json(DOG)));
    const s = speaker(fetch);
    const slow = s.say('slow');
    const dog = s.say('dog'); // asked at the same time, so its 6 seconds are used up waiting for "slow"
    await vi.runAllTimersAsync();
    expect(await Promise.all([slow, dog])).toEqual([false, false]);
    expect(played).toEqual([]);
  });

  it('carries on when the browser refuses to play', async () => {
    const s = speaker(async () => json(DOG), { fail: true });
    const heard = s.say('dog');
    await vi.runAllTimersAsync();
    expect(await heard).toBe(false);
    s.createAudio = fakeAudio(played);
    const next = s.say('dog');
    await vi.runAllTimersAsync();
    expect(await next).toBe(true);
  });

  it('plays a word the browser refused before any click as soon as the player clicks or types', async () => {
    let gesture = null;
    let allowed = false;
    const createAudio = (url) => ({
      addEventListener: () => {},
      pause: () => {},
      play: () => {
        if (!allowed) return Promise.reject(Object.assign(new Error('needs a gesture'), { name: 'NotAllowedError' }));
        played.push(url);
        return Promise.resolve();
      },
    });
    const s = new Speaker({ fetch: async () => json(DOG), createAudio, waitForGesture: (retry) => (gesture = retry), storage: memoryStorage() });
    const heard = s.say('dog');
    await vi.runAllTimersAsync();
    expect(await heard).toBe(false);
    expect(played).toEqual([]);
    allowed = true; // the player clicks
    gesture();
    await vi.runAllTimersAsync();
    expect(played).toEqual([DOG_URL]);
  });

  it('does not replay a refused word after the scene moved on', async () => {
    let gesture = null;
    const createAudio = (url) => ({
      addEventListener: () => {},
      pause: () => {},
      play: () => (gesture ? (played.push(url), Promise.resolve()) : Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }))),
    });
    let retry = null;
    const s = new Speaker({ fetch: async () => json(DOG), createAudio, waitForGesture: (fn) => (retry = fn), storage: memoryStorage() });
    s.say('dog');
    await vi.runAllTimersAsync();
    s.stop();
    gesture = true;
    retry();
    await vi.runAllTimersAsync();
    expect(played).toEqual([]);
  });

  it('stop() silences the current word and drops the queued ones', async () => {
    const s = speaker(async () => json(DOG), { length: 1000 });
    s.say('dog');
    const queued = s.say('dog');
    await vi.advanceTimersByTimeAsync(10);
    s.stop();
    await vi.runAllTimersAsync();
    expect(await queued).toBe(false);
    expect(played).toHaveLength(1);
  });
});

describe('saved lookups', () => {
  let played;
  beforeEach(() => {
    vi.useFakeTimers();
    played = [];
  });
  afterEach(() => vi.useRealTimers());

  const DAY = 86_400_000;
  const make = (fetch, storage, now = () => Date.now()) => new Speaker({ fetch, createAudio: fakeAudio(played), storage, now });
  const sayAll = async (s, ...words) => {
    const heard = words.map((w) => s.say(w));
    await vi.runAllTimersAsync();
    return Promise.all(heard);
  };

  it('a word is looked up once, even after the page is reloaded', async () => {
    const storage = memoryStorage();
    const fetch = vi.fn(async () => json(DOG));
    expect(await sayAll(make(fetch, storage), 'dog', 'dog')).toEqual([true, true]);
    expect(await sayAll(make(fetch, storage), 'Dog')).toEqual([true]); // a new page, same browser
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(played).toEqual([DOG_URL, DOG_URL, DOG_URL]);
    expect(JSON.parse(storage.getItem(CACHE_KEY)).dog.url).toBe(DOG_URL);
  });

  it('only new words call the API', async () => {
    const storage = memoryStorage();
    const fetch = vi.fn(async (url) => json(media(`File:en-us-${new URL(url).searchParams.get('titles')}.ogg`)));
    await sayAll(make(fetch, storage), 'dog', 'cat');
    await sayAll(make(fetch, storage), 'dog', 'cat', 'sun');
    expect(fetch.mock.calls.map(([url]) => new URL(url).searchParams.get('titles'))).toEqual(['dog', 'cat', 'sun']);
  });

  it('remembers a word with no recording, and asks again after 30 days', async () => {
    const storage = memoryStorage();
    let now = Date.now();
    const fetch = vi.fn(async () => json(media('File:Dog.jpg')));
    expect(await sayAll(make(fetch, storage, () => now), 'zzz')).toEqual([false]);
    expect(await sayAll(make(fetch, storage, () => now), 'zzz')).toEqual([false]);
    expect(fetch).toHaveBeenCalledTimes(1);
    now += 31 * DAY;
    await sayAll(make(fetch, storage, () => now), 'zzz');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not save a failed request', async () => {
    const storage = memoryStorage();
    const fetch = vi.fn(async () => json({}, 500));
    await sayAll(make(fetch, storage), 'dog');
    expect(storage.getItem(CACHE_KEY)).toBeNull();
    fetch.mockImplementation(async () => json(DOG));
    expect(await sayAll(make(fetch, storage), 'dog')).toEqual([true]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['not json', '[1,2]', '{"dog": {"url": 5}}', '{"dog": "x"}'])('ignores unreadable saved data %j', async (raw) => {
    const fetch = vi.fn(async () => json(DOG));
    expect(await sayAll(make(fetch, memoryStorage({ [CACHE_KEY]: raw })), 'dog')).toEqual([true]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('still speaks when storage is blocked or missing', async () => {
    for (const storage of [throwingStorage(), undefined, null]) {
      const fetch = vi.fn(async () => json(DOG));
      const s = make(fetch, storage);
      expect(await sayAll(s, 'dog', 'dog')).toEqual([true, true]);
      expect(fetch).toHaveBeenCalledTimes(1); // remembered for the page at least
    }
  });
});
