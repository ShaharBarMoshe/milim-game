import { test, expect } from '@playwright/test';
import { pairs, useWords } from './words.js';
import { clickMapSpot, GAME_W, GAME_H } from './play.js';

let pageErrors;

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('balloon-archer-shop', JSON.stringify({ points: 125 })));
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

test('the map shop sells the lava rope for 100 points, and it saves the robot once', async ({ page }) => {
  // No rope by default: a wrong letter drops the robot into the lava.
  await clickMapSpot(page, 'shop');
  await page.waitForFunction(() => window.game.scene.isActive('shop') && window.game.scene.getScene('shop').cards);
  expect(await shop(page)).toMatchObject({ points: 125, rope: 'Have 0', dialog: null });

  // Choose the rope: a dialog asks to confirm; Cancel spends nothing.
  const card = await page.evaluate(() => { const c = window.game.scene.getScene('shop').cards['lava-rope']; return { x: c.x, y: c.y }; });
  await clickAt(page, card.x, card.y);
  await expect.poll(async () => (await shop(page)).dialog).toBe('lava-rope');
  let b = await dialogButton(page, 'Cancel');
  await clickAt(page, b.x, b.y);
  await expect.poll(async () => (await shop(page)).dialog).toBeNull();
  expect((await shop(page)).points).toBe(125);

  // Buy one: the points go down and the card counts it.
  await clickAt(page, card.x, card.y);
  await expect.poll(async () => (await shop(page)).dialog).toBe('lava-rope');
  b = await dialogButton(page, 'Buy');
  await clickAt(page, b.x, b.y);
  await expect.poll(async () => shop(page)).toMatchObject({ points: 25, rope: 'Have 1', dialog: null });
  await expect.poll(() => page.evaluate(() => window.game.scene.getScene('shop').pointsText.text)).toBe('🪙 25 points');

  // Back on the map the total is the same, and a wrong jump in the lava level now hangs on the rope.
  const back = await page.evaluate(() => { const t = window.game.scene.getScene('shop').backButton; return { x: t.x + t.width / 2, y: t.y + t.height / 2 }; });
  await clickAt(page, back.x, back.y);
  await page.waitForFunction(() => window.game.scene.getScene('map')?.state === 'map');
  expect(await page.evaluate(() => window.game.scene.getScene('map').pointsText.text)).toBe('🪙 25 points');
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

test('a girl or boy player from the shop replaces the archer and the robot', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem('balloon-archer-shop', JSON.stringify({ points: 0, owned: ['player-girl', 'player-boy'], worn: { player: 'player-girl' } })));
  await page.reload();
  await page.locator('#word-start').click();
  await clickMapSpot(page, 'balloons');
  await page.waitForFunction(() => window.game.scene.getScene('game')?.state === 'playing', null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.game.scene.getScene('game').archer.texture.key)).toBe('kid_girl_archer');
  expect(await page.evaluate(() => window.game.scene.getScene('game').perkBar?.perkIds)).toContain('player-girl');

  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('balloon-archer-shop'));
    data.worn = { player: 'player-boy' };
    localStorage.setItem('balloon-archer-shop', JSON.stringify(data));
  });
  await page.keyboard.press('Escape');
  await clickMapSpot(page, 'lava');
  await page.waitForFunction(() => window.game.scene.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.game.scene.getScene('lava').robot.texture.key)).toBe('kid_boy_jumper');
});

test('a Gemini character throws its own projectile in the balloon game', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem('balloon-archer-shop', JSON.stringify({ points: 0, owned: ['player-axe-girl'], worn: { player: 'player-axe-girl' } })));
  await page.reload();
  await page.locator('#word-start').click();
  await clickMapSpot(page, 'balloons');
  await page.waitForFunction(() => window.game.scene.getScene('game')?.state === 'playing' && window.game.scene.getScene('game').balloons.some((b) => b.isAnswer), null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.game.scene.getScene('game').archer.texture.key)).toBe('char_axe-girl_archer');
  const thrown = await page.evaluate(() => {
    const g = window.game.scene.getScene('game');
    window.target = g.balloons.find((b) => b.isAnswer);
    g.fireArrow(window.target, true);
    window.axe = g.arrows.at(-1);
    return window.axe.texture.key;
  });
  expect(thrown).toBe('proj_axe');
  // The hit pops the balloon without the arrow-drawn pop animation, and the axe flies on.
  await page.waitForFunction(() => !window.target.active, null, { timeout: 30_000 });
  const after = await page.evaluate(() => {
    const g = window.game.scene.getScene('game');
    return { pops: g.children.list.filter((o) => o.texture?.key?.startsWith('pop_')).length, axe: window.axe.active && window.axe.visible };
  });
  expect(after).toEqual({ pops: 0, axe: true });
});
