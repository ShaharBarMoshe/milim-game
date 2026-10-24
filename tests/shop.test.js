import { describe, it, expect } from 'vitest';
import { GAMES, ITEMS, SHOP_KEY, Shop, item } from '../src/shop.js';
import { memoryStorage, mulberry32, throwingStorage } from './helpers.js';
import { Quiz } from '../src/quiz.js';
import { spellingPoints, stageBonus } from '../src/score.js';
import { SAMPLE_PAIRS } from '../src/vocab.js';
import { pickSpellingPairs, spellingTarget } from '../src/spelling.js';
import { PLAYER_SPRITES, PROJECTILES } from '../src/players.js';

const saved = (storage) => JSON.parse(storage.getItem(SHOP_KEY));
const cost = (id) => item(id).cost;

describe('the catalogue', () => {
  it('has unique items, each for a game, with a price', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const it of ITEMS) {
      expect(GAMES.map((g) => g.id)).toContain(it.game);
      expect(['single', 'upgrade', 'skin']).toContain(it.kind);
      expect(it.cost).toBeGreaterThan(0);
      if (it.kind === 'skin') expect(it.slot).toBeTruthy();
    }
  });

  it('sells the lava rope for 100 points, one save at a time', () => {
    expect(item('lava-rope')).toMatchObject({ game: 'lava', kind: 'single', cost: 100 });
  });

  it('sells players (the girl, the boy and five Gemini characters), worn one at a time, for both games', () => {
    const players = ITEMS.filter((i) => i.game === 'players');
    expect(players.length).toBe(7);
    for (const p of players) {
      expect(p).toMatchObject({ kind: 'skin', slot: 'player' });
      const look = PLAYER_SPRITES[p.sprite];
      expect(look).toBeTruthy();
      expect(PROJECTILES[look.projectile]).toBeTruthy();
      expect(look.archer.hand.y).toBeGreaterThan(0);
      expect(look.jumper.waist).toBeGreaterThan(0);
    }
    const shop = new Shop(memoryStorage());
    shop.earn(cost('player-girl') + cost('player-frost-mage'));
    shop.buy('player-girl');
    shop.buy('player-frost-mage');
    expect(shop.skin('player').sprite).toBe('char_frost-mage');
    shop.toggleSkin('player-girl');
    expect(shop.skin('player').sprite).toBe('kid_girl');
  });

  it('has single-use items and permanent ones for every game', () => {
    expect(GAMES.map((g) => g.id)).toEqual(['balloons', 'lava', 'shark', 'players']);
    for (const game of GAMES.filter((g) => g.id !== 'players')) {
      const kinds = new Set(ITEMS.filter((i) => i.game === game.id).map((i) => i.kind));
      expect(kinds.has('single')).toBe(true);
      expect(kinds.has('skin')).toBe(true);
    }
  });
});

describe('Shark Lake items', () => {
  const suits = ITEMS.filter((i) => i.slot === 'diver');

  it('sells five diver suit colours, worn one at a time', () => {
    expect(suits.map((s) => s.id).sort()).toEqual(['diver-black', 'diver-orange', 'diver-pink', 'diver-purple', 'diver-red']);
    for (const s of suits) {
      expect(s).toMatchObject({ game: 'shark', kind: 'skin', icon: 'diver', suit: s.id.slice('diver-'.length) });
      expect(s.cost).toBeGreaterThan(0);
    }
    const shop = new Shop(memoryStorage());
    shop.earn(1000);
    expect(shop.buy('diver-red')).toEqual({ ok: true });
    expect(shop.skin('diver').suit).toBe('red');
    shop.buy('diver-black');
    expect(shop.skin('diver').suit).toBe('black');
    expect(shop.has('diver-red')).toBe(false);
    shop.toggleSkin('diver-red');
    expect(shop.skin('diver').id).toBe('diver-red');
    // A suit doesn't change the other games' skins.
    expect(shop.skin('player')).toBeNull();
    expect(shop.skin('robot')).toBeNull();
  });

  it('sells a shark repellent that each game uses up', () => {
    expect(item('shark-repel')).toMatchObject({ game: 'shark', kind: 'single', cost: 100, icon: 'repel', lasts: 'one game' });
    const shop = new Shop(memoryStorage());
    shop.earn(200);
    shop.buy('shark-repel');
    shop.buy('shark-repel');
    expect(shop.count('shark-repel')).toBe(2);
    expect(shop.use('shark-repel')).toBe(true);
    expect(shop.use('shark-repel')).toBe(true);
    expect(shop.use('shark-repel')).toBe(false);
  });

  it('keeps a worn suit across page loads', () => {
    const storage = memoryStorage();
    const shop = new Shop(storage);
    shop.earn(500);
    shop.buy('diver-pink');
    expect(new Shop(storage).skin('diver').id).toBe('diver-pink');
  });
});

