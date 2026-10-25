// The Trading Post: a grid of items, one row per game. Choosing an item asks to confirm the price;
// buying takes it from the points every game pays into. Owned skins can be put on or off for free.
import Phaser from 'phaser';
import { ROBOT_FRAMES } from './PreloadScene.js';
import { GAMES, ITEMS, Shop } from '../shop.js';
import { FRAMES_PER_ROW, SWIM_ROWS } from '../sharkChase.js';
import { sfx } from '../sound.js';
import { FONT, INK, W, H, drawParchment } from './parchment.js';
import { t, textStyle } from '../i18n.js';
import { addLangButton, centeredText, itemText } from './lang.js';

const CARD_W = 172;
const GRID_W = 5 * CARD_W + 4 * 16; // a row of more than five cards shares this width
const CARD_H = 138;
const CARD_GAP = 16;
const GRID_LEFT = 300; // left edge of the first card; the game names sit to its left
const ROW_TOP = [112, 262, 412, 562]; // one row per game, filling the screen below the title
const ICON_SCALE = 0.8;
const FIRE_TINT = 0xff7a1a;

export default class ShopScene extends Phaser.Scene {
  constructor() {
    super('shop');
  }

  create() {
    this.shop = new Shop();
    this.cards = {};
    this.dialog = null;
    this.cameras.main.fadeIn(250);
    drawParchment(this);

    this.add.text(W / 2, 50, t('shop.title'), textStyle({
      fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#3b1f08', stroke: '#f5e6c0', strokeThickness: 6,
    })).setOrigin(0.5);
    this.add.text(W / 2, 92, t('shop.subtitle'), textStyle({
      fontFamily: FONT, fontSize: '18px', fontStyle: 'italic', color: '#5b3510',
    })).setOrigin(0.5);
    this.pointsText = this.add.text(W - 40, 36, '', textStyle({
      fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#3b1f08', backgroundColor: '#fcd34dee', padding: { x: 14, y: 8 },
    })).setOrigin(1, 0);
    const back = this.add.text(40, 36, t('shop.back'), textStyle({
      fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#fef3c7', backgroundColor: '#1e3a5fdd', padding: { x: 14, y: 8 },
    })).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setBackgroundColor('#2c5a8fee'));
    back.on('pointerout', () => back.setBackgroundColor('#1e3a5fdd'));
    back.on('pointerup', () => !this.dialog && this.scene.start('map'));
    this.backButton = back;
    // Switch the language (the shop is drawn again in it). Not while the buy dialog is open.
    this.langButton = addLangButton(this, back.x + back.width + 48, 36 + back.height / 2, { canToggle: () => !this.dialog });

