import Phaser from 'phaser';
import { SAMPLE_PAIRS, loadWordList, parseWordList } from '../vocab.js';

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
    this.makeProceduralTextures();
    // ?level=lava jumps straight to the lava level with the saved word list (handy for practice).
    if (new URLSearchParams(window.location.search).get('level') === 'lava') {
      const saved = loadWordList();
      this.scene.start('lava', { pairs: saved ? parseWordList(saved).pairs : SAMPLE_PAIRS });
    } else {
      this.scene.start('game');
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
    g.destroy();
  }
}