describe('Shop', () => {
  it('starts with no points and nothing owned (no rope by default)', () => {
    const shop = new Shop(memoryStorage());
    expect(shop.points).toBe(0);
    expect(shop.count('lava-rope')).toBe(0);
    expect(shop.use('lava-rope')).toBe(false);
    expect(shop.skin('robot')).toBeNull();
  });

  it('collects scores from every game in one wallet, and saves it', () => {
    const storage = memoryStorage();
    const shop = new Shop(storage);
    expect(shop.earn(120)).toBe(120);
    shop.earn(35.7);
    shop.earn(-5);
    shop.earn('x');
    expect(shop.points).toBe(155);
    expect(new Shop(storage).points).toBe(155);
  });

  it('single-use items can be bought again and again, and each game uses one', () => {
    const storage = memoryStorage();
    const shop = new Shop(storage);
    shop.earn(3 * cost('lava-rope') + 5);
    expect(shop.buy('lava-rope')).toEqual({ ok: true });
    expect(shop.buy('lava-rope')).toEqual({ ok: true });
    expect(shop.buy('lava-rope')).toEqual({ ok: true });
    expect(shop.points).toBe(5);
    expect(shop.count('lava-rope')).toBe(3);
    expect(shop.has('lava-rope')).toBe(false); // not a permanent upgrade
    // Three games use them up, saved after each.
    expect(shop.use('lava-rope')).toBe(true);
    expect(new Shop(storage).count('lava-rope')).toBe(2);
    expect(shop.use('lava-rope')).toBe(true);
    expect(shop.use('lava-rope')).toBe(true);
    expect(shop.use('lava-rope')).toBe(false);
    expect(shop.count('lava-rope')).toBe(0);
    expect(new Shop(storage).count('lava-rope')).toBe(0);
  });

  it('permanent upgrades are bought once and keep working', () => {
    const storage = memoryStorage();
    const shop = new Shop(storage);
    shop.earn(cost('balloons-fire') + 10);
    expect(shop.buy('balloons-fire')).toEqual({ ok: true });
    expect(shop.points).toBe(10);
    expect(shop.has('balloons-fire')).toBe(true);
    expect(shop.use('balloons-fire')).toBe(false); // nothing to use up
    expect(new Shop(storage).has('balloons-fire')).toBe(true);
  });

  it('refuses what you cannot afford or already own, without spending', () => {
    const shop = new Shop(memoryStorage());
    shop.earn(cost('balloons-fire') + 2);
    expect(shop.buy('archer-gold')).toEqual({ ok: false, error: `Need ${cost('archer-gold') - cost('balloons-fire') - 2} more points` });
    expect(shop.buy('balloons-fire').ok).toBe(true);
    expect(shop.buy('balloons-fire')).toEqual({ ok: false, error: 'Already yours' });
    expect(shop.buy('nope')).toEqual({ ok: false, error: 'No such item' });
    expect(shop.points).toBe(2);
  });

  it('puts a bought skin on, one per slot, and swaps owned skins for free', () => {
    const storage = memoryStorage();
    const shop = new Shop(storage);
    shop.earn(cost('robot-gold') + cost('robot-ice') + 55);
    shop.buy('robot-gold');
    expect(shop.skin('robot').id).toBe('robot-gold');
    shop.buy('robot-ice');
    expect(shop.skin('robot').id).toBe('robot-ice');
    expect(shop.has('robot-gold')).toBe(false);
    expect(shop.toggleSkin('robot-gold')).toBe(true);
    expect(shop.skin('robot').id).toBe('robot-gold');
    shop.toggleSkin('robot-gold'); // take it off
    expect(shop.skin('robot')).toBeNull();
    expect(shop.points).toBe(55);
    expect(shop.toggleSkin('archer-gold')).toBe(false); // not owned
    expect(new Shop(storage).skin('robot')).toBeNull();
  });

  it.each(['not json', '[1]', '{"points": -5, "owned": "x"}', '{"points": 2.5}'])('reads broken data %j as an empty wallet', (raw) => {
    const shop = new Shop(memoryStorage({ [SHOP_KEY]: raw }));
    expect(shop.points).toBe(0);
    expect([...shop.owned]).toEqual([]);
  });

  it('drops unknown items and skins worn in the wrong slot or not owned', () => {
    const raw = JSON.stringify({
      points: 7,
      owned: ['balloons-fire', 'ghost', 'robot-ice', 'lava-rope'],
      worn: { robot: 'robot-ice', archer: 'robot-ice', x: 'archer-gold' },
      stock: { 'lava-rope': 2, 'lava-life': 0, 'balloons-fire': 3, ghost: 1, 'balloons-time': 1.5 },
    });
    const shop = new Shop(memoryStorage({ [SHOP_KEY]: raw }));
    expect([...shop.owned]).toEqual(['balloons-fire', 'robot-ice']);
    expect(shop.worn).toEqual({ robot: 'robot-ice' });
    expect(shop.stock).toEqual({ 'lava-rope': 2 });
  });

  it('never throws when storage is blocked or missing', () => {
    for (const storage of [throwingStorage(), undefined, null]) {
      const shop = new Shop(storage);
      shop.earn(cost('lava-rope'));
      expect(shop.buy('lava-rope').ok).toBe(true);
      expect(shop.use('lava-rope')).toBe(true);
    }
  });

  it('saves points, what is owned, what is worn and the stock', () => {
    const storage = memoryStorage();
    const shop = new Shop(storage);
    shop.earn(cost('archer-night') + cost('lava-life') + 15);
    shop.buy('archer-night');
    shop.buy('lava-life');
    expect(saved(storage)).toEqual({ points: 15, owned: ['archer-night'], worn: { archer: 'archer-night' }, stock: { 'lava-life': 1 } });
  });
});

