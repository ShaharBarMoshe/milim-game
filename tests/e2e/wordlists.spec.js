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

// Word lists as JSON files, sent by WhatsApp or email as the file itself. Happy flows end to end; the
// row-by-row error rules are unit-tested in tests/listFile.test.js, here only how the form reports them.
const status = (page) => page.locator('#word-upload-status');
const fileNameOf = (name) => `${name.trim().replace(/\s+/g, '-')}.json`; // listFileName, for plain names
const jsonFile = (name, value) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value), 'utf8') });

test('WhatsApp and Email send the list as a JSON file through the share menu', async ({ page }) => {
  const name = await page.locator('#list-name').inputValue();
  const words = await rows(page);
  // A device that can share files (a phone): record what the share menu gets.
  await page.evaluate(() => {
    navigator.canShare = (data) => Boolean(data?.files?.length);
    navigator.share = async ({ files, title, text }) => {
      window.__shared = { title, text, files: await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, text: await f.text() }))) };
    };
  });
  await page.locator('#word-share').click();
  await expect(page.locator('#word-share-panel')).toBeVisible();
  for (const [button, app] of [['#share-whatsapp', 'WhatsApp'], ['#share-email', 'Mail']]) {
    await page.evaluate(() => { window.__shared = null; });
    await page.locator(button).click();
    const shared = await (await page.waitForFunction(() => window.__shared)).jsonValue();
    expect(shared.files).toHaveLength(1);
    expect(shared.files[0]).toMatchObject({ name: fileNameOf(name), type: 'application/json' });
    const file = JSON.parse(shared.files[0].text);
    expect(file).toMatchObject({ app: 'milim', version: 1, name });
    expect(file.words.map((w) => [w.en, w.he])).toEqual(words);
    expect(shared.text).toContain(fileNameOf(name));
    expect(shared.text).not.toMatch(/https?:|#list=/);
    await expect(status(page)).toContainText(`Choose ${app} in the share menu`);
  }

  // Chrome on Android shares only some kinds of file, not .json: the same list goes as .txt.
  await page.evaluate(() => {
    navigator.canShare = (data) => Boolean(data?.files?.length) && data.files.every((f) => f.type === 'text/plain' && f.name.endsWith('.txt'));
    window.__shared = null;
  });
  await page.locator('#share-whatsapp').click();
  const shared = await (await page.waitForFunction(() => window.__shared)).jsonValue();
  expect(shared.files[0]).toMatchObject({ name: fileNameOf(name).replace(/\.json$/, '.txt'), type: 'text/plain' });
  expect(JSON.parse(shared.files[0].text).words.map((w) => [w.en, w.he])).toEqual(words);
  await expect(status(page)).toContainText(`to send ${fileNameOf(name).replace(/\.json$/, '.txt')}`);

  await page.locator('#share-close').click();
  await expect(page.locator('#word-share-panel')).toBeHidden();
});

test('where the browser cannot share files, the file is downloaded and WhatsApp or the mail app opens', async ({ page }) => {
  const name = await page.locator('#list-name').inputValue();
  const words = await rows(page);
  await page.evaluate(() => {
    navigator.canShare = () => false;
    window.open = (url) => { window.__opened = url; return null; };
  });
  await page.locator('#word-share').click();
  const readDownload = async (download) => JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));

  let [download] = await Promise.all([page.waitForEvent('download'), page.locator('#share-whatsapp').click()]);
  expect(download.suggestedFilename()).toBe(fileNameOf(name));
  expect((await readDownload(download)).words.map((w) => [w.en, w.he])).toEqual(words);
  let opened = await page.evaluate(() => window.__opened);
  expect(opened.startsWith('https://wa.me/?text=')).toBe(true);
  expect(decodeURIComponent(opened)).toContain(fileNameOf(name));
  expect(decodeURIComponent(opened)).not.toContain('#list=');
  await expect(status(page)).toContainText(`${fileNameOf(name)} was downloaded: attach it in the WhatsApp chat`);

  [download] = await Promise.all([page.waitForEvent('download'), page.locator('#share-email').click()]);
  expect(download.suggestedFilename()).toBe(fileNameOf(name));
  opened = await page.evaluate(() => window.__opened);
  expect(opened.startsWith('mailto:?subject=')).toBe(true);
  await expect(status(page)).toContainText('attach it to the email');

  [download] = await Promise.all([page.waitForEvent('download'), page.locator('#share-download').click()]);
  expect(await readDownload(download)).toMatchObject({ app: 'milim', version: 1, name });
  await expect(status(page)).toContainText(`Downloaded ${fileNameOf(name)}`);
});

test('a JSON file uploads into a new list, skipping only its bad rows', async ({ page }) => {
  // 3 good rows and 1 bad one: the good ones are added, the bad row is reported.
  await page.setInputFiles('#word-file', jsonFile('zoo.json', {
    app: 'milim', version: 1, name: 'zoo', kind: 'en-he',
    words: [{ en: 'dog', he: 'כלב' }, { en: 'cat', he: 'חתול' }, { en: 'sun', he: 'moon' }, ['lion', 'אריה']],
  }));
  await expect(status(page)).toContainText('Added 3 words from zoo.json');
  await expect(status(page)).toContainText('row 3');
  await expect(page.locator('#list-name')).toHaveValue('zoo');
  expect(await page.locator('#list-select option:checked').textContent()).toMatch(/^zoo/);
  expect(await rows(page)).toEqual([['dog', 'כלב'], ['cat', 'חתול'], ['lion', 'אריה']]);

  // Every row bad: nothing is added.
  const before = await listNames(page);
  await page.setInputFiles('#word-file', jsonFile('bad.json', { name: 'bad', words: [['sun', 'moon'], [42, 'x']] }));
  await expect(status(page)).toContainText('No valid words in this file');
  expect(await listNames(page)).toEqual(before);

  // A .txt file holding the JSON (how an Android phone sends it) is read like a .json one.
  await page.setInputFiles('#word-file', { name: 'farm.txt', mimeType: 'text/plain', buffer: Buffer.from(JSON.stringify({ name: 'farm', words: [['cow', 'פרה'], ['horse', 'סוס']] })) });
  await expect(status(page)).toContainText('Added 2 words from farm.txt');
  await expect(page.locator('#list-name')).toHaveValue('farm');

  // A .txt file of plain text isn't a word list; other file types aren't read at all.
  const withFarm = await listNames(page);
  await page.setInputFiles('#word-file', { name: 'words.txt', mimeType: 'text/plain', buffer: Buffer.from('dog,כלב\ncat,חתול') });
  await expect(status(page)).toContainText('This is not a word list file');
  await page.setInputFiles('#word-file', { name: 'words.csv', mimeType: 'text/csv', buffer: Buffer.from('dog,כלב\ncat,חתול') });
  await expect(status(page)).toContainText('Choose a .json or .txt word list file');
  expect(await listNames(page)).toEqual(withFarm);
});
