import { describe, it, expect } from 'vitest';
import { steer, missPoint } from '../src/ballistics.js';

const len = (x, y) => Math.hypot(x, y);
const angleBetween = (ax, ay, bx, by) => {
  const c = (ax * bx + ay * by) / (len(ax, ay) * len(bx, by));
  return Math.acos(Math.max(-1, Math.min(1, c)));
};

// Distance from point P to segment AB.
function segDist(ax, ay, bx, by, px, py) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}

// Distance from point P to the infinite line through A and B.
function lineDist(ax, ay, bx, by, px, py) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.abs(dx * (py - ay) - dy * (px - ax)) / Math.hypot(dx, dy);
}

describe('steer()', () => {
  const speed = 900;
  const maxTurn = 6; // rad/s
  const dt = 1 / 60;

  it('returns an object with numeric vx, vy', () => {
    const v = steer(speed, 0, 0, 0, 100, 100, speed, maxTurn, dt);
    expect(typeof v.vx).toBe('number');
    expect(typeof v.vy).toBe('number');
    expect(Number.isFinite(v.vx) && Number.isFinite(v.vy)).toBe(true);
  });

  it('keeps the speed magnitude', () => {
    const cases = [
      [speed, 0, 0, 0, 0, -300],
      [0, -speed, 10, 10, 400, 10],
      [-600, 300, 50, 50, -200, 400],
      [speed, 0, 0, 0, 500, 1], // nearly aligned
      [speed, 0, 0, 0, -500, 0], // target directly behind
    ];
    for (const [vx, vy, fx, fy, tx, ty] of cases) {
      const v = steer(vx, vy, fx, fy, tx, ty, speed, maxTurn, dt);
      expect(len(v.vx, v.vy)).toBeCloseTo(speed, 6);
    }
  });

  it('normalises to the given speed even if the input velocity has a different magnitude', () => {
    const v = steer(10, 0, 0, 0, 0, -100, speed, maxTurn, dt);
    expect(len(v.vx, v.vy)).toBeCloseTo(speed, 6);
  });

  it('turns toward the target, by at most maxTurn*dt per call', () => {
    const vx = speed;
    const vy = 0;
    const tx = 0;
    const ty = -300; // target 90 degrees to the left (up on screen)
    const v = steer(vx, vy, 0, 0, tx, ty, speed, maxTurn, dt);
    const turned = angleBetween(vx, vy, v.vx, v.vy);
    expect(turned).toBeLessThanOrEqual(maxTurn * dt + 1e-9);
    expect(turned).toBeGreaterThan(0);
    // closer to the target direction than before
    expect(angleBetween(v.vx, v.vy, tx, ty)).toBeLessThan(angleBetween(vx, vy, tx, ty));
    // turned the short way: it now points slightly up (negative y)
    expect(v.vy).toBeLessThan(0);
  });

  it('turns the short way in the other direction too', () => {
    const v = steer(speed, 0, 0, 0, 0, 300, speed, maxTurn, dt);
    expect(v.vy).toBeGreaterThan(0);
  });

  it('respects the cap for various dt and maxTurn values', () => {
    for (const [mt, step] of [
      [1, 1 / 60],
      [3, 1 / 30],
      [10, 1 / 120],
      [2, 0.1],
    ]) {
      const v = steer(0, -speed, 0, 0, 400, 0, speed, mt, step);
      expect(angleBetween(0, -speed, v.vx, v.vy)).toBeLessThanOrEqual(mt * step + 1e-9);
      expect(angleBetween(0, -speed, v.vx, v.vy)).toBeCloseTo(mt * step, 6);
    }
  });

  it('aligns exactly when the needed turn is smaller than the cap', () => {
    // target is ~0.05 rad off; cap is 0.1 rad
    const tx = 1000 * Math.cos(0.05);
    const ty = 1000 * Math.sin(0.05);
    const v = steer(speed, 0, 0, 0, tx, ty, speed, maxTurn, 0.1 / maxTurn);
    expect(angleBetween(v.vx, v.vy, tx, ty)).toBeLessThan(1e-6);
  });

  it('keeps heading when already pointing at the target', () => {
    const v = steer(speed, 0, 0, 0, 500, 0, speed, maxTurn, dt);
    expect(v.vx).toBeCloseTo(speed, 6);
    expect(v.vy).toBeCloseTo(0, 6);
  });

  it('converges onto a static target from a perpendicular start', () => {
    const scenarios = [
      { start: [640, 650], v: [speed, 0], target: [640, 200] },
      { start: [100, 600], v: [0, -speed], target: [900, 300] },
      { start: [1100, 650], v: [-speed, 0], target: [700, 150] },
    ];
    for (const { start, v, target } of scenarios) {
      let [x, y] = start;
      let [vx, vy] = v;
      const [tx, ty] = target;
      let best = Infinity;
      for (let i = 0; i < 600 && best > 3; i++) {
        ({ vx, vy } = steer(vx, vy, x, y, tx, ty, speed, maxTurn, dt));
        const nx = x + vx * dt;
        const ny = y + vy * dt;
        best = Math.min(best, segDist(x, y, nx, ny, tx, ty));
        x = nx;
        y = ny;
      }
      expect(best).toBeLessThan(3);
    }
  });

  it('converges at game-like settings with a slower, moving target', () => {
    let [x, y] = [200, 650];
    let [vx, vy] = [700, -200];
    let [tx, ty] = [900, 300];
    let best = Infinity;
    for (let i = 0; i < 600 && best > 5; i++) {
      tx += 0;
      ty -= 60 * dt; // balloon rising at 60 px/s
      ({ vx, vy } = steer(vx, vy, x, y, tx, ty, 700, 8, dt));
      const nx = x + vx * dt;
      const ny = y + vy * dt;
      best = Math.min(best, segDist(x, y, nx, ny, tx, ty));
      x = nx;
      y = ny;
    }
    expect(best).toBeLessThan(5);
  });
});

describe('missPoint()', () => {
  const cases = [
    [640, 680, 640, 200, 60],
    [100, 650, 900, 300, 50],
    [1200, 700, 300, 100, 80],
    [0, 0, 500, 0, 40],
    [0, 0, 0, -500, 40],
  ];

  it('is exactly `offset` px from the target', () => {
    for (const [fx, fy, tx, ty, off] of cases) {
      const p = missPoint(fx, fy, tx, ty, off);
      expect(Math.hypot(p.x - tx, p.y - ty)).toBeCloseTo(off, 6);
    }
  });

  it('is perpendicular to the line of fire', () => {
    for (const [fx, fy, tx, ty, off] of cases) {
      const p = missPoint(fx, fy, tx, ty, off);
      const fireX = tx - fx;
      const fireY = ty - fy;
      const dot = (p.x - tx) * fireX + (p.y - ty) * fireY;
      expect(Math.abs(dot) / (len(fireX, fireY) * off)).toBeLessThan(1e-9);
    }
  });

  it('the shot from origin to missPoint passes the target at ~offset distance', () => {
    for (const [fx, fy, tx, ty, off] of cases) {
      const p = missPoint(fx, fy, tx, ty, off);
      const d = lineDist(fx, fy, p.x, p.y, tx, ty);
      // exact value is off * L / sqrt(L^2 + off^2), i.e. within a couple of % for L >> off
      expect(d).toBeGreaterThan(off * 0.97);
      expect(d).toBeLessThanOrEqual(off + 1e-9);
    }
  });

  it('never hits: the target is not on the line of fire', () => {
    const p = missPoint(640, 680, 640, 200, 60);
    expect(lineDist(640, 680, p.x, p.y, 640, 200)).toBeGreaterThan(50);
  });
});
