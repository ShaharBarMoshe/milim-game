import { test, expect } from '@playwright/test';
import { pairs, useWords } from './words.js';
import { playBalloons } from './play.js';

const WORDS = pairs('dog=כלב', 'cat=חתול', 'sun=שמש');

let pageErrors;

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));
  // Save the word list the way the form does, then open the lava level directly.
  await page.goto('/');
  await useWords(page, WORDS, '/?level=lava');
  await page.waitForFunction(() => window.game?.scene?.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
});

test.afterEach(() => {
  expect(pageErrors.map((e) => String(e.stack || e))).toEqual([]);
});

const lava = (page) =>
  page.evaluate(() => {
    const s = window.game.scene.getScene('lava');
    return {
      state: s.state,
      word: s.run?.word,
      position: s.run?.position,
      lives: s.lives,
      score: s.score,
      wordIndex: s.wordIndex,
      words: s.words.map((w) => w.en),
    };
  });

const waitForPlaying = (page) =>
  page.waitForFunction(() => window.game.scene.getScene('lava').state === 'playing', null, { timeout: 30_000 });

// Click the centre of a rock in the next column, the right one or a wrong one.
async function clickRock(page, correct) {
  const target = await page.evaluate((correct) => {
    const s = window.game.scene.getScene('lava');
    const answer = s.run.columns[s.run.position].answer;
    const rock = s.nextRocks().find((r) => (r.letter === answer) === correct);
    const rect = window.game.canvas.getBoundingClientRect();
    const cam = s.cameras.main;
    return {
      letter: rock.letter,
      x: rect.left + ((rock.x - cam.scrollX) * rect.width) / 1280,
      y: rect.top + ((rock.y + 35 - cam.scrollY) * rect.height) / 720,
    };
  }, correct);
  await page.mouse.click(target.x, target.y);
  return target.letter;
}

// Spell the current word by clicking the right rock in each column; resolves once the robot is on the flag.
async function spellWithClicks(page) {
  const { word, wordIndex } = await lava(page);
  for (let i = (await lava(page)).position; i < word.length; i++) {
    await waitForPlaying(page);
    await clickRock(page, true);
    await page.waitForFunction((n) => window.game.scene.getScene('lava').run.position === n, i + 1, { timeout: 30_000 });
  }
  await page.waitForFunction(
    (i) => {
      const s = window.game.scene.getScene('lava');
      return s.wordIndex === i + 1 || s.state === 'over';
    },
    wordIndex,
    { timeout: 30_000 },
  );
  return word;
}

test('happy flow: clicking the right rocks spells the word with no mistakes', async ({ page }) => {
  const word = await spellWithClicks(page);
  await waitForPlaying(page);
  const s = await lava(page);
  expect(s.wordIndex).toBe(1);
  expect(s.lives).toBe(3);
  expect(s.score).toBe(10 * word.length + 20);
});

test('the mouse pointer is visible over the game', async ({ page }) => {
  const cursor = await page.evaluate(() => getComputedStyle(window.game.canvas).cursor);
  expect(cursor).not.toBe('none');
  expect(cursor).toContain('url(');
});

test('the right rock advances, a wrong rock drowns the robot and costs a life', async ({ page }) => {
  await clickRock(page, true);
  await waitForPlaying(page);
  expect((await lava(page)).position).toBe(1);

  await clickRock(page, false);
  await page.waitForFunction(() => window.game.scene.getScene('lava').lives === 2, null, { timeout: 30_000 });
  await waitForPlaying(page);
  const s = await lava(page);
  expect(s.position).toBe(1); // back on the last safe rock
});

test('typing the letters spells the word', async ({ page }) => {
  const { word } = await lava(page);
  for (let i = 0; i < word.length; i++) {
    await waitForPlaying(page);
    await page.keyboard.press(word[i]);
    await page.waitForFunction((n) => window.game.scene.getScene('lava').run.position === n, i + 1, { timeout: 30_000 });
  }
  // Scored once the robot lands on the flag; the next word follows a moment later.
  await page.waitForFunction(() => window.game.scene.getScene('lava').spelled === 1, null, { timeout: 30_000 });
  const s = await lava(page);
  expect(s.score).toBe(10 * word.length + 20); // no mistakes bonus
  expect(s.lives).toBe(3);
});

test('90% success in the balloon game unlocks the lava level', async ({ page }) => {
  await page.goto('/');
  await playBalloons(page);
  // 9 right and 1 wrong answer = 90%, then end the round.
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('game');
    const quiz = scene.quiz;
    for (let i = 0; i < 9; i++) {
      quiz.next();
      quiz.answer(quiz.current.answer);
    }
    quiz.next();
    quiz.answer(quiz.current.options.find((o) => o !== quiz.current.answer));
    scene.endRound();
  });
  const button = await page.waitForFunction(() => {
    const scene = window.game.scene.getScene('game');
    const btn = scene.overlay?.list.find((o) => o.text === 'Lava level');
    if (!btn) return null;
    const rect = window.game.canvas.getBoundingClientRect();
    return { x: rect.left + (btn.x * rect.width) / 1280, y: rect.top + (btn.y * rect.height) / 720 };
  }, null, { timeout: 30_000 });
  const { x, y } = await button.jsonValue();
  await page.mouse.click(x, y);
  await page.waitForFunction(() => window.game.scene.getScene('lava')?.state === 'playing', null, { timeout: 30_000 });
});

test('escaped balloons keep the lava level locked even at 100% accuracy, and the end screen says why', async ({ page }) => {
  await page.goto('/');
  await playBalloons(page);
  // 8 right, 0 wrong, 2 escaped = 80% success.
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('game');
    const quiz = scene.quiz;
    for (let i = 0; i < 10; i++) {
      quiz.next();
      if (i < 8) quiz.answer(quiz.current.answer);
      else quiz.skip();
    }
    scene.endRound();
  });
  await page.waitForFunction(() => window.game.scene.getScene('game').overlay?.list.some((o) => o.text === 'Play again'));
  const texts = await page.evaluate(() => window.game.scene.getScene('game').overlay.list.map((o) => o.text).filter(Boolean));
  expect(texts).not.toContain('Lava level');
  expect(texts.some((t) => t.includes('Success: 80%'))).toBe(true);
  expect(texts).toContain('80% success (2 escaped balloons count as misses), need 90% for the lava level');
});

test('Play again in the balloon game end screen starts a new round', async ({ page }) => {
  await page.goto('/');
  await playBalloons(page);
  await page.evaluate(() => window.game.scene.getScene('game').endRound());
  const pos = await (await page.waitForFunction(() => {
    const btn = window.game.scene.getScene('game').overlay?.list.find((o) => o.text === 'Play again');
    if (!btn) return null;
    const rect = window.game.canvas.getBoundingClientRect();
    return { x: rect.left + (btn.x * rect.width) / 1280, y: rect.top + (btn.y * rect.height) / 720 };
  }, null, { timeout: 30_000 })).jsonValue();
  await page.mouse.click(pos.x, pos.y);
  await page.waitForFunction(() => window.game.scene.getScene('game').state === 'playing', null, { timeout: 30_000 });
});

