// The adventure map: an old parchment map with a place for each game. It opens after a word list is
// chosen; hovering a place marks it and tells what it is, clicking it starts that game.
import Phaser from 'phaser';
import { ROBOT_FRAMES } from './PreloadScene.js';
import { showWordListForm, hideWordListForm } from '../ui/wordListForm.js';
import { DIRECTIONS } from '../quiz.js';
import { SAMPLE_PAIRS } from '../vocab.js';
import { spellingTarget } from '../spelling.js';
import { Shop } from '../shop.js';
import { FRAMES_PER_ROW, SWIM_ROWS } from '../sharkChase.js';
import { FONT, H, INK, W, drawParchment, drawShopSign } from './parchment.js';
import { isRtl, language, t, textStyle } from '../i18n.js';
import { addLangButton } from './lang.js';



const CAMP = { x: 640, y: 560 };
// Each place's name and description are in the locales, under places.<key>.name / .about.
const SPOTS = {
  balloons: {
    x: 330,
    y: 300,
    color: 0xe63946,
  },
  lava: {
    x: 975,
    y: 420,
    color: 0xf97316,
  },
  shark: {
    x: 290,
    y: 585,
    color: 0x0284c7,
  },
  shop: {
    x: 655,
    y: 385,
    color: 0xb45309,
  },
};

// The words to play, chosen on the word list screen (kept in the game registry between scenes).
export function currentWords(registry) {
  return registry.get('words') ?? { pairs: SAMPLE_PAIRS, direction: DIRECTIONS.MIXED, listId: null, listName: 'Everyday words' };
}

export default class MapScene extends Phaser.Scene {
  constructor() {
    super('map');
  }

  create(data) {
    this.state = 'setup';
    this.language = language(); // the texts are drawn in it; a switch on the word-list form redraws the map
    this.hovered = null;
    this.spots = {};
    this.events.once('shutdown', hideWordListForm);

    drawParchment(this);
    this.drawLake(250, 590);
    this.drawMountains();
    this.drawForest();
    this.drawMeadow(SPOTS.balloons);
    this.drawLavaFields(SPOTS.lava);
    this.drawPath(CAMP, SPOTS.balloons, -120);
    this.drawPath(CAMP, SPOTS.lava, 90);
    this.drawPath(CAMP, SPOTS.shop, 30);
    this.drawPath(CAMP, SPOTS.shark, 40);
    this.drawCamp();
    this.drawCompass(1170, 620);
    this.animated = this.add.graphics().setDepth(4);
    this.createHeader();
    Object.keys(SPOTS).forEach((key) => this.createSpot(key));
    this.createTooltip();
    // Esc on the map opens the word lists.
    this.input.keyboard.on('keydown-ESC', () => this.state === 'map' && this.openWordLists());

    if (data?.setup || !this.registry.has('words')) this.openWordLists();
    else this.showMap();
  }

  // ---------------------------------------------------------------- word lists

  openWordLists() {
    this.state = 'setup';
    this.setSpotsVisible(false);
    showWordListForm({
      initialDirection: currentWords(this.registry).direction,
      onStart: (pairs, direction, list) => {
        this.registry.set('words', { pairs, direction, listId: list.id, listName: list.name });
        this.showMap();
      },
    });
  }

  showMap() {
    hideWordListForm();
    if (this.language !== language()) {
      this.scene.restart();
      return;
    }
    this.state = 'map';
    const { pairs, listName } = currentWords(this.registry);
    this.listText.setText(t('map.words', { name: listName }));
    this.pointsText.setText(`🪙 ${t('common.points', { points: new Shop().points })}`);
    // The spelling games are always open, unless the list has no single word to spell (only phrases,
    // or words over 12 letters).
    const canSpell = pairs.some((p) => spellingTarget(p));
    for (const spot of [this.spots.lava, this.spots.shark]) {
      spot.locked = canSpell ? null : t('map.locked');
      spot.lock.setVisible(Boolean(spot.locked));
      spot.icon.setAlpha(spot.locked ? 0.45 : 1);
    }
    this.setSpotsVisible(true);
  }

  setSpotsVisible(visible) {
    Object.values(this.spots).forEach((s) => s.container.setVisible(visible));
    this.header.setVisible(visible);
    if (!visible) this.hover(null);
  }

