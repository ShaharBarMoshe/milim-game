import { test, expect } from '@playwright/test';
import { pairs, useWords } from './words.js';
import { GAME_H, GAME_W, clickBalloon, snapshot } from './play.js';

const WORDS = pairs('dog=כלב', 'cat=חתול', 'house=בית', 'sun=שמש');

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

async function startGame(page, words = WORDS) {
  await useWords(page, words);
  await expect(page.locator('#word-form')).toBeVisible();
  await page.locator('#word-start').click();
  await expect(page.locator('#word-form')).toBeHidden();
  await page.waitForFunction(
    () => {
      const s = window.game?.scene?.getScene('game');
      return s && s.state === 'playing' && s.quiz?.current && Array.isArray(s.balloons) && s.balloons.length > 0;
    },
    null,
    { timeout: 30_000 },
  );
}

test('correct balloon scores, wrong balloon penalises and resets streak', async ({ page }) => {
  await startGame(page);

  const s0 = await snapshot(page);
  expect(s0.score).toBe(0);
  expect(s0.current.options).toHaveLength(4);
  const words = ['dog', 'cat', 'house', 'sun', 'כלב', 'חתול', 'בית', 'שמש'];
  expect(words).toContain(s0.current.prompt);
  // Every balloon carries one of the current options; exactly one balloon per wave is the answer.
  for (const b of s0.balloons) expect(s0.current.options).toContain(b.word);
  expect(s0.balloons.filter((b) => b.isAnswer)).toHaveLength(1);
  expect(s0.balloons.find((b) => b.isAnswer).word).toBe(s0.current.answer);

  // --- correct answer
  const hit = await clickBalloon(page, 'correct');
  expect(hit.word).toBe(hit.before.current.answer);
  await expect
    .poll(async () => (await snapshot(page)).stats.correct, { timeout: 30_000 })
    .toBe(1);
  const s1 = await snapshot(page);
  expect(s1.score).toBeGreaterThan(0);
  expect(s1.stats.wrong).toBe(0);
  expect(s1.stats.streak).toBe(1);
  const scoreAfterHit = s1.score;

  // --- wrong answer on the next question
  await page.waitForFunction(
    (prevPrompt) => {
      const s = window.game.scene.getScene('game');
      const q = s.quiz.current;
      return (
        s.state === 'playing' && q && q.prompt !== prevPrompt && s.balloons.some((b) => b.isAnswer && b.word === q.answer)
      );
    },
    s1.current.prompt,
    { timeout: 30_000 },
  );
  const miss = await clickBalloon(page, 'wrong');
  expect(miss.isAnswer).toBe(false);
  expect(miss.word).not.toBe(miss.before.current.answer);
  await expect
    .poll(async () => (await snapshot(page)).stats.wrong, { timeout: 30_000 })
    .toBe(1);
  const s2 = await snapshot(page);
  expect(s2.stats.streak).toBe(0);
  expect(s2.stats.correct).toBe(1);
  expect(s2.score).toBe(Math.max(0, scoreAfterHit - 5));
});

test('clicking empty sky does not answer', async ({ page }) => {
  await startGame(page);
  const box = await page.evaluate(() => {
    const r = window.game.canvas.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  const s = await snapshot(page);
  // Find a sky point far from every balloon.
  let point = null;
  for (let gx = 100; gx < GAME_W - 100 && !point; gx += 80) {
    const gy = 120;
    if (s.balloons.every((b) => Math.hypot(b.gx - gx, b.gy - gy) > 200)) point = { gx, gy };
  }
  test.skip(!point, 'no free sky found');
  await page.mouse.click(box.x + (point.gx * box.width) / GAME_W, box.y + (point.gy * box.height) / GAME_H);
  // Give the game a few frames to process the click, measured in game time.
  await page.waitForFunction(
    (t0) => window.game.loop.frame > t0 + 10,
    await page.evaluate(() => window.game.loop.frame),
  );
  const after = await snapshot(page);
  expect(after.stats.correct).toBe(0);
  expect(after.stats.wrong).toBe(0);
  expect(after.score).toBe(0);
});
