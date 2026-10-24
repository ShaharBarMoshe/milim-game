import { test, expect } from '@playwright/test';
import { pairs, useWords } from './words.js';
import { clickButton, clickMapSpot, mapSpot } from './play.js';

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

test('Lava Crossing is locked until a balloon round is won, then it starts the lava level', async ({ page }) => {
  await toMap(page);
  const lava = await mapSpot(page, 'lava');
  await page.mouse.move(lava.x, lava.y);
  await expect.poll(async () => (await map(page)).tooltip).toContain('Locked');
  await page.mouse.click(lava.x, lava.y);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.game.scene.isActive('lava'))).toBe(false);

  // Win a round (9 of 10 right), then come back by the end screen's Map button.
  await clickMapSpot(page, 'balloons');
  await page.waitForFunction(() => window.game.scene.getScene('game')?.state === 'playing', null, { timeout: 30_000 });
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('game');
    for (let i = 0; i < 10; i++) {
      scene.quiz.next();
      scene.quiz.answer(i < 9 ? scene.quiz.current.answer : scene.quiz.current.options.find((o) => o !== scene.quiz.current.answer));
    }
    scene.endRound();
  });
  await clickButton(page, 'game', 'Map');
  await page.waitForFunction(() => window.game.scene.getScene('map')?.state === 'map', null, { timeout: 30_000 });
  expect((await map(page)).lava.locked).toBeNull();
  // The map says so the first time back.
  await expect.poll(() => page.evaluate(() => window.game.scene.getScene('map').announcement?.text)).toContain('Lava Crossing is open');

  // Still open after a reload.
  await page.reload();
  await toMap(page);
  expect((await map(page)).lava.locked).toBeNull();
  await clickMapSpot(page, 'lava');
  await page.waitForFunction(() => window.game.scene.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  const words = await page.evaluate(() => window.game.scene.getScene('lava').words.map((w) => w.en).sort());
  expect(words).toEqual(['cat', 'dog', 'sun']);
});
