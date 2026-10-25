// TC-I18N-009…011: the flag buttons switch the UI between English and Hebrew, and the choice is saved.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pairs, useWords } from './words.js';
import { GAME_W, GAME_H, clickButton } from './play.js';

const load = (lng) => JSON.parse(readFileSync(new URL(`../../src/locales/${lng}.json`, import.meta.url), 'utf8'));
const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') flatten(v, prefix ? `${prefix}.${k}` : k, out);
    else out[prefix ? `${prefix}.${k}` : k] = v;
  }
  return out;
};
const EN = flatten(load('en'));
const HE = flatten(load('he'));
// The Hebrew for an English UI string, found by its English text (so the test doesn't depend on key names).
function hebrewFor(english) {
  const key = Object.keys(EN).find((k) => EN[k] === english);
  expect(key, `no key whose English is "${english}"`).toBeTruthy();
  return HE[key];
}

const LANG_KEY = 'balloon-archer-lang';
const WORDS = pairs('dog=כלב', 'cat=חתול', 'sun=שמש');

let pageErrors;
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));
});
test.afterEach(() => {
  expect(pageErrors.map((e) => String(e.stack || e))).toEqual([]);
});

// Every visible text in a scene, containers included.
const sceneTexts = (page, key) =>
  page.evaluate((key) => {
    const out = [];
    const walk = (list) => list.forEach((o) => {
      if (o.visible === false) return;
      if (typeof o.text === 'string') out.push(o.text);
      if (o.list) walk(o.list);
    });
    walk(window.game.scene.getScene(key).children.list);
    return out;
  }, key);

// Page position of the centre of a scene's flag button.
const langButtonPos = (page, key) =>
  page.evaluate(({ key, W, H }) => {
    const b = window.game.scene.getScene(key).langButton.getBounds();
    const r = window.game.canvas.getBoundingClientRect();
    return { x: r.left + (b.centerX * r.width) / W, y: r.top + (b.centerY * r.height) / H };
  }, { key, W: GAME_W, H: GAME_H });

test('the word-list flag switches the page to Hebrew, right to left', async ({ page }) => {
  await page.goto('/');
  await useWords(page, WORDS);
  const toggle = page.locator('#lang-toggle');
  await expect(toggle).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // The button is t('form.toMap') plus an arrow that points the way the page reads.
  const start = `${hebrewFor('To the map')} ⬅`;

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.locator('#word-start')).toHaveText(start);
  expect(await page.evaluate((k) => localStorage.getItem(k), LANG_KEY)).toBe('he');
  // The words themselves are data and stay as they were.
  await expect(page.locator('#word-table input').first()).toHaveValue('dog');

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('#word-start')).toHaveText('To the map ➜');
});

test('the map flag switches the map to Hebrew, and the choice survives a reload', async ({ page }) => {
  await page.goto('/');
  await useWords(page, WORDS);
  await page.locator('#word-start').click();
  await page.waitForFunction(() => window.game.scene.getScene('map')?.state === 'map' && window.game.scene.getScene('map').langButton, null, { timeout: 30_000 });
  expect(await sceneTexts(page, 'map')).toContain('The Word Realm');
  const title = hebrewFor('The Word Realm');

  const { x, y } = await langButtonPos(page, 'map');
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  // The map redraws in Hebrew and stays on the map (no word-list form).
  await expect.poll(() => sceneTexts(page, 'map'), { timeout: 15_000 }).toContain(title);
  await page.waitForFunction(() => window.game.scene.getScene('map').state === 'map', null, { timeout: 15_000 });
  await expect(page.locator('#word-form')).toBeHidden();
  expect(await page.evaluate((k) => localStorage.getItem(k), LANG_KEY)).toBe('he');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.locator('#word-start').click();
  await page.waitForFunction(() => window.game.scene.getScene('map')?.state === 'map', null, { timeout: 30_000 });
  await expect.poll(() => sceneTexts(page, 'map'), { timeout: 15_000 }).toContain(title);
});

test('in Hebrew, an end-screen button is found and clicked by its Hebrew label', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((k) => localStorage.setItem(k, 'he'), LANG_KEY);
  await useWords(page, WORDS, '/?level=lava');
  await page.waitForFunction(() => window.game?.scene?.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
  await page.evaluate(() => window.game.scene.getScene('lava').endGame('x', 'y'));
  await clickButton(page, 'lava', hebrewFor('Play again'));
  await page.waitForFunction(() => window.game.scene.getScene('lava').state === 'playing', null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.i18n.language())).toBe('he');
});
