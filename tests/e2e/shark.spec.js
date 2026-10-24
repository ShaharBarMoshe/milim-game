import { test, expect } from '@playwright/test';
import { pairs, useWords } from './words.js';
import { clickMapSpot, GAME_W, GAME_H } from './play.js';

const WORDS = pairs('dog=כלב', 'cat=חתול', 'sun=שמש');

let pageErrors;

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));
  await page.goto('/');
});

test.afterEach(() => {
  expect(pageErrors.map((e) => String(e.stack || e))).toEqual([]);
});

const openShark = async (page) => {
  await useWords(page, WORDS, '/?level=shark');
  await page.waitForFunction(() => window.game?.scene?.getScene('shark')?.state === 'playing', null, { timeout: 30_000 });
};

const shark = (page) =>
  page.evaluate(() => {
    const s = window.game.scene.getScene('shark');
    return {
      state: s.state,
      word: s.run?.word,
      position: s.run?.position,
      mistakes: s.mistakes,
      lives: s.lives,
      wordIndex: s.wordIndex,
      words: s.words.map((w) => w.en),
      stunned: s.shark.stunnedUntil > s.time.now,
      distance: Math.hypot(s.shark.x - s.diver.x, s.shark.y - s.diver.y),
      bubbles: s.bubbles.map((b) => b.letter),
    };
  });

// Put the shark in the lake corner farthest from `to` (so it can't catch the diver mid-test, and it
// isn't stunned), then teleport the diver onto the right bubble or a wrong one. Returns the letter and
// the shark's distance from the diver right after the teleport.
const swimOnto = (page, correct) =>
  page.evaluate((correct) => {
    const s = window.game.scene.getScene('shark');
    const answer = s.run.columns[s.run.position].answer;
    const b = s.bubbles.find((o) => (o.letter === answer) === correct);
    const corners = [[60, 130], [1220, 130], [60, 670], [1220, 670]];
    const [x, y] = corners.reduce((best, c) => (Math.hypot(c[0] - b.x, c[1] - b.y) > Math.hypot(best[0] - b.x, best[1] - b.y) ? c : best));
    s.shark.x = x;
    s.shark.y = y;
    s.shark.stunnedUntil = 0;
    s.diver.setPosition(b.x, b.y);
    return { letter: b.letter, distance: Math.hypot(x - b.x, y - b.y) };
  }, correct);

// Click a text button (e.g. 'Map') wherever the scene keeps it: in a container or straight in the scene.
async function clickText(page, sceneKey, label) {
  const pos = await (
    await page.waitForFunction(
      ({ sceneKey, label, W, H }) => {
        const s = window.game.scene.getScene(sceneKey);
        const find = (list) => {
          for (const o of list) {
            if (o.text === label && o.visible !== false) return o;
            if (o.list) {
              const inner = find(o.list);
              if (inner) return { x: inner.x + o.x, y: inner.y + o.y };
            }
          }
          return null;
        };
        const btn = find(s.children.list);
        if (!btn) return null;
        const rect = window.game.canvas.getBoundingClientRect();
        return { x: rect.left + (btn.x * rect.width) / W, y: rect.top + (btn.y * rect.height) / H };
      },
      { sceneKey, label, W: GAME_W, H: GAME_H },
      { timeout: 30_000 },
    )
  ).jsonValue();
  await page.mouse.click(pos.x, pos.y);
}

const onMap = (page) =>
  page.waitForFunction(() => window.game.scene.isActive('map') && window.game.scene.getScene('map').state === 'map', null, { timeout: 30_000 });

test('the map has Shark Lake, and clicking it starts the shark game with the chosen words', async ({ page }) => {
  await useWords(page, WORDS);
  await page.locator('#word-start').click();
  await expect(page.locator('#word-form')).toBeHidden();
  await onMap(page);
  // Every text on the map, including the ones inside the place markers.
  const texts = await page.evaluate(() => {
    const all = (list) => list.flatMap((o) => [o.text, ...(o.list ? all(o.list) : [])]);
    return all(window.game.scene.getScene('map').children.list).filter(Boolean);
  });
  expect(texts).toContain('Shark Lake');
  expect(texts).not.toContain('Silent Lake');
  expect(await page.evaluate(() => window.game.scene.getScene('map').spots.shark.locked)).toBeNull();

  await clickMapSpot(page, 'shark');
  await page.waitForFunction(() => window.game.scene.getScene('shark')?.state === 'playing', null, { timeout: 30_000 });
  const s = await shark(page);
  expect(s.words.length).toBeGreaterThan(0);
  s.words.forEach((w) => expect(['dog', 'cat', 'sun']).toContain(w));
  expect(s.lives).toBe(3);
});

test('happy flow: the right letter stuns the shark, a wrong one brings it closer, Esc goes to the map', async ({ page }) => {
  await openShark(page);
  const start = await shark(page);
  expect(start).toMatchObject({ position: 0, mistakes: 0, lives: 3 });
  expect(start.bubbles).toHaveLength(3);
  expect(start.bubbles).toContain(start.word[0]);

  await swimOnto(page, true);
  await page.waitForFunction(() => window.game.scene.getScene('shark').run.position === 1, null, { timeout: 30_000 });
  let s = await shark(page);
  expect(s.stunned).toBe(true);
  expect(s.mistakes).toBe(0);
  // New bubbles for the next letter.
  expect(s.bubbles).toContain(s.word[1]);

  const { distance } = await swimOnto(page, false);
  await page.waitForFunction(() => window.game.scene.getScene('shark').mistakes === 1, null, { timeout: 30_000 });
  s = await shark(page);
  expect(s.position).toBe(1);
  expect(s.lives).toBe(3);
  // The shark lunged at least LUNGE closer (its chase only adds to that).
  const lunge = await page.evaluate(() => import('/src/sharkChase.js').then((m) => m.LUNGE));
  expect(s.distance).toBeLessThanOrEqual(distance - lunge + 1);

  await page.keyboard.press('Escape');
  await onMap(page);
});

test('the shark catching the diver costs lives until the game is over, then Map goes back', async ({ page }) => {
  await openShark(page);
  // Keep the shark on the diver: each catch costs a life (with a short safe time in between).
  await page.waitForFunction(
    () => {
      const s = window.game.scene.getScene('shark');
      if (s.state === 'over') return true;
      s.shark.stunnedUntil = 0;
      s.shark.x = s.diver.x;
      s.shark.y = s.diver.y;
      return false;
    },
    null,
    { timeout: 40_000, polling: 100 },
  );
  expect(await shark(page)).toMatchObject({ state: 'over', lives: 0 });
  await clickText(page, 'shark', 'Map');
  await onMap(page);
});

test('a diver suit bought in the shop is worn in the game', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem('balloon-archer-shop', JSON.stringify({ points: 0, owned: ['diver-red'], worn: { diver: 'diver-red' }, stock: {} })),
  );
  await openShark(page);
  const skin = await page.evaluate(() => {
    const s = window.game.scene.getScene('shark');
    return { skin: s.diverSkin, texture: s.diver.texture.key };
  });
  expect(skin).toEqual({ skin: 'diver_red', texture: 'diver_red' });
});
