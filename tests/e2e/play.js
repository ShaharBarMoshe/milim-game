// Helpers for driving the game through the canvas, shared by the e2e specs.
import { expect } from '@playwright/test';

export const GAME_W = 1280;
export const GAME_H = 720;

// Snapshot of the game scene's quiz + balloons, with balloon centres converted to page coordinates.
export async function snapshot(page) {
  return page.evaluate(
    ({ W, H }) => {
      const scene = window.game?.scene?.getScene('game');
      if (!scene) return null;
      const canvas = window.game.canvas;
      const rect = canvas.getBoundingClientRect();
      const cam = scene.cameras?.main;
      const sx = rect.width / W;
      const sy = rect.height / H;
      const balloons = (scene.balloons || [])
        .filter((b) => b && b.active !== false && b.visible !== false)
        .map((b) => {
          const gx = b.x - (cam?.scrollX || 0);
          const gy = b.y - (cam?.scrollY || 0);
          return {
            word: b.word,
            isAnswer: b.isAnswer,
            tried: Boolean(b.tried),
            gx,
            gy,
            px: rect.left + gx * sx,
            py: rect.top + gy * sy,
          };
        });
      const stats = scene.quiz?.stats ? scene.quiz.stats() : null;
      return {
        state: scene.state,
        waveResolved: Boolean(scene.waveResolved),
        score: scene.score,
        current: scene.quiz?.current ?? null,
        stats,
        balloons,
      };
    },
    { W: GAME_W, H: GAME_H },
  );
}

const onScreen = (b) => b.gx > 40 && b.gx < GAME_W - 40 && b.gy > 80 && b.gy < GAME_H - 100;

// Repeatedly look for a clickable balloon matching `want` (on screen, not overlapping others, belonging
// to the current question) and click its centre as soon as one is found.
export async function clickBalloon(page, want) {
  let clicked = null;
  await expect
    .poll(
      async () => {
        const s = await snapshot(page);
        // After the right balloon is hit the game ignores clicks until the next wave.
        if (!s || s.state !== 'playing' || !s.current || s.waveResolved) return false;
        const answerPresent = s.balloons.some((b) => b.isAnswer && b.word === s.current.answer);
        if (!answerPresent) return false;
        const target = s.balloons.find(
          (b) =>
            b.isAnswer === (want === 'correct') &&
            !b.tried &&
            onScreen(b) &&
            s.current.options.includes(b.word) &&
            s.balloons.every((o) => o === b || Math.hypot(o.gx - b.gx, o.gy - b.gy) > 110),
        );
        if (!target) return false;
        await page.mouse.click(target.px, target.py);
        clicked = { ...target, before: s };
        return true;
      },
      { timeout: 30_000, intervals: [100, 200, 250] },
    )
    .toBe(true);
  return clicked;
}

// Click a button on a scene's end screen by its label. The balloon game keeps its end screen in
// `overlay`; the lava level adds the buttons straight to the scene, fixed on screen.
export async function clickButton(page, sceneKey, label) {
  const pos = await (
    await page.waitForFunction(
      ({ sceneKey, label, W, H }) => {
        const s = window.game.scene.getScene(sceneKey);
        const btn = (s.overlay?.list ?? s.children.list).find((o) => o.text === label);
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

// Page position of a place on the map.
export async function mapSpot(page, key) {
  await page.waitForFunction(() => window.game.scene.getScene('map')?.state === 'map', null, { timeout: 30_000 });
  return page.evaluate(
    ({ key, W, H }) => {
      const s = window.game.scene.getScene('map').spots[key];
      const r = window.game.canvas.getBoundingClientRect();
      return { x: r.left + (s.x * r.width) / W, y: r.top + (s.y * r.height) / H };
    },
    { key, W: GAME_W, H: GAME_H },
  );
}

export async function clickMapSpot(page, key) {
  const { x, y } = await mapSpot(page, key);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
}

// From the word list screen: go to the map and open Balloon Meadow.
export async function playBalloons(page) {
  await page.locator('#word-start').click();
  await expect(page.locator('#word-form')).toBeHidden();
  await clickMapSpot(page, 'balloons');
  await page.waitForFunction(
    () => {
      const s = window.game.scene.getScene('game');
      return window.game.scene.isActive('game') && s.state === 'playing' && s.quiz?.current && s.balloons?.length > 0;
    },
    null,
    { timeout: 30_000 },
  );
}
