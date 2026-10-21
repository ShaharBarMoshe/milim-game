import { test, expect } from '@playwright/test';

const WORDS = ['dog - כלב', 'cat - חתול', 'sun - שמש'].join('\n');

let pageErrors;

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));
  // Save the word list the way the form does, then open the lava level directly.
  await page.goto('/');
  await expect(page.locator('#word-form')).toBeVisible();
  await page.locator('#word-input').fill(WORDS);
  await page.goto('/?level=lava');
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

test('two failures in a row: the robot comes back each time and can still finish the word', async ({ page }) => {
  // Both wrong rocks of the first column, one after the other.
  for (const livesLeft of [2, 1]) {
    await waitForPlaying(page);
    await clickRock(page, false);
    await page.waitForFunction((n) => window.game.scene.getScene('lava').lives === n, livesLeft, { timeout: 30_000 });
  }
  await waitForPlaying(page);
  let s = await lava(page);
  expect(s.position).toBe(0);
  expect(s.lives).toBe(1);
  expect(await page.evaluate(() => window.game.scene.getScene('lava').robot.visible)).toBe(true);

  // Not frozen: the rest of the word can still be spelled.
  const word = await spellWithClicks(page);
  await waitForPlaying(page);
  s = await lava(page);
  expect(s.wordIndex).toBe(1);
  expect(s.lives).toBe(1);
  expect(s.score).toBe(10 * word.length); // no bonus after mistakes
});

test('two words spelled one after the other', async ({ page }) => {
  const first = await spellWithClicks(page);
  await waitForPlaying(page);
  const second = await spellWithClicks(page);
  await waitForPlaying(page);
  const s = await lava(page);
  expect(second).not.toBe(first);
  expect(s.wordIndex).toBe(2);
  expect(s.lives).toBe(3);
  expect(s.score).toBe(10 * first.length + 20 + 10 * second.length + 20);
});

test('keys work with a Hebrew keyboard layout', async ({ page }) => {
  const { word } = await lava(page);
  // The D key on a Hebrew layout reports key "ג" but code "KeyD".
  await page.evaluate((letter) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ג', code: `Key${letter.toUpperCase()}` }));
  }, word[0]);
  await page.waitForFunction(() => window.game.scene.getScene('lava').run.position === 1, null, { timeout: 30_000 });
});

test('the mouse pointer is visible over the game', async ({ page }) => {
  const cursor = await page.evaluate(() => getComputedStyle(window.game.canvas).cursor);
  expect(cursor).not.toBe('none');
  expect(cursor).toContain('url(');
});

