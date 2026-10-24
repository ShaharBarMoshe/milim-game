// Test plan: stageBonus() — the extra points for completing a stage.
// - Balloons: no bonus under 5 right answers (4 vs 5); 30 for a completed round, 60 when the success rate
//   (escaped waves count as failures, as on the end screen) is at least 80% (79% vs 80%).
// - Lava: a bonus only when every word was crossed (all / some / none, and an empty game); 50, or 100 with
//   no mistakes at all.
// - Anything else (unknown game, missing or junk result) is worth 0 and never throws, since the scenes
//   call it at the end of every game.
import { describe, it, expect } from 'vitest';
import { stageBonus } from '../src/score.js';
import { successRate } from '../src/spelling.js';

const balloons = (correct, wrong = 0, missed = 0) => ({ correct, wrong, missed, streak: 0, bestStreak: 0, accuracy: 0, missedPairs: [] });

describe('stageBonus("balloons")', () => {
  it('needs at least 5 right answers', () => {
    expect(stageBonus('balloons', balloons(4))).toBe(0);
    expect(stageBonus('balloons', balloons(0))).toBe(0);
    expect(stageBonus('balloons', balloons(5, 5))).toBe(30);
  });

  it('adds 30 more at 80% success or better', () => {
    expect(stageBonus('balloons', balloons(5))).toBe(60);
    expect(stageBonus('balloons', balloons(20))).toBe(60);
  });

  it('counts escaped waves as failures: 79% gets 30, 80% gets 60', () => {
    const at79 = balloons(79, 10, 11);
    const at80 = balloons(8, 0, 2);
    expect(successRate(at79)).toBe(79);
    expect(successRate(at80)).toBe(80);
    expect(stageBonus('balloons', at79)).toBe(30);
    expect(stageBonus('balloons', at80)).toBe(60);
  });

  it('is at most 60', () => {
    expect(stageBonus('balloons', balloons(1000))).toBe(60);
  });
});

describe('stageBonus("lava")', () => {
  it('gives 100 for crossing every word with no mistakes', () => {
    expect(stageBonus('lava', { spelled: 5, total: 5, mistakes: 0 })).toBe(100);
  });

  it('gives 50 for crossing every word with mistakes', () => {
    expect(stageBonus('lava', { spelled: 5, total: 5, mistakes: 1 })).toBe(50);
    expect(stageBonus('lava', { spelled: 3, total: 3, mistakes: 7 })).toBe(50);
  });

  it('gives nothing when a word was left uncrossed', () => {
    expect(stageBonus('lava', { spelled: 4, total: 5, mistakes: 0 })).toBe(0);
    expect(stageBonus('lava', { spelled: 0, total: 5, mistakes: 3 })).toBe(0);
  });

  it('gives nothing for a game with no words', () => {
    expect(stageBonus('lava', { spelled: 0, total: 0, mistakes: 0 })).toBe(0);
  });
});

describe('stageBonus() with junk', () => {
  it.each([
    ['balloons', undefined],
    ['balloons', null],
    ['balloons', {}],
    ['balloons', 'x'],
    ['lava', undefined],
    ['lava', {}],
    ['lava', { spelled: 'a', total: 'a' }],
    ['shop', balloons(10)],
    [undefined, undefined],
  ])('stageBonus(%j, %j) is 0', (game, result) => {
    expect(() => stageBonus(game, result)).not.toThrow();
    expect(stageBonus(game, result)).toBe(0);
  });
});

// Shark Lake has the same rule as the lava level: every word spelled earns 50, with no mistakes 100.
describe('stageBonus("shark")', () => {
  it('gives 100 for every word with no mistakes, 50 with mistakes', () => {
    expect(stageBonus('shark', { spelled: 5, total: 5, mistakes: 0 })).toBe(100);
    expect(stageBonus('shark', { spelled: 5, total: 5, mistakes: 2 })).toBe(50);
  });

  it('gives nothing when caught before the last word, for no words, or for junk', () => {
    expect(stageBonus('shark', { spelled: 3, total: 5, mistakes: 0 })).toBe(0);
    expect(stageBonus('shark', { spelled: 0, total: 0, mistakes: 0 })).toBe(0);
    expect(stageBonus('shark', undefined)).toBe(0);
    expect(stageBonus('shark', {})).toBe(0);
  });

  it('matches the lava rule', () => {
    for (const r of [{ spelled: 2, total: 2, mistakes: 0 }, { spelled: 2, total: 2, mistakes: 1 }, { spelled: 1, total: 2, mistakes: 0 }]) {
      expect(stageBonus('shark', r)).toBe(stageBonus('lava', r));
    }
  });
});
