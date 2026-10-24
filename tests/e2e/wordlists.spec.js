import { test, expect } from '@playwright/test';
import { pairs, useWords } from './words.js';
import { playBalloons } from './play.js';

let pageErrors;

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));
  await page.goto('/');
  await expect(page.locator('#word-form')).toBeVisible();
});

test.afterEach(() => {
  expect(pageErrors.map((e) => String(e.stack || e))).toEqual([]);
});

const rows = (page) =>
  page.locator('#word-table tbody tr').evaluateAll((trs) =>
    trs.map((tr) => [tr.querySelector('.pair-en').value, tr.querySelector('.pair-he').value]),
  );

const listNames = (page) => page.locator('#list-select option').allTextContents();

async function addPair(page, en, he) {
  await page.locator('#add-en').fill(en);
  await page.locator('#add-en').press('Enter'); // moves on to the Hebrew field
  await expect(page.locator('#add-he')).toBeFocused();
  await page.locator('#add-he').fill(he);
  await page.locator('#add-he').press('Enter');
}

test('first visit offers ready-made lists that can be played at once', async ({ page }) => {
  const names = await listNames(page);
  expect(names.length).toBeGreaterThanOrEqual(3);
  expect(names.join()).toContain('Animals');
  await expect(page.locator('#word-start')).toBeEnabled();

  await page.locator('#list-select').selectOption({ label: names.find((n) => n.startsWith('Animals')) });
  await expect(page.locator('#list-name')).toHaveValue('Animals');
  expect(await rows(page)).toContainEqual(['dog', 'כלב']);
});

test('a new list is built word by word, saved, and played', async ({ page }) => {
  await page.locator('#list-new').click();
  await expect(page.locator('#list-name')).toBeFocused();
  await page.locator('#list-name').fill('Trip');
  await page.locator('#list-name').press('Enter');
  await expect(page.locator('#word-start')).toBeDisabled();

  await addPair(page, 'sea', 'ים');
  await expect(page.locator('#add-en')).toBeFocused();
  await expect(page.locator('#word-start')).toBeDisabled();
  await page.locator('#add-en').fill('beach');
  await page.locator('#add-he').fill('חוף');
  await page.locator('#add-pair').click();
  expect(await rows(page)).toEqual([['sea', 'ים'], ['beach', 'חוף']]);
  await expect(page.locator('#word-start')).toBeEnabled();

  await page.reload();
  await expect(page.locator('#list-name')).toHaveValue('Trip');
  expect(await rows(page)).toEqual([['sea', 'ים'], ['beach', 'חוף']]);

  await playBalloons(page);
  const prompt = await page.evaluate(() => window.game.scene.getScene('game').quiz.current.prompt);
  expect(['sea', 'ים', 'beach', 'חוף']).toContain(prompt);
});

test('words can be edited and removed in the table', async ({ page }) => {
  await useWords(page, pairs('dog=כלב', 'cat=חתול', 'sun=שמש'));
  const firstEn = page.locator('#word-table .pair-en').first();
  await firstEn.fill('puppy');
  await firstEn.press('Tab');
  await expect(page.locator('#word-table .pair-he').first()).toBeFocused();
  expect((await rows(page))[0]).toEqual(['puppy', 'כלב']);

  // An edit that clashes with another word is undone.
  await firstEn.fill('cat');
  await firstEn.press('Enter');
  await expect(page.locator('#word-error')).toContainText('undone');
  await expect(firstEn).toHaveValue('puppy');

  await page.getByRole('button', { name: 'Remove cat' }).click();
  expect(await rows(page)).toEqual([['puppy', 'כלב'], ['sun', 'שמש']]);

  await page.reload();
  await expect.poll(() => rows(page)).toEqual([['puppy', 'כלב'], ['sun', 'שמש']]);
});

test('a locked list cannot be changed until it is unlocked, and stays locked after reload', async ({ page }) => {
  await useWords(page, pairs('dog=כלב', 'cat=חתול'));
  const lock = page.locator('#list-lock');
  await lock.click();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');

  const checkLocked = async () => {
    await expect(page.locator('#word-add')).toBeHidden();
    await expect(page.locator('.pair-remove')).toHaveCount(0);
    await expect(page.locator('#list-name')).toHaveAttribute('readonly', '');
    await expect(page.locator('#word-table .pair-en').first()).toHaveAttribute('readonly', '');
    await expect(page.locator('#list-delete')).toBeDisabled();
    await expect(page.locator('#word-start')).toBeEnabled(); // still playable
  };
  await checkLocked();
  await page.locator('#word-table .pair-en').first().pressSequentially('xyz');
  expect(await rows(page)).toEqual([['dog', 'כלב'], ['cat', 'חתול']]);

  await page.reload();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await checkLocked();
  expect((await listNames(page))[0]).toContain('🔒');

  await lock.click();
  await expect(page.locator('#word-add')).toBeVisible();
  await addPair(page, 'sun', 'שמש');
  expect(await rows(page)).toHaveLength(3);
});

test('a Hebrew–Hebrew list takes Hebrew on both sides and plays in Hebrew', async ({ page }) => {
  await page.locator('#list-new').click();
  await page.locator('#list-name').fill('הפכים שלי');
  await page.locator('#list-name').press('Enter');
  await page.locator('#list-kind').selectOption('he-he');
  await expect(page.locator('#head-first')).toHaveText('מילה');
  await expect(page.locator('#add-en')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#word-direction option').nth(1)).not.toContainText('English');

  await page.locator('#add-en').fill('hot');
  await page.locator('#add-he').fill('קר');
  await page.locator('#add-pair').click();
  await expect(page.locator('#word-error')).toContainText('Hebrew letters');
  await page.locator('#add-he').fill('');

  await addPair(page, 'חם', 'קר');
  await addPair(page, 'גדול', 'קטן');
  await addPair(page, 'יום', 'לילה');
  expect(await rows(page)).toEqual([['חם', 'קר'], ['גדול', 'קטן'], ['יום', 'לילה']]);
  await expect(page.locator('#list-kind')).toBeDisabled(); // has words now

  await page.reload();
  await expect(page.locator('#list-kind')).toHaveValue('he-he');

  await playBalloons(page);
  const q = await page.evaluate(() => window.game.scene.getScene('game').quiz.current);
  for (const word of [q.prompt, ...q.options]) expect(word).toMatch(/^[֐-׿ ]+$/);
});

test('uploading a file of words makes a new list, reports bad lines, and plays', async ({ page }) => {
  const csv = '\uFEFFEnglish,Hebrew\r\ndog,כלב\r\ncat,חתול\r\nsun,שמש\r\nnot a pair\r\n';
  await page.setInputFiles('#word-file', { name: 'animals.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });

  await expect(page.locator('#word-upload-status')).toContainText('Added 3 words from animals.csv');
  await expect(page.locator('#word-upload-status')).toContainText('not a pair');
  await expect(page.locator('#list-name')).toHaveValue('animals');
  expect(await page.locator('#list-select option:checked').textContent()).toMatch(/^animals/);
  expect(await rows(page)).toEqual([['dog', 'כלב'], ['cat', 'חתול'], ['sun', 'שמש']]);

  // Saved, and playable straight away.
  await playBalloons(page);
  const words = await page.evaluate(() => window.game.scene.getScene('game').pairs.map((p) => p.en));
  expect(words.sort()).toEqual(['cat', 'dog', 'sun']);
});