  play(key) {
    if (this.state !== 'map') return;
    const spot = this.spots[key];
    if (spot.locked) {
      // Shake the lock so it's clear why nothing happens.
      this.tweens.add({ targets: spot.container, x: spot.x + 8, duration: 50, yoyo: true, repeat: 3, onComplete: () => spot.container.setX(spot.x) });
      return;
    }
    this.state = 'leaving';
    const { pairs } = currentWords(this.registry);
    this.cameras.main.fadeOut(250);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (key === 'lava' || key === 'shark') this.scene.start(key, { pairs });
      else if (key === 'shop') this.scene.start('shop');
      else this.scene.start('game');
    });
  }

  // ---------------------------------------------------------------- places

  createSpot(key) {
    const def = SPOTS[key];
    const c = this.add.container(def.x, def.y).setDepth(10);
    const glow = this.add.circle(0, 0, 58, 0xffd166, 0.35).setVisible(false);
    const ring = this.add.circle(0, 0, 44, 0x0f172a, 0.8).setStrokeStyle(5, def.color);
    const disk = this.add.circle(0, 0, 34, 0xfff4d6).setStrokeStyle(2, INK);
    const icon =
      key === 'balloons'
        ? this.add.image(0, 2, 'balloon_red').setScale(0.36)
        : key === 'shark'
          ? this.add.sprite(0, 2, 'shark', SWIM_ROWS.right * FRAMES_PER_ROW + 2).setScale(0.34)
          : key === 'shop'
          ? this.add.container(0, 0, drawShopSign(this))
          : this.add.sprite(0, 14, 'robot', ROBOT_FRAMES.front).setScale(0.42).setOrigin(0.5, 1).setY(24);
    const lock = this.add.text(26, -30, '🔒', { fontSize: '26px' }).setOrigin(0.5).setVisible(false);
    const label = this.add.text(0, 66, t(`places.${key}.name`), {
      fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#3b1f08', stroke: '#f5e6c0', strokeThickness: 5,
    }).setOrigin(0.5);
    c.add([glow, ring, disk, icon, lock, label]);
    // The whole marker and its label are one target: 150×200 centred on the marker, down to the label.
    // (A container's hit area is measured from its top-left corner, so no offset hitArea here.)
    c.setSize(150, 200).setInteractive({ useHandCursor: true });
    c.on('pointerover', () => this.hover(key));
    c.on('pointerout', () => this.hovered === key && this.hover(null));
    c.on('pointerup', () => this.play(key));
    // Gentle pulse while not hovered, like a marker calling for attention.
    const pulse = this.tweens.add({ targets: ring, scale: 1.08, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.spots[key] = { key, x: def.x, y: def.y, container: c, glow, ring, icon, lock, label, pulse, locked: null };
  }

  hover(key) {
    if (this.hovered && this.hovered !== key) {
      const old = this.spots[this.hovered];
      old.glow.setVisible(false);
      old.label.setColor('#3b1f08');
      this.tweens.add({ targets: old.container, scale: 1, duration: 120 });
    }
    this.hovered = this.state === 'map' ? key : null;
    if (!this.hovered) {
      this.tooltip.setVisible(false);
      return;
    }
    const spot = this.spots[key];
    spot.glow.setVisible(true);
    spot.label.setColor('#9a3412');
    this.tweens.add({ targets: spot.container, scale: 1.18, duration: 140, ease: 'Back.easeOut' });

    this.tipTitle.setText(t(`places.${key}.name`));
    this.tipText.setText(spot.locked ?? `${t(`places.${key}.about`)}\n\n${t(key === 'shop' ? 'map.clickShop' : 'map.clickPlay')}`);
    this.tipText.setColor(spot.locked ? '#fca5a5' : '#e2e8f0');
    const height = this.tipText.y + this.tipText.height + 16;
    this.tipBox.setSize(330, height);
    // Beside the marker, on whichever side has room.
    const right = spot.x < W / 2;
    this.tooltip.setPosition(right ? spot.x + 100 : spot.x - 430, Phaser.Math.Clamp(spot.y - 70, 110, H - height - 20));
    this.tooltip.setVisible(true);
  }

  createTooltip() {
    this.tipBox = this.add.rectangle(0, 0, 330, 140, 0x0f172a, 0.92).setOrigin(0).setStrokeStyle(2, 0xb45309);
    // Hebrew text sits against the box's right edge.
    const [x, originX] = isRtl() ? [330 - 16, 1] : [16, 0];
    this.tipTitle = this.add.text(x, 12, '', textStyle({ fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#fcd34d' })).setOrigin(originX, 0);
    this.tipText = this.add.text(x, 46, '', textStyle({ fontFamily: FONT, fontSize: '17px', color: '#e2e8f0', lineSpacing: 4, align: isRtl() ? 'right' : 'left' })).setOrigin(originX, 0);
    this.tooltip = this.add.container(0, 0, [this.tipBox, this.tipTitle, this.tipText]).setDepth(20).setVisible(false);
  }

  createHeader() {
    const title = this.add.text(W / 2, 46, t('map.title'), textStyle({
      fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#3b1f08', stroke: '#f5e6c0', strokeThickness: 6,
    })).setOrigin(0.5);
    const hint = this.add.text(W / 2, 88, t('map.hint'), textStyle({
      fontFamily: FONT, fontSize: '19px', fontStyle: 'italic', color: '#5b3510',
    })).setOrigin(0.5);
    this.listText = this.add.text(40, 36, '', textStyle({
      fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#fef3c7', backgroundColor: '#5b3510cc', padding: { x: 12, y: 7 },
    })).setOrigin(0, 0); // (right-to-left text defaults to a right-hand origin)
    // The points every game pays into, to spend at the Trading Post.
    this.pointsText = this.add.text(40, 80, '', textStyle({
      fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#3b1f08', backgroundColor: '#fcd34dcc', padding: { x: 12, y: 7 },
    })).setOrigin(0, 0);
    const change = this.add.text(W - 40, 36, `✎ ${t('map.changeWords')}`, textStyle({
      fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#fef3c7', backgroundColor: '#1e3a5fdd', padding: { x: 12, y: 7 },
    })).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    change.on('pointerover', () => change.setBackgroundColor('#2c5a8fee'));
    change.on('pointerout', () => change.setBackgroundColor('#1e3a5fdd'));
    change.on('pointerup', () => this.state === 'map' && this.openWordLists());
    this.changeButton = change;
    // The language flag, to the left of "Change words" (only while the map shows, like the rest of the header).
    this.langButton = addLangButton(this, change.x - change.width - 46, 36 + change.height / 2, { canToggle: () => this.state === 'map' });
    this.header = this.add.container(0, 0, [title, hint, this.listText, this.pointsText, change, this.langButton]).setDepth(15);
  }

  // ---------------------------------------------------------------- drawing

  drawLake(x, y) {
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x0369a1).fillEllipse(x, y, 330, 170);
    g.fillStyle(0x0284c7).fillEllipse(x, y - 6, 290, 140);
    g.fillStyle(0x38bdf8, 0.7).fillEllipse(x - 20, y - 14, 180, 70);
    g.lineStyle(4, 0x075985).strokeEllipse(x, y, 330, 170);
    this.lake = { x, y };
    this.add.text(x - 75, y - 52, t('places.shark.name'), { fontFamily: FONT, fontSize: '18px', fontStyle: 'italic', color: '#e0f2fe' }).setOrigin(0.5).setDepth(5);
  }

  drawMountains() {
    const g = this.add.graphics().setDepth(1);
    [[560, 210, 60], [650, 180, 80], [750, 200, 70], [840, 170, 85], [930, 215, 55]].forEach(([x, y, s]) => {
      g.fillStyle(0x78350f).fillTriangle(x - s, y + s * 0.7, x, y - s, x + s, y + s * 0.7);
      g.fillStyle(0x92400e).fillTriangle(x, y - s, x + s, y + s * 0.7, x + s * 0.2, y + s * 0.7);
      g.lineStyle(3, 0x451a03).strokeTriangle(x - s, y + s * 0.7, x, y - s, x + s, y + s * 0.7);
      g.fillStyle(0xf8fafc).fillTriangle(x, y - s, x - s * 0.3, y - s * 0.3, x + s * 0.3, y - s * 0.3);
    });
  }

  drawTree(g, x, y) {
    g.fillStyle(0x000000, 0.2).fillEllipse(x, y + 14, 30, 12);
    g.fillStyle(0x5b3a1a).fillRect(x - 3, y, 6, 14);
    g.fillStyle(0x15803d).fillCircle(x, y - 8, 20);
    g.lineStyle(2, 0x064e3b).strokeCircle(x, y - 8, 20);
    g.fillStyle(0x22c55e).fillCircle(x - 5, y - 13, 10);
  }

  drawForest() {
    const g = this.add.graphics().setDepth(2);
    [[470, 610], [520, 650], [560, 600], [420, 660], [600, 660], [740, 640], [790, 600], [820, 660],
      [130, 220], [170, 270], [110, 330], [540, 380], [500, 440]].forEach(([x, y]) => this.drawTree(g, x, y));
  }

  drawMeadow(spot) {
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x9cc46b, 0.85).fillEllipse(spot.x, spot.y + 10, 400, 250);
    g.fillStyle(0xb5d98a, 0.8).fillEllipse(spot.x - 30, spot.y, 290, 170);
    g.lineStyle(3, 0x4d7c0f, 0.6).strokeEllipse(spot.x, spot.y + 10, 400, 250);
    // A few balloons drifting over the meadow (animated in update).
    this.meadowBalloons = ['blue', 'yellow', 'green', 'purple'].map((color, i) => {
      const bx = spot.x + [-150, -80, 120, 165][i];
      const by = spot.y + [-60, 70, -75, 40][i];
      return { img: this.add.image(bx, by, `balloon_${color}`).setScale(0.3).setDepth(3), y: by, phase: i * 1.7 };
    });
  }

  drawLavaFields(spot) {
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x27272a).fillEllipse(spot.x, spot.y + 20, 440, 300);
    g.fillStyle(0x18181b).fillEllipse(spot.x + 10, spot.y + 30, 330, 210);
    // Volcano behind the crossing.
    const vx = spot.x + 130;
    const vy = spot.y - 70;
    g.fillStyle(0x3f3f46).fillTriangle(vx - 90, vy + 70, vx - 22, vy - 50, vx + 90, vy + 70);
    g.fillStyle(0x3f3f46).fillRect(vx - 22, vy - 50, 44, 6);
    g.lineStyle(3, 0x09090b).strokeTriangle(vx - 90, vy + 70, vx - 22, vy - 50, vx + 90, vy + 70);
    this.volcano = { x: vx, y: vy - 50 };
    this.lavaRiver = new Phaser.Curves.CubicBezier(
      new Phaser.Math.Vector2(spot.x - 200, spot.y + 60),
      new Phaser.Math.Vector2(spot.x - 80, spot.y + 150),
      new Phaser.Math.Vector2(spot.x + 60, spot.y + 40),
      new Phaser.Math.Vector2(spot.x + 210, spot.y + 120),
    ).getPoints(40);
    this.lavaPools = [[spot.x - 110, spot.y + 120, 22], [spot.x + 120, spot.y + 150, 28], [spot.x + 170, spot.y + 40, 16]];
    this.add.text(spot.x - 120, spot.y - 75, t('map.obsidian'), { fontFamily: FONT, fontSize: '16px', fontStyle: 'italic', color: '#fdba74' }).setOrigin(0.5).setDepth(5);
  }

  // A dotted trail, like the roads on old maps.
  drawPath(from, to, bend) {
    const g = this.add.graphics().setDepth(2);
    const mid = new Phaser.Math.Vector2((from.x + to.x) / 2 + bend, (from.y + to.y) / 2 + Math.abs(bend) * 0.3);
    const points = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(from.x, from.y), mid, new Phaser.Math.Vector2(to.x, to.y)).getSpacedPoints(46);
    g.lineStyle(7, 0x78350f, 0.6);
    for (let i = 0; i < points.length - 1; i += 2) g.lineBetween(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
  }

  drawCamp() {
    const g = this.add.graphics().setDepth(3);
    const { x, y } = CAMP;
    g.fillStyle(0x000000, 0.2).fillEllipse(x, y + 30, 120, 26);
    g.fillStyle(0xb45309).fillTriangle(x - 46, y + 28, x, y - 34, x + 46, y + 28);
    g.fillStyle(0x7c2d12).fillTriangle(x - 12, y + 28, x, y - 2, x + 12, y + 28);
    g.lineStyle(3, 0x451a03).strokeTriangle(x - 46, y + 28, x, y - 34, x + 46, y + 28);
    g.lineStyle(3, 0x451a03).lineBetween(x, y - 34, x, y - 56);
    g.fillStyle(0xdc2626).fillTriangle(x, y - 56, x + 22, y - 49, x, y - 42);
    this.add.text(x, y + 56, t('map.camp'), {
      fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#3b1f08', stroke: '#f5e6c0', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(5);
  }

  drawCompass(x, y) {
    const g = this.add.graphics().setDepth(3);
    g.lineStyle(2, INK, 0.8).strokeCircle(x, y, 46);
    g.lineStyle(1, INK, 0.6).strokeCircle(x, y, 38);
    const point = (angle, len, color) => {
      const a = Phaser.Math.DegToRad(angle);
      const side = (d) => ({ x: x + Math.cos(a + d) * 9, y: y + Math.sin(a + d) * 9 });
      const l = side(Math.PI / 2);
      const r = side(-Math.PI / 2);
      g.fillStyle(color).fillTriangle(l.x, l.y, x + Math.cos(a) * len, y + Math.sin(a) * len, r.x, r.y);
    };
    [0, 90, 180, 270].forEach((a) => point(a, 40, a === 270 ? 0xb91c1c : INK));
    [45, 135, 225, 315].forEach((a) => point(a, 24, 0x92400e));
    this.add.text(x, y - 62, t('map.north'), { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#3b1f08' }).setOrigin(0.5).setDepth(3);
  }

  // ---------------------------------------------------------------- loop

  update(time) {
    const t = time / 1000;
    const g = this.animated.clear();
    // Ripples on the lake.
    for (let i = 0; i < 3; i++) {
      const r = (t * 18 + i * 45) % 135;
      g.lineStyle(2, 0xffffff, 0.3 * (1 - r / 135)).strokeEllipse(this.lake.x, this.lake.y - 4, r * 2, r);
    }
    // A shark's fin circling in the lake, with a little wake behind it.
    const a = t * 0.9;
    const fx = this.lake.x + Math.cos(a) * 120;
    const fy = this.lake.y + Math.sin(a) * 52;
    const dir = -Math.sin(a) >= 0 ? 1 : -1; // which way it is heading, left or right
    g.lineStyle(3, 0xe0f2fe, 0.7).lineBetween(fx - dir * 34, fy + 2, fx + dir * 6, fy + 2);
    g.fillStyle(0x334155).fillTriangle(fx - dir * 16, fy, fx + dir * 14, fy, fx - dir * 8, fy - 28);
    g.lineStyle(2, 0x0f172a).strokeTriangle(fx - dir * 16, fy, fx + dir * 14, fy, fx - dir * 8, fy - 28);
    // The glowing lava river and pools.
    const glow = Math.sin(t * 3) * 0.2 + 0.8;
    g.lineStyle(22, 0xef4444, glow).strokePoints(this.lavaRiver);
    g.lineStyle(11, 0xfb923c, glow).strokePoints(this.lavaRiver);
    g.lineStyle(3, 0xfef08a, 1).strokePoints(this.lavaRiver);
    this.lavaPools.forEach(([x, y, r]) => {
      g.fillStyle(0xb91c1c).fillCircle(x, y, r);
      g.fillStyle(0xf97316, glow).fillCircle(x, y, r * 0.7);
      g.fillStyle(0xfef08a, glow).fillCircle(x, y, r * 0.3);
    });
    g.fillStyle(0xf97316, glow).fillEllipse(this.volcano.x, this.volcano.y + 2, 40, 10);
    // Smoke from the volcano.
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.4 + i / 4) % 1;
      g.fillStyle(0x52525b, 0.45 * (1 - k)).fillCircle(this.volcano.x + Math.sin(k * 6 + i) * 10, this.volcano.y - k * 90, 8 + k * 16);
    }
    this.meadowBalloons.forEach((b) => b.img.setY(b.y + Math.sin(t * 1.6 + b.phase) * 8));
  }
}
