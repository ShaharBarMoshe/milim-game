// The shop: points earned in any game go into one wallet, and buy upgrades and skins for the games.
// No Phaser or DOM here, so it runs (and is tested) in Node. Saved in the browser; never throws.

export const SHOP_KEY = 'balloon-archer-shop';

// `short` labels the item's badge in the game's HUD. `kind`: 'single' is used up and can be bought again
// (`lasts` says when: a round or game takes one from the stock at its start, a rope when it saves you);
// 'upgrade' is bought once and works for good; 'skin' is bought once and worn one per `slot`, swapped for
// free. `icon` names how the shop screen draws it.
// Prices are set against a typical game, which earns about 250 points with its stage bonus: a single-use item costs half
// a game or so, a skin a few games, the best players about five (tests/shop.test.js checks the balance).
export const ITEMS = [
  { id: 'balloons-time', game: 'balloons', kind: 'single', name: 'More time', short: '+15 s', about: '+15 seconds for one round', cost: 150, icon: 'clock', lasts: 'one round' },
  { id: 'balloons-slow', game: 'balloons', kind: 'single', name: 'Slow balloons', short: 'Slow', about: 'Balloons rise a quarter slower for one round', cost: 100, icon: 'balloon', lasts: 'one round' },
  { id: 'balloons-fire', game: 'balloons', kind: 'upgrade', name: 'Fire arrows', short: 'Fire', about: 'Blazing orange arrows, for good', cost: 300, icon: 'arrow' },
  { id: 'archer-gold', game: 'balloons', kind: 'skin', slot: 'archer', name: 'Golden archer', short: 'Gold', about: 'A rider dipped in gold', cost: 400, icon: 'hunter', tint: 0xffd166 },
  { id: 'archer-night', game: 'balloons', kind: 'skin', slot: 'archer', name: 'Night rider', short: 'Night', about: 'Dark as a moonless night', cost: 300, icon: 'hunter', tint: 0x7b8cde },
  { id: 'lava-rope', game: 'lava', kind: 'single', name: 'Safety rope', short: 'Rope', about: 'Catches you once: keep your life on a wrong letter', cost: 100, icon: 'rope', lasts: 'one save' },
  { id: 'lava-life', game: 'lava', kind: 'single', name: 'Extra life', short: '+1 life', about: '4 lives instead of 3 for one game', cost: 150, icon: 'heart', lasts: 'one game' },
  { id: 'robot-gold', game: 'lava', kind: 'skin', slot: 'robot', name: 'Gold robot', short: 'Gold', about: 'Shiny and fireproof-looking', cost: 400, icon: 'robot', tint: 0xffc94d },
  { id: 'robot-ice', game: 'lava', kind: 'skin', slot: 'robot', name: 'Ice robot', short: 'Ice', about: 'Cool under pressure', cost: 300, icon: 'robot', tint: 0x8fd3ff },
  // Shark Lake: wetsuits recolour the diver (the sheet is `diver_<suit>`, from tools/slice_divers.py).
  { id: 'shark-repel', game: 'shark', kind: 'single', name: 'Shark repellent', short: 'Repel', about: 'The shark starts the game stunned for 5 seconds', cost: 100, icon: 'repel', lasts: 'one game' },
  { id: 'diver-red', game: 'shark', kind: 'skin', slot: 'diver', name: 'Red wetsuit', short: 'Red', about: 'A bright red wetsuit', cost: 300, icon: 'diver', suit: 'red' },
  { id: 'diver-orange', game: 'shark', kind: 'skin', slot: 'diver', name: 'Orange wetsuit', short: 'Orange', about: 'Rescue-team orange', cost: 300, icon: 'diver', suit: 'orange' },
  { id: 'diver-purple', game: 'shark', kind: 'skin', slot: 'diver', name: 'Purple wetsuit', short: 'Purple', about: 'Deep-sea purple', cost: 300, icon: 'diver', suit: 'purple' },
  { id: 'diver-pink', game: 'shark', kind: 'skin', slot: 'diver', name: 'Pink wetsuit', short: 'Pink', about: 'Coral-reef pink', cost: 300, icon: 'diver', suit: 'pink' },
  { id: 'diver-black', game: 'shark', kind: 'skin', slot: 'diver', name: 'Black wetsuit', short: 'Black', about: 'Stealthy night-dive black', cost: 300, icon: 'diver', suit: 'black' },
  // Players replace the horse archer and the robot in both games.
  // `sprite` names the player's sheets (src/players.js).
  { id: 'player-girl', game: 'players', kind: 'skin', slot: 'player', name: 'Girl', short: 'Girl', about: 'Runs and shoots arrows', cost: 600, icon: 'player', sprite: 'kid_girl' },
  { id: 'player-boy', game: 'players', kind: 'skin', slot: 'player', name: 'Boy', short: 'Boy', about: 'Runs and shoots arrows', cost: 600, icon: 'player', sprite: 'kid_boy' },
  { id: 'player-axe-boy', game: 'players', kind: 'skin', slot: 'player', name: 'Axe warrior', short: 'Warrior', about: 'Throws a spinning axe', cost: 800, icon: 'player', sprite: 'char_axe-boy' },
  { id: 'player-axe-scout', game: 'players', kind: 'skin', slot: 'player', name: 'Axe scout', short: 'Scout', about: 'Throws a spinning axe', cost: 800, icon: 'player', sprite: 'char_axe-scout' },
  { id: 'player-axe-girl', game: 'players', kind: 'skin', slot: 'player', name: 'Axe girl', short: 'Axe girl', about: 'Throws a spinning axe', cost: 800, icon: 'player', sprite: 'char_axe-girl' },
  { id: 'player-shadow-mage', game: 'players', kind: 'skin', slot: 'player', name: 'Shadow mage', short: 'Shadow', about: 'Casts purple magic orbs', cost: 1000, icon: 'player', sprite: 'char_shadow-mage' },
  { id: 'player-frost-mage', game: 'players', kind: 'skin', slot: 'player', name: 'Frost mage', short: 'Frost', about: 'Casts glowing frost orbs', cost: 1000, icon: 'player', sprite: 'char_frost-mage' },
];

