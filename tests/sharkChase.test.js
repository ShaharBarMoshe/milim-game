// Test plan: src/sharkChase.js — the Shark Lake rules, without Phaser.
// - Swimming: swimDirection (dominant axis, none), keyVector (diagonals normalised), pointerVector (dead
//   zone), moveDiver (speed × dt, clamped to the lake).
// - The shark: chases at its speed, stops while stunned (a stun extends, never shortens), lunges closer on
//   a wrong letter but never inside CATCH_RADIUS + 10, catches within its radius.
// - Bubbles: placeLetters puts one bubble per letter inside the lake, apart from each other and from the
//   diver and shark, and still returns (never hangs) when the lake is too small; touchedLetter picks the
//   nearest bubble in reach.
import { describe, it, expect } from 'vitest';
import {
  CATCH_RADIUS,
  DIVER_SPEED,
  FRAMES_PER_ROW,
  LAKE,
  LETTER_RADIUS,
  LUNGE,
  SHARK_SPEED,
  STUN_MS,
  SWIM_ROWS,
  Shark,
  keyVector,
  moveDiver,
  placeLetters,
  pointerVector,
  swimDirection,
  touchedLetter,
} from '../src/sharkChase.js';
import { mulberry32 } from './helpers.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const length = (v) => Math.hypot(v.x, v.y);

describe('constants', () => {
  it('has a lake inside the 1280×720 game, a diver faster than the shark, and sensible sizes', () => {
    expect(LAKE.left).toBeGreaterThanOrEqual(0);
    expect(LAKE.top).toBeGreaterThanOrEqual(0);
    expect(LAKE.right).toBeLessThanOrEqual(1280);
    expect(LAKE.bottom).toBeLessThanOrEqual(720);
    expect(LAKE.right).toBeGreaterThan(LAKE.left);
    expect(LAKE.bottom).toBeGreaterThan(LAKE.top);
    expect(DIVER_SPEED).toBeGreaterThan(SHARK_SPEED);
    expect(SHARK_SPEED).toBeGreaterThan(0);
    expect(STUN_MS).toBeGreaterThan(0);
    expect(LUNGE).toBeGreaterThan(0);
    expect(CATCH_RADIUS).toBeGreaterThan(0);
    expect(LETTER_RADIUS).toBeGreaterThan(0);
  });

  it('names a sprite-sheet row for each swim direction, 5 frames a row', () => {
    expect(SWIM_ROWS).toEqual({ right: 0, left: 1, up: 2, down: 3 });
    expect(FRAMES_PER_ROW).toBe(5);
  });
});

describe('swimDirection', () => {
  it('follows the dominant axis', () => {
    expect(swimDirection(1, 0)).toBe('right');
    expect(swimDirection(-1, 0)).toBe('left');
    expect(swimDirection(0, -1)).toBe('up');
    expect(swimDirection(0, 1)).toBe('down');
    expect(swimDirection(5, 2)).toBe('right');
    expect(swimDirection(-5, -2)).toBe('left');
    expect(swimDirection(2, -5)).toBe('up');
    expect(swimDirection(-2, 5)).toBe('down');
  });

  it('is null with no movement', () => {
    expect(swimDirection(0, 0)).toBeNull();
  });
});

describe('keyVector', () => {
  it('points the way of a single key', () => {
    expect(keyVector({ right: true })).toMatchObject({ x: 1, y: 0 });
    expect(keyVector({ left: true })).toMatchObject({ x: -1, y: 0 });
    expect(keyVector({ up: true })).toMatchObject({ x: 0, y: -1 });
    expect(keyVector({ down: true })).toMatchObject({ x: 0, y: 1 });
  });

  it('normalises diagonals, so they are no faster', () => {
    const v = keyVector({ right: true, down: true });
    expect(v.x).toBeCloseTo(Math.SQRT1_2);
    expect(v.y).toBeCloseTo(Math.SQRT1_2);
    expect(length(keyVector({ left: true, up: true }))).toBeCloseTo(1);
  });

  it('is still with no keys, or with opposite keys', () => {
    for (const keys of [{}, { left: false, right: false, up: false, down: false }, { left: true, right: true }, { up: true, down: true }]) {
      const v = keyVector(keys);
      expect(Math.abs(v.x)).toBe(0);
      expect(Math.abs(v.y)).toBe(0);
    }
  });
});

