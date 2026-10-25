import { test, expect } from '@playwright/test';
import { pairs, useWords } from './words.js';
import { GAME_H, GAME_W, clickBalloon, snapshot } from './play.js';

// From the word list screen into a balloon round, through the map when the game has one.
async function playBalloons(page) {
  await page.locator('#word-start').click();
  await expect(page.locator('#word-form')).toBeHidden();
  await page.waitForFunction(
    () => (window.game.scene.isActive('game') && window.game.scene.getScene('game').state === 'playing') ||
      window.game.scene.getScene('map')?.state === 'map',
    null, { timeout: 30_000 });
  const spot = await page.evaluate(({ W, H }) => {
    const map = window.game.scene.getScene('map');
    if (!map || !window.game.scene.isActive('map')) return null;
    const s = map.spots.balloons;
    const r = window.game.canvas.getBoundingClientRect();
    return { x: r.left + (s.x * r.width) / W, y: r.top + (s.y * r.height) / H };
  }, { W: GAME_W, H: GAME_H });
  if (spot) {
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.click(spot.x, spot.y);
  }
  await page.waitForFunction(
    () => window.game.scene.isActive('game') && window.game.scene.getScene('game').state === 'playing' &&
      window.game.scene.getScene('game').balloons?.length > 0,
    null, { timeout: 30_000 });
}

const WORDS = pairs('dog=כלב', 'cat=חתול', 'house=בית', 'sun=שמש');
const DICTIONARY = 'https://en.wiktionary.org/w/api.php?**';

let pageErrors;

test.beforeEach(async ({ page }) => {
  // Several waves per test; on a busy machine (software WebGL) that can take a while.
  test.setTimeout(150_000);
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));
  await page.goto('/');
  await expect(page.locator('#word-form')).toBeVisible();
});

test.afterEach(() => {
  expect(pageErrors.map((e) => String(e.stack || e))).toEqual([]);
});

// Record every word the game asks to say, with the wave it was said in (Vite serves the game's own
// speech.js module at this URL).
async function recordSpeech(page) {
  await page.evaluate(async () => {
    const { voice } = await import('/src/speech.js');
    window.said = [];
    const say = voice.say.bind(voice);
    voice.say = (text) => {
      window.said.push({ text, wave: window.game?.scene?.getScene('game')?.waveId });
      return say(text);
    };
  });
}

const said = (page) => page.evaluate(() => window.said);

test('says the question word at the start of every question, and its answer once it is answered', async ({ page }) => {
  const asked = [];
  await page.route(DICTIONARY, (route) => {
    asked.push(new URL(route.request().url()).searchParams.get('titles'));
    return route.fulfill({ json: { query: { pages: [{ title: 'File:en-us-word.ogg', imageinfo: [{ url: 'https://audio.invalid/word.ogg' }] }] } } });
  });
  await page.route('https://commons.wikimedia.org/w/api.php?**', (route) => route.fulfill({ json: { query: { pages: [] } } }));
  await useWords(page, WORDS);
  await recordSpeech(page);
  // Hebrew questions: the Hebrew word is said first, the English answer at the end.
  await page.locator('#word-direction').selectOption('he-en');
  await playBalloons(page);

  for (let i = 0; i < 2; i++) {
    const { current } = await snapshot(page);
    expect(current.prompt).toBe(current.pair.he);
    const wave = await page.evaluate(() => window.game.scene.getScene('game').waveId);
    const inWave = async () => (await said(page)).filter((e) => e.wave === wave).map((e) => e.text);
    expect(await inWave()).toEqual([current.prompt]);
    await clickBalloon(page, 'correct');
    await expect.poll(inWave).toEqual([current.prompt, current.answer]);
    expect(current.answer).toBe(current.pair.en);
    await page.waitForFunction((w) => window.game.scene.getScene('game').waveId > w, wave, { timeout: 30_000 });
  }
  // Wiktionary is asked only about the English answers, each once.
  expect(asked.length).toBeGreaterThan(0);
  expect(new Set(asked).size).toBe(asked.length);
  for (const word of asked) expect(['dog', 'cat', 'house', 'sun']).toContain(word);
});

test('the lava level says its word, and again from the 🔊 button or Space', async ({ page }) => {
  await page.route(DICTIONARY, (route) =>
    route.fulfill({ json: { query: { pages: [{ title: 'File:en-us-word.ogg', imageinfo: [{ url: 'https://audio.invalid/word.ogg' }] }] } } }));
  await useWords(page, WORDS, '/?level=lava');
  await page.waitForFunction(() => window.game?.scene?.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  await recordSpeech(page);
  const word = await page.evaluate(() => window.game.scene.getScene('lava').run.word);

  const btn = await page.evaluate(({ W, H }) => {
    const b = window.game.scene.getScene('lava').sayButton;
    const r = window.game.canvas.getBoundingClientRect();
    return { x: r.left + (b.x * r.width) / W, y: r.top + (b.y * r.height) / H };
  }, { W: GAME_W, H: GAME_H });
  await page.mouse.click(btn.x, btn.y);
  await expect.poll(async () => (await said(page)).map((e) => e.text)).toEqual([word]);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await said(page)).map((e) => e.text)).toEqual([word, word]);
  // Neither moved the robot.
  expect(await page.evaluate(() => window.game.scene.getScene('lava').run.position)).toBe(0);
});

