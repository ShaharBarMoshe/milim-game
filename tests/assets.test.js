// TC-SHOP-005: every sprite sheet PreloadScene loads for the shop's players, the diver suits and the shark is
// in public/assets, and its size is a whole number of frames (a missing or resliced sheet breaks loading).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS } from '../src/shop.js';
import { PLAYER_SPRITES } from '../src/players.js';
import { FRAMES_PER_ROW, SWIM_ROWS } from '../src/sharkChase.js';

const ASSETS = fileURLToPath(new URL('../public/assets/', import.meta.url));

// Width and height from a PNG's IHDR chunk.
function pngSize(name) {
  const buf = readFileSync(ASSETS + name);
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function expectSheet(name, frameW, frameH, { rows, cols } = {}) {
  expect(existsSync(ASSETS + name), `${name} is missing`).toBe(true);
  const { w, h } = pngSize(name);
  expect(w % frameW, `${name} width ${w} is not a multiple of ${frameW}`).toBe(0);
  expect(h % frameH, `${name} height ${h} is not a multiple of ${frameH}`).toBe(0);
  if (cols) expect(w / frameW).toBeGreaterThanOrEqual(cols);
  if (rows) expect(h / frameH).toBeGreaterThanOrEqual(rows);
}

describe('sprite sheets on disk', () => {
  it('has both sheets of every shop player', () => {
    for (const [sprite, { archer, jumper }] of Object.entries(PLAYER_SPRITES)) {
      expectSheet(`${sprite}_archer.png`, archer.w, archer.h);
      expectSheet(`${sprite}_jumper.png`, jumper.w, jumper.h);
    }
  });

  it('has the diver in its own suit and in every suit colour the shop sells', () => {
    const rows = Object.keys(SWIM_ROWS).length;
    const suits = ITEMS.filter((i) => i.slot === 'diver').map((i) => `diver_${i.suit}.png`);
    expect(suits.length).toBeGreaterThan(0);
    for (const name of ['diver.png', ...suits]) expectSheet(name, 160, 160, { rows, cols: FRAMES_PER_ROW });
  });

  it('has the shark with a row per swim direction', () => {
    expectSheet('shark.png', 200, 200, { rows: Object.keys(SWIM_ROWS).length, cols: FRAMES_PER_ROW });
  });

  it('has the base sheets of the balloon and lava games', () => {
    expectSheet('hunter.png', 208, 250);
    expectSheet('robot.png', 247, 127);
    for (const name of ['arrow.png', 'lava_splash.png']) expect(existsSync(ASSETS + name), name).toBe(true);
  });
});