    GAMES.forEach((game, row) => {
      const top = ROW_TOP[row];
      this.add.text(GRID_LEFT - 30, top + CARD_H / 2, t(`games.${game.id}`, { defaultValue: game.name }).replace(' ', '\n'), textStyle({
        fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#3b1f08', align: 'right', lineSpacing: 4,
      })).setOrigin(1, 0.5);
      const items = ITEMS.filter((it) => it.game === game.id);
      const cardW = Math.min(CARD_W, Math.floor((GRID_W - (items.length - 1) * CARD_GAP) / items.length));
      items.forEach((it, col) => {
        this.createCard(it, GRID_LEFT + col * (cardW + CARD_GAP) + cardW / 2, top + CARD_H / 2, cardW);
      });
    });
    this.refresh();
    // Esc closes an open dialog, otherwise goes back to the map.
    this.input.keyboard.on('keydown-ESC', () => (this.dialog ? this.closeDialog() : this.scene.start('map')));
  }

  // ---------------------------------------------------------------- cards

  createCard(it, x, y, cardW = CARD_W) {
    const c = this.add.container(x, y).setDepth(5);
    const bg = this.add.rectangle(0, 0, cardW, CARD_H, 0xf5e6c0, 0.95).setStrokeStyle(3, INK);
    const icon = this.add.container(0, -36, this.makeIcon(it, 0, 0)).setScale(ICON_SCALE);
    const name = this.add.text(0, 0, itemText(it, 'name'), textStyle({
      fontFamily: FONT, fontSize: cardW < CARD_W ? '15px' : '18px', fontStyle: 'bold', color: '#3b1f08',
    })).setOrigin(0.5);
    const about = this.add.text(0, 24, itemText(it, 'about'), textStyle({
      fontFamily: FONT, fontSize: '12px', color: '#5b3510', align: 'center', wordWrap: { width: cardW - 14 },
    })).setOrigin(0.5);
    const badge = this.add.text(0, CARD_H / 2 - 15, '', textStyle({
      fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#fef3c7', backgroundColor: '#9a3412', padding: { x: 10, y: 5 },
    })).setOrigin(0.5);
    // Single-use items: how many are waiting to be used, beside the price.
    const single = it.kind === 'single';
    if (single) badge.setX(-cardW * 0.22);
    const stock = this.add.text(cardW * 0.25, CARD_H / 2 - 15, '', textStyle({
      fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#fef3c7', backgroundColor: '#1e3a5f', padding: { x: 6, y: 4 },
    })).setOrigin(0.5);
    c.add([bg, icon, name, about, badge, stock]);
    c.setSize(cardW, CARD_H).setInteractive({ useHandCursor: true });
    c.on('pointerover', () => {
      if (this.dialog) return;
      bg.setStrokeStyle(5, 0xd97706);
      this.tweens.add({ targets: c, scale: 1.05, duration: 120 });
    });
    c.on('pointerout', () => {
      bg.setStrokeStyle(3, INK);
      this.tweens.add({ targets: c, scale: 1, duration: 120 });
    });
    c.on('pointerup', () => !this.dialog && this.choose(it));
    this.cards[it.id] = { item: it, x, y, container: c, bg, badge, stock };
  }

  makeIcon(it, x, y) {
    switch (it.icon) {
      case 'clock': {
        const g = this.add.graphics({ x, y });
        g.fillStyle(0xfff7ed).fillCircle(0, 0, 27).lineStyle(4, INK).strokeCircle(0, 0, 27);
        g.lineStyle(4, 0x9a3412).lineBetween(0, 0, 0, -18).lineBetween(0, 0, 13, 6);
        return g;
      }
      case 'balloon':
        return this.add.image(x, y, 'balloon_blue').setScale(0.34);
      case 'arrow':
        return this.add.image(x, y, 'arrow').setScale(0.55).setRotation(-0.5).setTint(FIRE_TINT);
      case 'hunter':
        return this.add.sprite(x, y + 32, 'hunter', 0).setOrigin(0.5, 1).setScale(0.27).setTint(it.tint);
      case 'player':
        return this.add.sprite(x, y + 32, `${it.sprite}_jumper`, ROBOT_FRAMES.front).setOrigin(0.5, 1).setScale(0.55);
      case 'robot':
        return this.add.sprite(x, y + 26, 'robot', ROBOT_FRAMES.front).setOrigin(0.5, 1).setScale(0.46).setTint(it.tint);
      case 'diver':
        return this.add.sprite(x, y, it.suit ? `diver_${it.suit}` : 'diver', SWIM_ROWS.right * FRAMES_PER_ROW).setScale(0.62);
      case 'repel': {
        // A spray can with a puff.
        const g = this.add.graphics({ x, y });
        g.fillStyle(0x16a34a).fillRoundedRect(-14, -14, 28, 46, 6).lineStyle(3, INK).strokeRoundedRect(-14, -14, 28, 46, 6);
        g.fillStyle(0xe2e8f0).fillRect(-6, -24, 12, 10).lineStyle(2, INK).strokeRect(-6, -24, 12, 10);
        g.fillStyle(0xfef3c7).fillRect(-14, 0, 28, 12);
        g.fillStyle(0xbae6fd, 0.9).fillCircle(20, -28, 8).fillCircle(32, -34, 10).fillCircle(30, -20, 7);
        return g;
      }
      case 'heart':
        return this.add.text(x, y, '❤', { fontSize: '50px', color: '#e11d48' }).setOrigin(0.5);
      case 'rope': {
        // A coil of rope with its end hanging down.
        const g = this.add.graphics({ x, y });
        for (let i = 0; i < 4; i++) {
          g.lineStyle(9, 0x2a1606).strokeEllipse(0, -10 + i * 9, 74 - i * 6, 24);
          g.lineStyle(5, 0xf0c27a).strokeEllipse(0, -10 + i * 9, 74 - i * 6, 24);
        }
        g.lineStyle(7, 0x2a1606).lineBetween(30, 22, 36, 40);
        g.lineStyle(4, 0xf0c27a).lineBetween(30, 22, 36, 40);
        return g;
      }
      default:
        return this.add.text(x, y, '?', { fontSize: '40px' }).setOrigin(0.5);
    }
  }

  // Price, or what you can do with it now.
  refresh() {
    this.pointsText.setText(`🪙 ${t('common.points', { points: this.shop.points })}`);
    for (const card of Object.values(this.cards)) {
      const { item: it, badge, bg, stock } = card;
      const left = this.shop.count(it.id);
      stock.setText(it.kind === 'single' ? t('shop.have', { n: left }) : '').setVisible(it.kind === 'single');
      stock.setBackgroundColor(left ? '#15803d' : '#1e3a5f');
      if (it.kind === 'skin' && this.shop.owns(it.id)) {
        const worn = this.shop.has(it.id);
        badge.setText(worn ? `✔ ${t('shop.wearing')}` : t('shop.wear')).setBackgroundColor(worn ? '#15803d' : '#1e3a5f');
      } else if (this.shop.owns(it.id)) {
        badge.setText(`✔ ${t('shop.yours')}`).setBackgroundColor('#15803d');
      } else {
        const short = this.shop.points < it.cost;
        badge.setText(`🪙 ${it.cost}`).setBackgroundColor(short ? '#7c6f64' : '#9a3412');
      }
      bg.setFillStyle(this.shop.owns(it.id) ? 0xe7f5d8 : 0xf5e6c0, 0.95);
    }
  }

  choose(it) {
    if (it.kind === 'skin' && this.shop.owns(it.id)) {
      this.shop.toggleSkin(it.id);
      sfx.tick();
      this.refresh();
      return;
    }
    if (this.shop.owns(it.id)) return;
    this.openDialog(it);
  }

  // ---------------------------------------------------------------- confirm

  openDialog(it) {
    const problem = this.shop.cantBuy(it.id);
    const items = [];
    // Full-screen catcher so nothing behind the dialog can be clicked.
    items.push(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.45).setInteractive());
    items.push(this.add.rectangle(W / 2, H / 2, 560, 300, 0x0f172a, 0.96).setStrokeStyle(3, 0xb45309));
    items.push(this.add.text(W / 2, H / 2 - 100, itemText(it, 'name'), textStyle({ fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#fcd34d' })).setOrigin(0.5));
    const single = it.kind === 'single';
    const points = this.shop.points;
    const text = problem
      ? `${t('shop.costs', { cost: it.cost, points })}\n${t('shop.needMore', { n: Math.max(0, it.cost - points) })}`
      : `${t(single ? 'shop.buyOneMore' : 'shop.buyIt', { cost: it.cost })}\n` +
        `${single ? t('shop.lasts', { lasts: itemText(it, 'lasts'), n: this.shop.count(it.id) }) : t('shop.forGood')}\n` +
        t('shop.leaving', { points, left: points - it.cost });
    items.push(centeredText(this, W / 2, H / 2 - 20, text, {
      fontFamily: FONT, fontSize: '20px', color: '#e2e8f0', align: 'center', lineSpacing: 8,
    }));
    const buttons = problem
      ? [[t('buttons.ok'), 0x1e3a5f, () => this.closeDialog()]]
      : [[t('buttons.buy'), 0x15803d, () => this.buy(it)], [t('buttons.cancel'), 0x7c2d12, () => this.closeDialog()]];
    buttons.forEach(([label, color, onClick], i) => {
      const bx = W / 2 + (i - (buttons.length - 1) / 2) * 180;
      const btn = this.add.text(bx, H / 2 + 90, label, textStyle({
        fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#ffffff',
        backgroundColor: Phaser.Display.Color.IntegerToColor(color).rgba, padding: { x: 26, y: 10 },
      })).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setScale(1.06));
      btn.on('pointerout', () => btn.setScale(1));
      btn.on('pointerup', onClick);
      items.push(btn);
    });
    items.forEach((o) => o.setDepth(50));
    this.dialog = { item: it, items, buttons: items.filter((o) => o.type === 'Text' && buttons.some(([label]) => label === o.text)) };
  }

  closeDialog() {
    this.dialog?.items.forEach((o) => o.destroy());
    this.dialog = null;
  }

  buy(it) {
    const before = this.shop.points;
    const result = this.shop.buy(it.id);
    this.closeDialog();
    if (!result.ok) return;
    sfx.win();
    // Count the points down to the new total, and flash the card.
    const counter = { value: before };
    this.tweens.add({
      targets: counter,
      value: this.shop.points,
      duration: 600,
      onUpdate: () => this.pointsText.setText(`🪙 ${t('common.points', { points: Math.round(counter.value) })}`),
      onComplete: () => this.refresh(),
    });
    this.refresh();
    this.pointsText.setText(`🪙 ${t('common.points', { points: before })}`);
    const card = this.cards[it.id];
    this.tweens.add({ targets: card.container, scale: 1.12, duration: 160, yoyo: true });
    const spent = this.add.text(this.pointsText.x - 80, this.pointsText.y + 50, `−${it.cost}`, {
      fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#b91c1c',
    }).setDepth(60);
    this.tweens.add({ targets: spent, y: spent.y + 30, alpha: 0, duration: 900, onComplete: () => spent.destroy() });
  }
}