describe('Tally (one game on top of the wallet)', () => {
  it('starts from the saved total, not from 0, and saves every point as it is won', () => {
    const storage = memoryStorage({ [SHOP_KEY]: JSON.stringify({ points: 300 }) });
    const tally = new Shop(storage).startGame();
    expect(tally.total).toBe(300);
    expect(tally.score).toBe(0);
    expect(tally.add(14)).toBe(14);
    expect(tally.add(12)).toBe(26);
    expect(tally.total).toBe(326);
    // Saved straight away: leaving the game now keeps them.
    expect(new Shop(storage).points).toBe(326);
  });

  it('takes back only points won in this game', () => {
    const storage = memoryStorage({ [SHOP_KEY]: JSON.stringify({ points: 300 }) });
    const tally = new Shop(storage).startGame();
    expect(tally.add(-5)).toBe(0);
    expect(tally.total).toBe(300);
    tally.add(10);
    expect(tally.add(-5)).toBe(5);
    expect(tally.add(-5)).toBe(0);
    expect(tally.add(-5)).toBe(0);
    expect(new Shop(storage).points).toBe(300);
  });

  it('carries on from game to game', () => {
    const storage = memoryStorage();
    const first = new Shop(storage).startGame();
    first.add(120);
    const second = new Shop(storage).startGame();
    expect(second.total).toBe(120);
    second.add(80);
    expect(new Shop(storage).points).toBe(200);
  });

  it('keeps the stock the game used up', () => {
    const storage = memoryStorage({ [SHOP_KEY]: JSON.stringify({ points: 10, stock: { 'lava-life': 2 } }) });
    const shop = new Shop(storage);
    const tally = shop.startGame();
    shop.use('lava-life');
    tally.add(40);
    expect(saved(storage)).toMatchObject({ points: 50, stock: { 'lava-life': 1 } });
  });

  it('ignores junk and never throws when storage is blocked', () => {
    const tally = new Shop(throwingStorage()).startGame();
    expect(tally.add('x')).toBe(0);
    expect(tally.add(7.6)).toBe(8);
    expect(tally.total).toBe(8);
  });
});

