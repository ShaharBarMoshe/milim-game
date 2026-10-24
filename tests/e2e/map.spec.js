import { test, expect } from '@playwright/test';
import { pairs, useWords } from './words.js';
import { clickMapSpot, mapSpot } from './play.js';

const WORDS = pairs('dog=כלב', 'cat=חתול', 'sun=שמש');

let pageErrors;

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));
  await page.goto('/');
  await useWords(page, WORDS);
  await expect(page.locator('#word-form')).toBeVisible();
});

test.afterEach(() => {
  expect(pageErrors.map((e) => String(e.stack || e))).toEqual([]);
});

const map = (page) =>
  page.evaluate(() => {
    const s = window.game.scene.getScene('map');
    const spot = (k) => ({ glow: s.spots[k].glow.visible, scale: s.spots[k].container.scale, locked: s.spots[k].locked });
    return {
      state: s.state,
      active: window.game.scene.isActive('map'),
      list: s.listText.text,
      hovered: s.hovered,
      tooltip: s.tooltip.visible ? `${s.tipTitle.text}\n${s.tipText.text}` : null,
      balloons: spot('balloons'),
      lava: spot('lava'),
    };
  });

const toMap = async (page) => {
  await page.locator('#word-start').click();
  await expect(page.locator('#word-form')).toBeHidden();
  await page.waitForFunction(() => window.game.scene.getScene('map')?.state === 'map');
};

test('the map opens once a word list is chosen, and names the list', async ({ page }) => {
  expect(await map(page)).toMatchObject({ state: 'setup' });
  await toMap(page);
  expect((await map(page)).list).toContain('Test words');
});

test('clicking Balloon Meadow starts the balloon game with the chosen words', async ({ page }) => {
  await toMap(page);
  await clickMapSpot(page, 'balloons');
  await page.waitForFunction(() => window.game.scene.getScene('game')?.state === 'playing', null, { timeout: 30_000 });
  const prompt = await page.evaluate(() => window.game.scene.getScene('game').quiz.current.prompt);
  expect(['dog', 'cat', 'sun', 'כלב', 'חתול', 'שמש']).toContain(prompt);
});

test('Lava Crossing is open from the start and starts the lava level with the chosen words', async ({ page }) => {
  await toMap(page);
  expect((await map(page)).lava.locked).toBeNull();
  const lava = await mapSpot(page, 'lava');
  await page.mouse.move(lava.x, lava.y);
  await expect.poll(async () => (await map(page)).tooltip).toContain('Click to play');
  // The right side of the marker counts too (its hit area used to cover only the left half).
  await page.mouse.click(lava.x + 45, lava.y);
  await page.waitForFunction(() => window.game.scene.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  const words = await page.evaluate(() => window.game.scene.getScene('lava').words.map((w) => w.en).sort());
  expect(words).toEqual(['cat', 'dog', 'sun']);
});

test('a Hebrew–Hebrew list opens Lava Crossing too, and its words are spelled in Hebrew', async ({ page }) => {
  await useWords(page, pairs('חם=קר', 'גדול=קטן'), '/', 'he-he');
  await toMap(page);
  expect((await map(page)).lava.locked).toBeNull();
  await clickMapSpot(page, 'lava');
  await page.waitForFunction(() => window.game.scene.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  const run = await page.evaluate(() => {
    const s = window.game.scene.getScene('lava');
    return { word: s.run.word, prompt: s.promptText.text, letters: s.nextRocks().map((r) => r.letter) };
  });
  expect(['קר', 'קטן']).toContain(run.word);
  expect(run.prompt).toBe(run.word === 'קר' ? 'חם' : 'גדול');
  run.letters.forEach((l) => expect(l).toMatch(/^[א-ת]$/));
  // Type the first letter on an English keyboard: the Hebrew key under it counts (E is ק).
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.game.scene.getScene('lava').run.position === 1, null, { timeout: 30_000 });
});

test('Esc in a game goes back to the map, and Esc on the map opens the word lists', async ({ page }) => {
  await toMap(page);
  await clickMapSpot(page, 'balloons');
  await page.waitForFunction(() => window.game.scene.getScene('game')?.state === 'playing', null, { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.scene.isActive('map') && window.game.scene.getScene('map').state === 'map', null, { timeout: 30_000 });

  await clickMapSpot(page, 'lava');
  await page.waitForFunction(() => window.game.scene.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.scene.isActive('map') && window.game.scene.getScene('map').state === 'map', null, { timeout: 30_000 });

  await page.keyboard.press('Escape');
  await expect(page.locator('#word-form')).toBeVisible();
});
