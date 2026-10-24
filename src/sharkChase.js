// The chase in Shark Lake: the diver's swimming, the shark that hunts it, and where the letter bubbles
// float. No Phaser or DOM here, so it runs (and is tested) in Node. The spelling itself is SpellingRun.

// The swimmable part of the 1280x720 game, below the banner.
export const LAKE = { left: 40, top: 110, right: 1240, bottom: 690 };

export const DIVER_SPEED = 260; // px/s
export const SHARK_SPEED = 120; // px/s, slower than the diver, so a good swimmer can stay ahead
export const STUN_MS = 3000; // a right letter stuns the shark this long
export const SLOW_FACTOR = 0; // the stunned shark's speed, as a share of its normal speed (it stops)
export const LUNGE = 140; // px the shark jumps closer on a wrong letter
export const CATCH_RADIUS = 60;
export const LETTER_RADIUS = 42;

// Rows of diver.png and shark.png (tools/slice_divers.py): frame = row * FRAMES_PER_ROW + column.
export const SWIM_ROWS = { right: 0, left: 1, up: 2, down: 3 };
export const FRAMES_PER_ROW = 5;

// Which way a move goes, by its dominant axis; null when it doesn't move.
export function swimDirection(dx, dy) {
  if (!dx && !dy) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

// The direction the arrow keys point, of length 1 (or 0 when none, or opposite ones, are held).
export function keyVector({ left = false, right = false, up = false, down = false } = {}) {
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const y = (down ? 1 : 0) - (up ? 1 : 0);
  const len = Math.hypot(x, y);
  return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
}

// The direction from the diver toward the pointer, of length 1, or nothing when the pointer is on the diver.
export function pointerVector(from, to, deadZone = 24) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  return len > deadZone ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The diver after swimming `dt` seconds along `vec`, kept inside the lake.
export function moveDiver(pos, vec, dt, speed = DIVER_SPEED, lake = LAKE) {
  return {
    x: clamp(pos.x + vec.x * speed * dt, lake.left, lake.right),
    y: clamp(pos.y + vec.y * speed * dt, lake.top, lake.bottom),
  };
}

export class Shark {
  constructor({ x, y, speed = SHARK_SPEED }) {
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.stunnedUntil = 0; // game time (ms) the stun wears off
  }

  stunned(now) {
    return now < this.stunnedUntil;
  }

  // Stop the shark for `ms` from `now`; a stun already running longer is kept.
  stun(now, ms = STUN_MS) {
    this.stunnedUntil = Math.max(this.stunnedUntil, now + ms);
  }

  distanceTo(target) {
    return Math.hypot(target.x - this.x, target.y - this.y);
  }

  // Swim `dt` seconds toward the target (not while stunned); returns which way it's heading.
  chase(target, dt, now) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const speed = this.stunned(now) ? this.speed * SLOW_FACTOR : this.speed;
    const step = Math.min(dist, speed * dt);
    if (dist > 0 && step > 0) {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
    return swimDirection(dx, dy);
  }

  // A wrong letter: jump `distance` toward the target, but stop short of catching it.
  lunge(target, distance = LUNGE) {
    const dist = this.distanceTo(target);
    const step = Math.min(distance, Math.max(0, dist - (CATCH_RADIUS + 10)));
    if (dist > 0 && step > 0) {
      this.x += ((target.x - this.x) / dist) * step;
      this.y += ((target.y - this.y) / dist) * step;
    }
  }

  catches(target, radius = CATCH_RADIUS) {
    return this.distanceTo(target) <= radius;
  }
}

// A spot for each letter's bubble, inside the lake, apart from each other and from the points to `avoid`
// (the diver and the shark). After a few hundred tries a letter takes the roomiest spot found.
export function placeLetters(letters, { lake = LAKE, avoid = [], random = Math.random, gap = LETTER_RADIUS * 3 } = {}) {
  const placed = [];
  const m = LETTER_RADIUS;
  for (const letter of letters) {
    let best = null;
    let bestRoom = -Infinity;
    for (let i = 0; i < 200; i++) {
      const x = lake.left + m + random() * (lake.right - lake.left - 2 * m);
      const y = lake.top + m + random() * (lake.bottom - lake.top - 2 * m);
      const room = Math.min(Infinity, ...[...avoid, ...placed].map((p) => Math.hypot(p.x - x, p.y - y)));
      if (room > bestRoom) {
        best = { x, y };
        bestRoom = room;
      }
      if (room >= gap) break;
    }
    placed.push({ letter, x: best.x, y: best.y });
  }
  return placed;
}

// The bubble the diver is touching (the nearest one within reach), or null.
export function touchedLetter(pos, bubbles, radius = LETTER_RADIUS + 20) {
  let hit = null;
  let nearest = radius;
  for (const b of bubbles) {
    const d = Math.hypot(b.x - pos.x, b.y - pos.y);
    if (d <= nearest) {
      hit = b;
      nearest = d;
    }
  }
  return hit;
}