test('uses the saved word list', async ({ page }) => {
  const s = await lava(page);
  expect(s.words.sort()).toEqual(['cat', 'dog', 'sun']);
  expect(s.lives).toBe(3);
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

test('typing the letters spells the word and moves to the next one', async ({ page }) => {
  const { word } = await lava(page);
  for (let i = 0; i < word.length; i++) {
    await waitForPlaying(page);
    await page.keyboard.press(word[i]);
    await page.waitForFunction((n) => window.game.scene.getScene('lava').run.position === n, i + 1, { timeout: 30_000 });
  }
  await page.waitForFunction(() => window.game.scene.getScene('lava').wordIndex === 1, null, { timeout: 30_000 });
  const s = await lava(page);
  expect(s.score).toBe(10 * word.length + 20); // no mistakes bonus
  expect(s.lives).toBe(3);
});

test('three wrong jumps end the game', async ({ page }) => {
  for (let lives = 3; lives > 0; ) {
    await waitForPlaying(page);
    const wrongLeft = await page.evaluate(() => window.game.scene.getScene('lava').nextRocks().length > 1);
    if (!wrongLeft) {
      // Both wrong rocks in this column have sunk: step forward to reach fresh ones.
      const position = (await lava(page)).position;
      await clickRock(page, true);
      await page.waitForFunction((n) => window.game.scene.getScene('lava').run.position === n, position + 1);
      continue;
    }
    await clickRock(page, false);
    lives--;
    await page.waitForFunction((n) => window.game.scene.getScene('lava').lives === n, lives, { timeout: 30_000 });
  }
  await page.waitForFunction(() => window.game.scene.getScene('lava').state === 'over', null, { timeout: 30_000 });
});

test('90% success in the balloon game unlocks the lava level', async ({ page }) => {
  await page.goto('/');
  await page.locator('#word-start').click();
  await page.waitForFunction(() => window.game.scene.getScene('game').state === 'playing');
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

test('below 90% there is no lava button', async ({ page }) => {
  await page.goto('/');
  await page.locator('#word-start').click();
  await page.waitForFunction(() => window.game.scene.getScene('game').state === 'playing');
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('game');
    const quiz = scene.quiz;
    for (let i = 0; i < 10; i++) {
      quiz.next();
      quiz.answer(i < 8 ? quiz.current.answer : quiz.current.options.find((o) => o !== quiz.current.answer));
    }
    scene.endRound();
  });
  await page.waitForFunction(() => window.game.scene.getScene('game').overlay?.list.some((o) => o.text === 'Play again'));
  expect(await page.evaluate(() => window.game.scene.getScene('game').overlay.list.some((o) => o.text === 'Lava level'))).toBe(false);
});

// Long words, so the camera has scrolled well along the lava by the time the game ends.
const LONG_WORDS = ['elephant - פיל', 'umbrella - מטריה', 'computer - מחשב'].join('\n');

// Click a fixed-on-screen button of the lava scene by its label.
async function clickLavaButton(page, label) {
  const pos = await page.evaluate((label) => {
    const s = window.game.scene.getScene('lava');
    const btn = s.children.list.find((o) => o.text === label);
    const rect = window.game.canvas.getBoundingClientRect();
    return { x: rect.left + (btn.x * rect.width) / 1280, y: rect.top + (btn.y * rect.height) / 720 };
  }, label);
  await page.mouse.click(pos.x, pos.y);
}

// Walk 6 letters along the word, then lose every life there.
async function loseFarAlong(page) {
  await page.goto('/');
  await page.locator('#word-input').fill(LONG_WORDS);
  await page.goto('/?level=lava');
  await waitForPlaying(page);
  const { word } = await lava(page);
  for (let i = 0; i < 6; i++) {
    await waitForPlaying(page);
    await page.keyboard.press(word[i]);
    await page.waitForFunction((n) => window.game.scene.getScene('lava').run.position === n, i + 1, { timeout: 30_000 });
  }
  while ((await lava(page)).state !== 'over') {
    await waitForPlaying(page);
    if ((await page.evaluate(() => window.game.scene.getScene('lava').nextRocks().length)) > 1) {
      const lives = (await lava(page)).lives;
      await clickRock(page, false);
      await page.waitForFunction((n) => window.game.scene.getScene('lava').lives === n, lives - 1, { timeout: 30_000 });
    } else {
      const position = (await lava(page)).position;
      await clickRock(page, true);
      await page.waitForFunction((n) => window.game.scene.getScene('lava').run.position === n, position + 1, { timeout: 30_000 });
    }
    await page.waitForFunction(() => !['jumping', 'falling'].includes(window.game.scene.getScene('lava').state), null, { timeout: 30_000 });
  }
  const scroll = await page.evaluate(() => window.game.scene.getScene('lava').cameras.main.scrollX);
  expect(scroll).toBeGreaterThan(500);
}

test('Play again works after losing far along a word (camera scrolled)', async ({ page }) => {
  await loseFarAlong(page);
  await clickLavaButton(page, 'Play again');
  await page.waitForFunction(() => {
    const s = window.game.scene.getScene('lava');
    return s.state === 'playing' && s.lives === 3 && s.run.position === 0;
  }, null, { timeout: 30_000 });
});

test('Balloons button goes back to the balloon game after losing far along a word', async ({ page }) => {
  await loseFarAlong(page);
  await clickLavaButton(page, 'Balloons');
  await expect(page.locator('#word-form')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => window.game.scene.isActive('game'), null, { timeout: 30_000 });
});

test('Play again in the balloon game end screen starts a new round', async ({ page }) => {
  await page.goto('/');
  await page.locator('#word-start').click();
  await page.waitForFunction(() => window.game.scene.getScene('game').state === 'playing');
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