describe('pointerVector', () => {
  it('is a unit vector toward the pointer', () => {
    const v = pointerVector({ x: 100, y: 100 }, { x: 400, y: 500 });
    expect(length(v)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(0.8);
  });

  it('is still inside the dead zone (default 24 px)', () => {
    expect(pointerVector({ x: 100, y: 100 }, { x: 110, y: 110 })).toEqual({ x: 0, y: 0 });
    expect(pointerVector({ x: 100, y: 100 }, { x: 100, y: 100 })).toEqual({ x: 0, y: 0 });
    expect(length(pointerVector({ x: 100, y: 100 }, { x: 130, y: 100 }))).toBeCloseTo(1);
    // A custom dead zone.
    expect(pointerVector({ x: 100, y: 100 }, { x: 130, y: 100 }, 50)).toEqual({ x: 0, y: 0 });
  });
});

describe('moveDiver', () => {
  const centre = { x: (LAKE.left + LAKE.right) / 2, y: (LAKE.top + LAKE.bottom) / 2 };

  it('swims speed × dt along the vector, and does not change the old position', () => {
    const pos = { ...centre };
    const next = moveDiver(pos, { x: 1, y: 0 }, 0.5);
    expect(next.x).toBeCloseTo(centre.x + DIVER_SPEED * 0.5);
    expect(next.y).toBeCloseTo(centre.y);
    expect(pos).toEqual(centre);
    const slow = moveDiver(centre, { x: 0, y: -1 }, 1, 100);
    expect(slow.y).toBeCloseTo(centre.y - 100);
  });

  it('stays put with no input', () => {
    expect(moveDiver(centre, { x: 0, y: 0 }, 1)).toMatchObject(centre);
  });

  it('is clamped inside the lake', () => {
    const lake = { left: 0, top: 0, right: 200, bottom: 100 };
    expect(moveDiver({ x: 190, y: 50 }, { x: 1, y: 0 }, 1, 500, lake)).toMatchObject({ x: 200, y: 50 });
    expect(moveDiver({ x: 10, y: 50 }, { x: -1, y: 0 }, 1, 500, lake)).toMatchObject({ x: 0, y: 50 });
    expect(moveDiver({ x: 50, y: 10 }, { x: 0, y: -1 }, 1, 500, lake)).toMatchObject({ x: 50, y: 0 });
    expect(moveDiver({ x: 50, y: 90 }, { x: 0, y: 1 }, 1, 500, lake)).toMatchObject({ x: 50, y: 100 });
    const far = moveDiver(centre, { x: 1, y: 1 }, 100);
    expect(far.x).toBeLessThanOrEqual(LAKE.right);
    expect(far.y).toBeLessThanOrEqual(LAKE.bottom);
  });
});

describe('Shark', () => {
  it('starts where it is put, not stunned, at the default speed', () => {
    const shark = new Shark({ x: 100, y: 200 });
    expect(shark).toMatchObject({ x: 100, y: 200, speed: SHARK_SPEED, stunnedUntil: 0 });
    expect(shark.stunned(0)).toBe(false);
    expect(new Shark({ x: 0, y: 0, speed: 50 }).speed).toBe(50);
  });

  it('chases the target at its speed and tells which way it swims', () => {
    const shark = new Shark({ x: 100, y: 300, speed: 100 });
    const diver = { x: 600, y: 300 };
    expect(shark.chase(diver, 1, 0)).toBe('right');
    expect(shark.x).toBeCloseTo(200);
    expect(shark.y).toBeCloseTo(300);
    expect(shark.distanceTo(diver)).toBeCloseTo(400);
    const up = new Shark({ x: 300, y: 600, speed: 100 });
    expect(up.chase({ x: 300, y: 100 }, 0.5, 0)).toBe('up');
    expect(up.y).toBeCloseTo(550);
    const left = new Shark({ x: 600, y: 300 });
    expect(left.chase({ x: 100, y: 310 }, 0.1, 0)).toBe('left');
  });

  it('does not overshoot the target', () => {
    const shark = new Shark({ x: 100, y: 100, speed: 1000 });
    shark.chase({ x: 150, y: 100 }, 1, 0);
    expect(shark.x).toBeLessThanOrEqual(150 + 1e-6);
  });

  it('stops while stunned and swims again afterwards', () => {
    const shark = new Shark({ x: 100, y: 300, speed: 100 });
    const diver = { x: 900, y: 300 };
    shark.stun(1000);
    expect(shark.stunned(1000)).toBe(true);
    expect(shark.stunnedUntil).toBe(1000 + STUN_MS);
    shark.chase(diver, 1, 1500);
    expect(shark.x).toBeCloseTo(100);
    expect(shark.stunned(1000 + STUN_MS - 1)).toBe(true);
    expect(shark.stunned(1000 + STUN_MS + 1)).toBe(false);
    shark.chase(diver, 1, 1000 + STUN_MS + 1);
    expect(shark.x).toBeCloseTo(200);
  });

  it('a new stun extends the old one but never shortens it', () => {
    const shark = new Shark({ x: 0, y: 0 });
    shark.stun(0, 5000);
    shark.stun(1000, 1000); // would end at 2000: keeps 5000
    expect(shark.stunnedUntil).toBe(5000);
    shark.stun(4000, 3000); // ends at 7000: longer, so it counts
    expect(shark.stunnedUntil).toBe(7000);
  });

  it('lunges closer on a wrong letter, but never into the diver', () => {
    const diver = { x: 800, y: 300 };
    const shark = new Shark({ x: 200, y: 300 });
    const before = shark.distanceTo(diver);
    shark.lunge(diver);
    expect(shark.distanceTo(diver)).toBeCloseTo(before - LUNGE);
    expect(shark.y).toBeCloseTo(300); // straight toward the diver

    const near = new Shark({ x: 800 - CATCH_RADIUS - 40, y: 300 });
    near.lunge(diver, 500);
    expect(near.distanceTo(diver)).toBeGreaterThanOrEqual(CATCH_RADIUS + 10 - 1e-6);
    expect(near.catches(diver)).toBe(false);
    expect(near.x).toBeLessThan(diver.x); // still on its own side
  });

  it('catches the diver within its radius', () => {
    const shark = new Shark({ x: 300, y: 300 });
    expect(shark.catches({ x: 300 + CATCH_RADIUS - 1, y: 300 })).toBe(true);
    expect(shark.catches({ x: 300, y: 300 })).toBe(true);
    expect(shark.catches({ x: 300 + CATCH_RADIUS + 5, y: 300 })).toBe(false);
    expect(shark.catches({ x: 330, y: 300 }, 20)).toBe(false);
    expect(shark.distanceTo({ x: 303, y: 304 })).toBeCloseTo(5);
  });
});

describe('placeLetters', () => {
  const avoid = [{ x: 200, y: 400 }, { x: 1100, y: 400 }];

  it('puts one bubble per letter inside the lake, apart from each other, the diver and the shark', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const gap = LETTER_RADIUS * 3;
      const bubbles = placeLetters(['a', 'b', 'c'], { avoid, random: mulberry32(seed) });
      expect(bubbles.map((b) => b.letter)).toEqual(['a', 'b', 'c']);
      for (const b of bubbles) {
        expect(b.x).toBeGreaterThanOrEqual(LAKE.left + LETTER_RADIUS);
        expect(b.x).toBeLessThanOrEqual(LAKE.right - LETTER_RADIUS);
        expect(b.y).toBeGreaterThanOrEqual(LAKE.top + LETTER_RADIUS);
        expect(b.y).toBeLessThanOrEqual(LAKE.bottom - LETTER_RADIUS);
        for (const p of avoid) expect(dist(b, p)).toBeGreaterThanOrEqual(gap);
      }
      for (let i = 0; i < bubbles.length; i++) {
        for (let j = i + 1; j < bubbles.length; j++) expect(dist(bubbles[i], bubbles[j])).toBeGreaterThanOrEqual(gap);
      }
    }
  });

  it('honours a custom lake and gap', () => {
    const lake = { left: 0, top: 0, right: 600, bottom: 400 };
    const bubbles = placeLetters(['x', 'y'], { lake, gap: 200, random: mulberry32(3) });
    expect(bubbles).toHaveLength(2);
    expect(dist(bubbles[0], bubbles[1])).toBeGreaterThanOrEqual(200);
    for (const b of bubbles) {
      expect(b.x).toBeGreaterThanOrEqual(LETTER_RADIUS);
      expect(b.x).toBeLessThanOrEqual(600 - LETTER_RADIUS);
    }
  });

  it('is the same for the same seed', () => {
    const a = placeLetters(['a', 'b', 'c'], { avoid, random: mulberry32(9) });
    const b = placeLetters(['a', 'b', 'c'], { avoid, random: mulberry32(9) });
    expect(a).toEqual(b);
  });

  it('still returns every letter when the lake is too small for the gaps', () => {
    const lake = { left: 0, top: 0, right: 120, bottom: 120 };
    const bubbles = placeLetters(['a', 'b', 'c', 'd', 'e'], { lake, avoid: [{ x: 60, y: 60 }], random: mulberry32(1) });
    expect(bubbles).toHaveLength(5);
    for (const b of bubbles) {
      expect(Number.isFinite(b.x)).toBe(true);
      expect(Number.isFinite(b.y)).toBe(true);
    }
  });

  it('returns nothing for no letters', () => {
    expect(placeLetters([], { random: mulberry32(1) })).toEqual([]);
  });
});

describe('touchedLetter', () => {
  const bubbles = [
    { letter: 'a', x: 100, y: 100 },
    { letter: 'b', x: 160, y: 100 },
    { letter: 'c', x: 600, y: 400 },
  ];

  it('picks the nearest bubble within reach', () => {
    expect(touchedLetter({ x: 105, y: 100 }, bubbles).letter).toBe('a');
    expect(touchedLetter({ x: 150, y: 100 }, bubbles).letter).toBe('b');
    expect(touchedLetter({ x: 600 + LETTER_RADIUS, y: 400 }, bubbles).letter).toBe('c');
  });

  it('is null when nothing is in reach', () => {
    expect(touchedLetter({ x: 400, y: 600 }, bubbles)).toBeNull();
    expect(touchedLetter({ x: 100, y: 100 }, [])).toBeNull();
    expect(touchedLetter({ x: 130, y: 100 }, [bubbles[0]], 20)).toBeNull();
    expect(touchedLetter({ x: 130, y: 100 }, [bubbles[0]], 40).letter).toBe('a');
  });
});