// What an ordinary game earns, played with the real scoring on the ready-made words: a balloon round of
// 12 right answers and 3 wrong ones, and a lava game crossing all 5 words with mistakes in 2 of them,
// each with its stage bonus.
function typicalGame() {
  const quiz = new Quiz(SAMPLE_PAIRS, { direction: 'mixed', random: mulberry32(7) });
  let balloons = 0;
  for (let i = 0; i < 15; i++) {
    const q = quiz.next();
    if (i % 5 === 2) balloons = Math.max(0, balloons + quiz.answer(q.options.find((o) => o !== q.answer)).points);
    balloons += quiz.answer(q.answer).points;
  }
  balloons += stageBonus('balloons', quiz.stats());
  const words = pickSpellingPairs(SAMPLE_PAIRS, 5, mulberry32(7)).map((p) => spellingTarget(p).word);
  const lava =
    words.reduce((sum, word, i) => sum + spellingPoints(word, { mistakes: i < 2 ? 1 : 0 }), 0) +
    stageBonus('lava', { spelled: words.length, total: words.length, mistakes: 2 });
  return { balloons, lava, average: (balloons + lava) / 2 };
}

describe('prices against what a game earns', () => {
  const game = typicalGame();

  it('a typical game earns 150-350 points in either game, stage bonus included', () => {
    expect(game.balloons).toBeGreaterThanOrEqual(150);
    expect(game.balloons).toBeLessThanOrEqual(350);
    expect(game.lava).toBeGreaterThanOrEqual(150);
    expect(game.lava).toBeLessThanOrEqual(350);
  });

  it('single-use items cost a third of a game to one game', () => {
    for (const it of ITEMS.filter((i) => i.kind === 'single')) {
      expect(it.cost, it.id).toBeGreaterThanOrEqual(game.average / 3);
      expect(it.cost, it.id).toBeLessThanOrEqual(game.average);
    }
  });

  it('upgrades and skins cost one to six games', () => {
    for (const it of ITEMS.filter((i) => i.kind !== 'single')) {
      expect(it.cost, it.id).toBeGreaterThanOrEqual(game.average);
      expect(it.cost, it.id).toBeLessThanOrEqual(game.average * 6);
    }
  });

  it('buying everything once takes 20-60 games', () => {
    const all = ITEMS.reduce((sum, it) => sum + it.cost, 0);
    expect(all / game.average).toBeGreaterThanOrEqual(20);
    expect(all / game.average).toBeLessThanOrEqual(60);
  });

  it('a fancier item never costs less than a plainer one in its row', () => {
    expect(item('player-girl').cost).toBeLessThan(item('player-axe-boy').cost);
    expect(item('player-axe-boy').cost).toBeLessThan(item('player-frost-mage').cost);
    expect(item('archer-night').cost).toBeLessThanOrEqual(item('archer-gold').cost);
  });
});
