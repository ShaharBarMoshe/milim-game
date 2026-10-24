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

test('says the English word when it is the question, and again once it is answered', async ({ page }) => {
  const asked = [];
  await page.route(DICTIONARY, (route) => {
    asked.push(new URL(route.request().url()).searchParams.get('titles'));
    return route.fulfill({ json: { query: { pages: [{ title: 'File:en-us-word.ogg', imageinfo: [{ url: 'https://audio.invalid/word.ogg' }] }] } } });
  });
  await useWords(page, WORDS);
  await recordSpeech(page);
  await playBalloons(page);

  for (let i = 0; i < 3; i++) {
    const { current } = await snapshot(page);
    const wave = await page.evaluate(() => window.game.scene.getScene('game').waveId);
    const inWave = async () => (await said(page)).filter((e) => e.wave === wave).map((e) => e.text);
    // Said at the start only when the banner shows the English word (otherwise it is the answer).
    expect(await inWave()).toEqual(current.prompt === current.pair.en ? [current.pair.en] : []);
    await clickBalloon(page, 'correct');
    await expect.poll(inWave).toEqual(current.prompt === current.pair.en ? [current.pair.en, current.pair.en] : [current.pair.en]);
    await page.waitForFunction((w) => window.game.scene.getScene('game').waveId > w, wave, { timeout: 30_000 });
  }
  // Only English words are looked up, each once.
  expect(asked.length).toBeGreaterThan(0);
  expect(new Set(asked).size).toBe(asked.length);
  for (const word of asked) expect(['dog', 'cat', 'house', 'sun']).toContain(word);
});

test('a Hebrew-Hebrew list says nothing and asks nothing', async ({ page }) => {
  const asked = [];
  await page.route(DICTIONARY, (route) => (asked.push(route.request().url()), route.abort()));
  await useWords(page, pairs('כלב=חיה שנובחת', 'חתול=חיה שמייללת', 'בית=מקום מגורים', 'שמש=כוכב'), '/', 'he-he');
  await recordSpeech(page);
  await playBalloons(page);
  await clickBalloon(page, 'correct');
  await clickBalloon(page, 'correct');
  expect(asked).toEqual([]);
});

for (const [name, handler] of [
  ['fails', (route) => route.abort('failed')],
  ['errors', (route) => route.fulfill({ status: 530, body: 'origin error' })],
  ['never answers', () => {}],
]) {
  test(`the game carries on when Wiktionary ${name}`, async ({ page }) => {
    await page.route(DICTIONARY, handler);
    await useWords(page, WORDS);
    await playBalloons(page);
    for (let i = 0; i < 3; i++) await clickBalloon(page, 'correct');
    expect((await snapshot(page)).stats.correct).toBe(3);
  });
}

test('the lava level says the word as it starts and again once it is crossed or lost', async ({ page }) => {
  await page.route(DICTIONARY, (route) => route.abort());
  await useWords(page, pairs('dog=כלב', 'cat=חתול', 'sun=שמש'), '/?level=lava');
  await page.waitForFunction(() => window.game?.scene?.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  // The first word was said in create(), before the recorder could be installed: start the level again.
  await recordSpeech(page);
  await page.evaluate(() => window.game.scene.getScene('lava').scene.restart());
  await page.waitForFunction(() => window.game.scene.getScene('lava').state === 'playing' && window.said.length > 0, null,
    { timeout: 30_000 });
  const word = await page.evaluate(() => window.game.scene.getScene('lava').run.word);
  expect((await said(page)).map((e) => e.text)).toEqual([word]);
  // Type the word: once it is crossed it is said again.
  for (const letter of word) {
    await page.waitForFunction(() => window.game.scene.getScene('lava').state === 'playing', null, { timeout: 30_000 });
    await page.keyboard.press(letter);
  }
  await expect.poll(async () => (await said(page)).map((e) => e.text).slice(0, 2), { timeout: 30_000 }).toEqual([word, word]);
});
