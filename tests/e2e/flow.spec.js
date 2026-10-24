// The whole journey between the screens: word lists → balloons (won) → lava (every word spelled)
// → back to the word lists.
import { test, expect } from '@playwright/test';
import { pairs, useWords } from './words.js';
import { clickBalloon, clickButton, snapshot } from './play.js';

// Two short words keep the lava part (every word is spelled) quick.
const WORDS = pairs('up=למעלה', 'go=לך');

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

const gameState = (page) => page.evaluate(() => window.game.scene.getScene('game').state);
const lavaScene = (page) =>
  page.evaluate(() => {
    const s = window.game.scene.getScene('lava');
    return { state: s.state, lives: s.lives, position: s.run?.position, wordIndex: s.wordIndex, words: s.words.length };
  });

async function startBalloons(page) {
  await page.locator('#word-start').click();
  await expect(page.locator('#word-form')).toBeHidden();
  await page.waitForFunction(() => {
    const s = window.game.scene.getScene('game');
    return s.state === 'playing' && s.balloons?.some((b) => b.isAnswer);
  }, null, { timeout: 30_000 });
}

// Shoot right balloons until the round is good enough for the lava level (5+ right, 90%+), then end it.
async function winBalloonRound(page) {
  for (;;) {
    const { stats } = await snapshot(page);
    const asked = stats.correct + stats.wrong + stats.missed;
    if (stats.correct >= 5 && stats.correct / asked >= 0.9) break;
    if ((await gameState(page)) !== 'playing') throw new Error('the round ended before it was won');
    await clickBalloon(page, 'correct');
    await page.waitForFunction((n) => window.game.scene.getScene('game').quiz.stats().correct === n, stats.correct + 1, { timeout: 30_000 });
  }
  await page.evaluate(() => window.game.scene.getScene('game').endRound());
}

const waitForLavaPlaying = (page) =>
  page.waitForFunction(() => window.game.scene.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });

// Click a rock in the next column: the right letter or a wrong one.
async function clickRock(page, correct) {
  const target = await page.evaluate((correct) => {
    const s = window.game.scene.getScene('lava');
    const answer = s.run.columns[s.run.position].answer;
    const rock = s.nextRocks().find((r) => (r.letter === answer) === correct);
    const rect = window.game.canvas.getBoundingClientRect();
    const cam = s.cameras.main;
    return {
      x: rect.left + ((rock.x - cam.scrollX) * rect.width) / 1280,
      y: rect.top + ((rock.y + 35 - cam.scrollY) * rect.height) / 720,
    };
  }, correct);
  await page.mouse.click(target.x, target.y);
}

async function spellEveryWord(page) {
  while ((await lavaScene(page)).state !== 'over') {
    await waitForLavaPlaying(page);
    const { position, wordIndex } = await lavaScene(page);
    await clickRock(page, true);
    await page.waitForFunction(
      ({ position, wordIndex }) => {
        const s = window.game.scene.getScene('lava');
        return s.state === 'over' || s.wordIndex !== wordIndex || s.run.position > position;
      },
      { position, wordIndex },
      { timeout: 30_000 },
    );
    await page.waitForFunction(() => !['jumping', 'falling'].includes(window.game.scene.getScene('lava').state), null, { timeout: 30_000 });
  }
}

// Back on the word list screen: pick another list and check a round starts with its words.
async function playAnotherList(page) {
  await expect(page.locator('#word-form')).toBeVisible({ timeout: 30_000 });
  await page.locator('#list-new').click();
  await page.locator('#add-en').fill('red');
  await page.locator('#add-he').fill('אדום');
  await page.locator('#add-pair').click();
  await page.locator('#add-en').fill('blue');
  await page.locator('#add-he').fill('כחול');
  await page.locator('#add-pair').click();
  await startBalloons(page);
  const { current } = await snapshot(page);
  expect(['red', 'blue', 'אדום', 'כחול']).toContain(current.prompt);
}

test('win the balloons → lava level → spell every word → back to the word lists', async ({ page }) => {
  test.setTimeout(300_000);
  await startBalloons(page);
  await winBalloonRound(page);

  await clickButton(page, 'game', 'Lava level');
  await waitForLavaPlaying(page);
  expect((await lavaScene(page)).words).toBe(WORDS.length);

  await spellEveryWord(page);
  const end = await lavaScene(page);
  expect(end.wordIndex).toBe(WORDS.length);
  expect(await page.evaluate(() => window.game.scene.getScene('lava').children.list.some((o) => o.text === 'Lava master!'))).toBe(true);

  await clickButton(page, 'lava', 'Balloons');
  await playAnotherList(page);
});
