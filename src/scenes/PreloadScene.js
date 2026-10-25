import Phaser from 'phaser';
import { SAMPLE_PAIRS } from '../vocab.js';
import { DIRECTIONS } from '../quiz.js';
import { MIN_PAIRS, WordLibrary } from '../wordLists.js';
import { PLAYER_SPRITES } from '../players.js';
import { ITEMS } from '../shop.js';
import { FRAMES_PER_ROW, SWIM_ROWS } from '../sharkChase.js';

// Shark Lake's diver sheets: the teal original and one per wetsuit sold in the shop.
const DIVER_SHEETS = ['diver', ...ITEMS.filter((it) => it.slot === 'diver').map((it) => `diver_${it.suit}`)];

export const BALLOON_COLORS = {
  red: 0xe8343c,
  orange: 0xf08a24,
  yellow: 0xf2c230,
  green: 0x3ccf4a,
  blue: 0x3a8ee0,
  purple: 0x9a3ce0,
};

// Frame indices in hunter.png (5 columns x 4 rows, sliced by tools/slice_sprites.py).
// The hunter rides facing right; facing left is the same frames flipped.
export const ARCHER_FRAMES = {
  gallopLevel: [0, 1, 2, 3], // bow drawn level, horse mid-gallop
  release: 4,
  grabArrow: 14,
  nock: 15,
  // Bow drawn at increasing elevation, as [minimum elevation in degrees, frame].
  aimUp: [
    [26, 13],
    [20, 12],
    [14, 11],
    [8, 10],
  ],
};