test('a word is looked up once: after a reload the saved answer is used', async ({ page }) => {
  const asked = [];
  await page.route(DICTIONARY, (route) => {
    asked.push(new URL(route.request().url()).searchParams.get('titles'));
    return route.fulfill({ json: { query: { pages: [{ title: 'File:en-us-word.ogg', imageinfo: [{ url: 'https://audio.invalid/word.ogg' }] }] } } });
  });
  await useWords(page, WORDS, '/?level=lava');
  await page.waitForFunction(() => window.game?.scene?.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  const word = await page.evaluate(() => window.game.scene.getScene('lava').run.word);
  await expect.poll(() => asked).toEqual([word]);

  await page.reload();
  await page.waitForFunction(() => window.game?.scene?.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  await recordSpeech(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await said(page)).length).toBe(1);
  const again = await page.evaluate(() => window.game.scene.getScene('lava').run.word);
  // Only a word this browser hasn't seen yet goes to the API.
  expect(asked).toEqual(again === word ? [word] : [word, again]);
});

test('a Hebrew–Hebrew list says its Hebrew word, from the Hebrew recordings on Commons', async ({ page }) => {
  const asked = [];
  await page.route(DICTIONARY, (route) => route.abort());
  await page.route('https://commons.wikimedia.org/w/api.php?**', (route) => {
    asked.push(new URL(route.request().url()).searchParams.get('gsrsearch'));
    return route.fulfill({ json: { query: { pages: [] } } });
  });
  await useWords(page, pairs('חם=קר', 'גדול=קטן'), '/?level=lava', 'he-he');
  await page.waitForFunction(() => window.game?.scene?.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  const word = await page.evaluate(() => window.game.scene.getScene('lava').run.word);
  expect(['קר', 'קטן']).toContain(word);
  await expect.poll(() => asked).toEqual([`intitle:"LL-Q9288" intitle:"${word}"`]);
});

test('the lava level says both words when a word is crossed', async ({ page }) => {
  await page.route(DICTIONARY, (route) => route.fulfill({ json: { query: { pages: [] } } }));
  await page.route('https://commons.wikimedia.org/w/api.php?**', (route) => route.fulfill({ json: { query: { pages: [] } } }));
  await useWords(page, WORDS, '/?level=lava');
  await page.waitForFunction(() => window.game?.scene?.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  await recordSpeech(page);
  const { word, prompt } = await page.evaluate(() => {
    const { run } = window.game.scene.getScene('lava');
    return { word: run.word, prompt: run.prompt };
  });
  // Type the word, one jump at a time.
  for (let i = 0; i < word.length; i++) {
    await page.waitForFunction((n) => {
      const s = window.game.scene.getScene('lava');
      return s.state === 'playing' && s.run.position === n;
    }, i, { timeout: 30_000 });
    await page.keyboard.press(`Key${word[i].toUpperCase()}`);
  }
  await expect.poll(async () => (await said(page)).map((e) => e.text).slice(0, 2), { timeout: 30_000 }).toEqual([prompt, word]);
});

test('the next lava word waits until both words have been said', async ({ page }) => {
  await page.route(DICTIONARY, (route) => route.fulfill({ json: { query: { pages: [] } } }));
  // The Hebrew word's lookup takes 3 s, longer than the usual pause between words.
  await page.route('https://commons.wikimedia.org/w/api.php?**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.fulfill({ json: { query: { pages: [] } } }).catch(() => {});
  });
  await useWords(page, WORDS, '/?level=lava');
  await page.waitForFunction(() => window.game?.scene?.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  const word = await page.evaluate(() => window.game.scene.getScene('lava').run.word);
  for (let i = 0; i < word.length; i++) {
    await page.waitForFunction((n) => {
      const s = window.game.scene.getScene('lava');
      return s.state === 'playing' && s.run.position === n;
    }, i, { timeout: 30_000 });
    await page.keyboard.press(`Key${word[i].toUpperCase()}`);
  }
  await page.waitForFunction(() => window.game.scene.getScene('lava').state === 'jumping', null, { timeout: 30_000 });
  const crossed = Date.now();
  await page.waitForFunction(() => window.game.scene.getScene('lava').wordIndex === 1, null, { timeout: 30_000 });
  // Normally about 2.5 s (the jump and the pause); here the slow lookup holds it longer.
  expect(Date.now() - crossed).toBeGreaterThan(3000);
});
