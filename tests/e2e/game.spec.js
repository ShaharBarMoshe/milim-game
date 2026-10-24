import { test, expect } from '@playwright/test';
import { pairs, useWords } from './words.js';
import { clickBalloon, snapshot } from './play.js';

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
