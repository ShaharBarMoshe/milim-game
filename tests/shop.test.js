import { describe, it, expect } from 'vitest';
import { GAMES, ITEMS, SHOP_KEY, Shop, item } from '../src/shop.js';
import { memoryStorage, throwingStorage } from './helpers.js';

const saved = (storage) => JSON.parse(storage.getItem(SHOP_KEY));

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

  it('sells the lava rope for 10 points, one game at a time', () => {
    expect(item('lava-rope')).toMatchObject({ game: 'lava', kind: 'single', cost: 10 });
  });

  it('has single-use items and permanent ones for both games', () => {
    for (const game of GAMES) {
      const kinds = new Set(ITEMS.filter((i) => i.game === game.id).map((i) => i.kind));
      expect(kinds.has('single')).toBe(true);
      expect(kinds.has('skin')).toBe(true);
    }
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
    shop.earn(35);
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
    shop.earn(25);
    expect(shop.buy('balloons-fire')).toEqual({ ok: true });
    expect(shop.points).toBe(10);
    expect(shop.has('balloons-fire')).toBe(true);
    expect(shop.use('balloons-fire')).toBe(false); // nothing to use up
    expect(new Shop(storage).has('balloons-fire')).toBe(true);
  });

  it('refuses what you cannot afford or already own, without spending', () => {
    const shop = new Shop(memoryStorage());
    shop.earn(17);
    expect(shop.buy('archer-gold')).toEqual({ ok: false, error: 'Need 8 more points' });
    expect(shop.buy('balloons-fire').ok).toBe(true);
    expect(shop.buy('balloons-fire')).toEqual({ ok: false, error: 'Already yours' });
    expect(shop.buy('nope')).toEqual({ ok: false, error: 'No such item' });
    expect(shop.points).toBe(2);
  });

  it('puts a bought skin on, one per slot, and swaps owned skins for free', () => {
    const storage = memoryStorage();
    const shop = new Shop(storage);
    shop.earn(100);
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
      shop.earn(50);
      expect(shop.buy('lava-rope').ok).toBe(true);
      expect(shop.use('lava-rope')).toBe(true);
    }
  });

  it('saves points, what is owned, what is worn and the stock', () => {
    const storage = memoryStorage();
    const shop = new Shop(storage);
    shop.earn(50);
    shop.buy('archer-night');
    shop.buy('lava-life');
    expect(saved(storage)).toEqual({ points: 15, owned: ['archer-night'], worn: { archer: 'archer-night' }, stock: { 'lava-life': 1 } });
  });
});