// Frame indices in robot.png (lava level, see ROBOT_FRAMES in tools/slice_sprites.py). Faces right.
export const ROBOT_FRAMES = {
  ready: 0,
  takeoff: 1,
  air: 2,
  land: 3,
  settle: 4,
  fall: 5,
  front: 6,
  frontCrouch: 7,
  frontLand: 8,
};

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('preload');
  }

  preload() {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 200, height / 2, 0, 16, 0xffffff).setOrigin(0, 0.5);
    this.add.rectangle(width / 2, height / 2, 404, 20).setStrokeStyle(2, 0xffffff);
    this.load.on('progress', (p) => (bar.width = 400 * p));

    this.load.spritesheet('hunter', 'assets/hunter.png', { frameWidth: 208, frameHeight: 250 });
    this.load.image('arrow', 'assets/arrow.png');
    this.load.spritesheet('robot', 'assets/robot.png', { frameWidth: 247, frameHeight: 127 });
    this.load.image('lava_splash', 'assets/lava_splash.png');
    // The players from the shop, in the same frame layouts as hunter.png and robot.png.
    for (const [sprite, { archer, jumper }] of Object.entries(PLAYER_SPRITES)) {
      this.load.spritesheet(`${sprite}_archer`, `assets/${sprite}_archer.png`, { frameWidth: archer.w, frameHeight: archer.h });
      this.load.spritesheet(`${sprite}_jumper`, `assets/${sprite}_jumper.png`, { frameWidth: jumper.w, frameHeight: jumper.h });
    }
    // Shark Lake (tools/slice_divers.py): rows swim right, left, up, down.
    for (const key of DIVER_SHEETS) this.load.spritesheet(key, `assets/${key}.png`, { frameWidth: 160, frameHeight: 160 });
    this.load.spritesheet('shark', 'assets/shark.png', { frameWidth: 200, frameHeight: 200 });
    for (const color of Object.keys(BALLOON_COLORS)) {
      this.load.image(`balloon_${color}`, `assets/balloon_${color}.png`);
      this.load.spritesheet(`pop_${color}`, `assets/pop_${color}.png`, { frameWidth: 186, frameHeight: 236 });
    }
  }

  create() {
    for (const color of Object.keys(BALLOON_COLORS)) {
      this.anims.create({
        key: `pop_${color}`,
        frames: this.anims.generateFrameNumbers(`pop_${color}`, { start: 0, end: 3 }),
        frameRate: 16,
      });
    }
    // One looping swim animation per sheet and direction: '<sheet>-right', 'shark-up', ...
    for (const key of [...DIVER_SHEETS, 'shark']) {
      for (const [dir, row] of Object.entries(SWIM_ROWS)) {
        this.anims.create({
          key: `${key}-${dir}`,
          frames: this.anims.generateFrameNumbers(key, { start: row * FRAMES_PER_ROW, end: row * FRAMES_PER_ROW + FRAMES_PER_ROW - 1 }),
          frameRate: key === 'shark' ? 7 : 9,
          repeat: -1,
        });
      }
    }
    this.makeProceduralTextures();
    // ?level=lava (or ?level=shark) jumps straight to that game with the chosen word list (handy for practice).
    const level = new URLSearchParams(window.location.search).get('level');
    if (level === 'lava' || level === 'shark') {
      const list = WordLibrary.load().selected;
      const pairs = list.pairs.length >= MIN_PAIRS ? list.pairs : SAMPLE_PAIRS;
      this.registry.set('words', { pairs, direction: DIRECTIONS.MIXED, listId: list.id, listName: list.name });
      this.scene.start(level, { pairs });
    } else {
      this.scene.start('map');
    }
  }

  makeProceduralTextures() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    g.fillStyle(0xffffff, 1).fillRect(0, 0, 8, 8);
    g.generateTexture('spark', 8, 8);
    g.clear();

    // Fluffy cloud built from overlapping circles.
    g.fillStyle(0xffffff, 1);
    [[60, 50, 34], [100, 38, 42], [145, 52, 32], [80, 62, 28], [125, 64, 30]].forEach(([x, y, r]) =>
      g.fillCircle(x, y, r),
    );
    g.generateTexture('cloud', 190, 100);
    g.clear();

    // What the shop's players throw instead of arrows: a double-bladed axe (spun in flight) and magic orbs.
    g.fillStyle(0x6b4423).fillRect(25, 10, 6, 44);
    g.lineStyle(3, 0x3b2410);
    for (const side of [-1, 1]) {
      const blade = [[28, 8], [28 + side * 20, 2], [28 + side * 25, 16], [28 + side * 20, 30], [28, 24]].map(([x, y]) => new Phaser.Math.Vector2(x, y));
      g.fillStyle(0xe2c25a).fillPoints(blade, true).strokePoints(blade, true);
    }
    g.generateTexture('proj_axe', 56, 56);
    g.clear();
    for (const [key, glow, core] of [['proj_orb_purple', 0xb06cff, 0xf3e8ff], ['proj_orb_teal', 0x2dd4bf, 0xccfbf1]]) {
      g.fillStyle(glow, 0.22).fillCircle(26, 26, 25);
      g.fillStyle(glow, 0.45).fillCircle(26, 26, 18);
      g.fillStyle(glow, 0.9).fillCircle(26, 26, 12);
      g.fillStyle(core, 1).fillCircle(26, 26, 6);
      g.generateTexture(key, 52, 52);
      g.clear();
    }
    this.makeFlags(g);
    g.destroy();
  }

  // The language button's flags, drawn (emoji flags don't show on Windows) at twice their on-screen size.
  makeFlags(g) {
    const fw = 108;
    const fh = 72;
    // The US: 13 red and white stripes, and a blue canton with rows of stars (dots at this size).
    const stripe = fh / 13;
    for (let i = 0; i < 13; i++) g.fillStyle(i % 2 ? 0xffffff : 0xb22234).fillRect(0, i * stripe, fw, Math.ceil(stripe));
    const cw = fw * 0.42;
    const ch = stripe * 7;
    g.fillStyle(0x3c3b6e).fillRect(0, 0, cw, ch);
    g.fillStyle(0xffffff);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < (row % 2 ? 5 : 6); col++) {
        g.fillCircle((col + (row % 2 ? 1 : 0.5)) * (cw / 6), (row + 0.6) * (ch / 5.2), 1.8);
      }
    }
    g.lineStyle(2, 0x1f2937, 0.5).strokeRect(1, 1, fw - 2, fh - 2);
    g.generateTexture('flag_us', fw, fh);
    g.clear();
    // Israel: white, two blue stripes, and the Star of David (two outlined triangles) in the middle.
    const blue = 0x0038b8;
    g.fillStyle(0xffffff).fillRect(0, 0, fw, fh);
    g.fillStyle(blue).fillRect(0, fh * 0.1, fw, fh * 0.15).fillRect(0, fh * 0.75, fw, fh * 0.15);
    const r = fh * 0.2;
    const tri = (flip) =>
      [0, 1, 2].map((k) => {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3 + (flip ? Math.PI : 0);
        return new Phaser.Math.Vector2(fw / 2 + Math.cos(a) * r, fh / 2 + Math.sin(a) * r);
      });
    g.lineStyle(3.5, blue).strokePoints(tri(false), true).strokePoints(tri(true), true);
    g.lineStyle(2, 0x1f2937, 0.5).strokeRect(1, 1, fw - 2, fh - 2);
    g.generateTexture('flag_il', fw, fh);
    g.clear();
  }
}
