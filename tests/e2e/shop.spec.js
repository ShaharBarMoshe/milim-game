import { test, expect } from '@playwright/test';
import { pairs, useWords } from './words.js';
import { clickMapSpot, GAME_W, GAME_H } from './play.js';

let pageErrors;

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('balloon-archer-shop', JSON.stringify({ points: 25 })));
  await useWords(page, pairs('dog=כלב', 'cat=חתול', 'sun=שמש'));
  await page.locator('#word-start').click();
  await page.waitForFunction(() => window.game.scene.getScene('map')?.state === 'map');
});

test.afterEach(() => {
  expect(pageErrors.map((e) => String(e.stack || e))).toEqual([]);
});

// Click a game object of the shop scene, given its position in game coordinates.
async function clickAt(page, x, y) {
  const r = await page.evaluate(() => window.game.canvas.getBoundingClientRect().toJSON());
  await page.mouse.click(r.left + (x * r.width) / GAME_W, r.top + (y * r.height) / GAME_H);
}
const shop = (page) =>
  page.evaluate(() => {
    const s = window.game.scene.getScene('shop');
    return { points: s.shop.points, rope: s.cards['lava-rope'].stock.text, dialog: s.dialog?.item.id ?? null };
  });
const dialogButton = (page, label) =>
  page.evaluate((label) => {
    const b = window.game.scene.getScene('shop').dialog.buttons.find((o) => o.text === label);
    return { x: b.x, y: b.y };
  }, label);

test('the map shop sells the lava rope for 10 points, and it saves the robot once', async ({ page }) => {
  // No rope by default: a wrong letter drops the robot into the lava.
  await clickMapSpot(page, 'shop');
  await page.waitForFunction(() => window.game.scene.isActive('shop') && window.game.scene.getScene('shop').cards);
  expect(await shop(page)).toMatchObject({ points: 25, rope: 'You have 0', dialog: null });

  // Choose the rope: a dialog asks to confirm; Cancel spends nothing.
  const card = await page.evaluate(() => { const c = window.game.scene.getScene('shop').cards['lava-rope']; return { x: c.x, y: c.y }; });
  await clickAt(page, card.x, card.y);
  await expect.poll(async () => (await shop(page)).dialog).toBe('lava-rope');
  let b = await dialogButton(page, 'Cancel');
  await clickAt(page, b.x, b.y);
  await expect.poll(async () => (await shop(page)).dialog).toBeNull();
  expect((await shop(page)).points).toBe(25);

  // Buy one: the points go down and the card counts it.
  await clickAt(page, card.x, card.y);
  await expect.poll(async () => (await shop(page)).dialog).toBe('lava-rope');
  b = await dialogButton(page, 'Buy');
  await clickAt(page, b.x, b.y);
  await expect.poll(async () => shop(page)).toMatchObject({ points: 15, rope: 'You have 1', dialog: null });
  await expect.poll(() => page.evaluate(() => window.game.scene.getScene('shop').pointsText.text)).toBe('🪙 15 points');

  // Back on the map the total is the same, and a wrong jump in the lava level now hangs on the rope.
  const back = await page.evaluate(() => { const t = window.game.scene.getScene('shop').backButton; return { x: t.x + t.width / 2, y: t.y + t.height / 2 }; });
  await clickAt(page, back.x, back.y);
  await page.waitForFunction(() => window.game.scene.getScene('map')?.state === 'map');
  expect(await page.evaluate(() => window.game.scene.getScene('map').pointsText.text)).toBe('🪙 15 points');
  await clickMapSpot(page, 'lava');
  await page.waitForFunction(() => window.game.scene.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  const wrong = await page.evaluate(() => {
    const s = window.game.scene.getScene('lava');
    return s.nextRocks().find((r) => r.letter !== s.run.columns[0].answer).letter;
  });
  // The HUD shows a badge for the rope; it isn't used up yet.
  expect(await page.evaluate(() => window.game.scene.getScene('lava').perkBar?.perkIds)).toEqual(['lava-rope']);
  const lives = await page.evaluate(() => window.game.scene.getScene('lava').lives);
  const wrongLetter = () =>
    page.evaluate(() => {
      const s = window.game.scene.getScene('lava');
      return s.nextRocks().find((r) => r.letter !== s.run.columns[s.run.position].answer).letter;
    });

  // First wrong letter: the rope catches the robot, no life is lost, and the rope is used up.
  await page.keyboard.press(wrong);
  await page.waitForFunction(() => window.game.scene.getScene('lava').state === 'falling');
  expect(await page.evaluate(() => Boolean(window.game.scene.getScene('lava').ropeFrom))).toBe(true);
  await page.waitForFunction(() => window.game.scene.getScene('lava').state === 'playing', null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.game.scene.getScene('lava').lives)).toBe(lives);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('balloon-archer-shop')).stock)).toEqual({});
  expect(await page.evaluate(() => window.game.scene.getScene('lava').perkBar)).toBeNull();

  // Second wrong letter: no rope left, so the robot falls in and loses a life.
  await page.keyboard.press(await wrongLetter());
  await page.waitForFunction(() => window.game.scene.getScene('lava').state === 'falling');
  expect(await page.evaluate(() => window.game.scene.getScene('lava').ropeFrom)).toBeNull();
  await page.waitForFunction((n) => window.game.scene.getScene('lava').lives === n, lives - 1, { timeout: 30_000 });
});

test('without the rope a wrong letter drops the robot in the lava, and it comes back on the last safe rock', async ({ page }) => {
  await clickMapSpot(page, 'lava');
  await page.waitForFunction(() => window.game.scene.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  const start = await page.evaluate(() => {
    const s = window.game.scene.getScene('lava');
    return { x: s.current.x, lives: s.lives, wrong: s.nextRocks().find((r) => r.letter !== s.run.columns[0].answer).letter };
  });
  await page.keyboard.press(start.wrong);
  await page.waitForFunction(() => window.game.scene.getScene('lava').state === 'falling');
  expect(await page.evaluate(() => window.game.scene.getScene('lava').ropeFrom)).toBeNull();
  expect(await page.evaluate(() => window.game.scene.getScene('lava').perkBar)).toBeNull(); // nothing from the shop
  await page.waitForFunction(() => window.game.scene.getScene('lava').state === 'playing', null, { timeout: 30_000 });
  const after = await page.evaluate(() => { const s = window.game.scene.getScene('lava'); return { x: s.robot.x, lives: s.lives }; });
  expect(after).toEqual({ x: start.x, lives: start.lives - 1 });
});