export const GAMES = [
  { id: 'balloons', name: 'Balloon Meadow' },
  { id: 'lava', name: 'Lava Crossing' },
  { id: 'shark', name: 'Shark Lake' },
  { id: 'players', name: 'Players' },
];

export const item = (id) => ITEMS.find((i) => i.id === id) ?? null;

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export class Shop {
  constructor(storage = defaultStorage()) {
    this.storage = storage;
    let data = null;
    try {
      data = JSON.parse(storage?.getItem(SHOP_KEY) ?? 'null');
    } catch {
      data = null;
    }
    this.points = Number.isInteger(data?.points) && data.points > 0 ? data.points : 0;
    this.owned = new Set((Array.isArray(data?.owned) ? data.owned : []).filter((id) => item(id) && item(id).kind !== 'single'));
    // single-use item id -> how many are left
    this.stock = {};
    for (const [id, count] of Object.entries(data?.stock && typeof data.stock === 'object' ? data.stock : {})) {
      if (item(id)?.kind === 'single' && Number.isInteger(count) && count > 0) this.stock[id] = count;
    }
    // slot -> skin id, only for skins that are owned and fit the slot
    this.worn = {};
    for (const [slot, id] of Object.entries(data?.worn && typeof data.worn === 'object' ? data.worn : {})) {
      if (this.owned.has(id) && item(id).slot === slot) this.worn[slot] = id;
    }
  }

  save() {
    try {
      this.storage?.setItem(SHOP_KEY, JSON.stringify({ points: this.points, owned: [...this.owned], worn: this.worn, stock: this.stock }));
    } catch {
      // storage unavailable (private mode) — progress lasts until the page closes
    }
  }

  // A game's points, saved into the wallet as they're won (see Tally).
  startGame() {
    return new Tally(this);
  }

  // Points added straight to the wallet.
  earn(score) {
    const points = Math.max(0, Math.floor(Number(score) || 0));
    this.points += points;
    if (points) this.save();
    return points;
  }

  owns(id) {
    return this.owned.has(id);
  }

  // How many of a single-use item are left.
  count(id) {
    return this.stock[id] ?? 0;
  }

  // A new game takes one single-use item from the stock: true if there was one to use.
  use(id) {
    if (!this.count(id)) return false;
    this.stock[id]--;
    if (!this.stock[id]) delete this.stock[id];
    this.save();
    return true;
  }

  // A permanent upgrade the player owns, or a skin they're wearing.
  has(id) {
    const it = item(id);
    if (!it || !this.owned.has(id)) return false;
    return it.kind === 'skin' ? this.worn[it.slot] === id : true;
  }

  // The skin worn in `slot`, or null.
  skin(slot) {
    return item(this.worn[slot]) ?? null;
  }

  // Why `id` can't be bought right now, or null when it can.
  cantBuy(id) {
    const it = item(id);
    if (!it) return 'No such item';
    if (it.kind !== 'single' && this.owned.has(id)) return 'Already yours';
    if (this.points < it.cost) return `Need ${it.cost - this.points} more points`;
    return null;
  }

  // Spend the points: one more of a single-use item, or own an upgrade or skin (a skin is put on
  // straight away). Returns { ok, error }.
  buy(id) {
    const error = this.cantBuy(id);
    if (error) return { ok: false, error };
    const it = item(id);
    this.points -= it.cost;
    if (it.kind === 'single') this.stock[id] = this.count(id) + 1;
    else this.owned.add(id);
    if (it.kind === 'skin') this.worn[it.slot] = id;
    this.save();
    return { ok: true };
  }

  // Put an owned skin on, or take it off when it's already worn.
  toggleSkin(id) {
    const it = item(id);
    if (it?.kind !== 'skin' || !this.owned.has(id)) return false;
    if (this.worn[it.slot] === id) delete this.worn[it.slot];
    else this.worn[it.slot] = id;
    this.save();
    return true;
  }
}

// One game's score on top of the wallet it started from. Every change is saved at once, so the total on
// screen is the one in the shop, and a game left early keeps what it won. Wrong answers take back points
// won in this game, never ones from before it.
export class Tally {
  constructor(shop) {
    this.shop = shop;
    this.start = shop.points;
    this.score = 0;
  }

  get total() {
    return this.start + this.score;
  }

  // Add (or, when negative, take back) points; returns the game's score.
  add(points) {
    const score = Math.max(0, this.score + Math.round(Number(points) || 0));
    if (score === this.score) return score;
    this.score = score;
    this.shop.points = this.total;
    this.shop.save();
    return score;
  }
}
