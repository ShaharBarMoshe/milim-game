// Shark Lake: spell the word by swimming into the right letter bubbles while a shark hunts the diver.
// A right letter stuns the shark for a few seconds; a wrong one makes it lunge closer. The chase rules
// live in src/sharkChase.js, the spelling in SpellingRun (the same words as the lava level).
import Phaser from 'phaser';
import { sfx } from '../sound.js';
import { voice } from '../speech.js';
import { Shop } from '../shop.js';
import { showPerks } from './perks.js';
import { afterSpeech } from './afterSpeech.js';
import { WRONG_POINTS, WordHistory, spellingPoints, stageBonus } from '../score.js';
import { SAMPLE_PAIRS } from '../vocab.js';
import { SpellingRun, pickSpellingPairs } from '../spelling.js';
import { t, textStyle } from '../i18n.js';
import { centeredText } from './lang.js';
import {
  CATCH_RADIUS, FRAMES_PER_ROW, LAKE, LETTER_RADIUS, STUN_MS, SWIM_ROWS, Shark,
  keyVector, moveDiver, placeLetters, pointerVector, swimDirection, touchedLetter,
} from '../sharkChase.js';

const W = 1280;
const H = 720;
const FONT = 'Trebuchet MS, Arial, sans-serif';

const WORDS_PER_GAME = 5;
const LIVES = 3;
const CHOICES = 3; // bubbles per letter
const REPEL_MS = 5000;
const SAFE_MS = 1500; // after a bite the diver blinks and can't be caught
const NEXT_WORD_MS = 1600;

const DIVER_START = { x: 220, y: 420 };
const SHARK_START = { x: 1120, y: 600 };
const DIVER_SCALE = 0.75;
const SHARK_SCALE = 0.85;

export default class SharkScene extends Phaser.Scene {
  constructor() {
    super('shark');
  }

  init(data) {
    this.pairs = data?.pairs?.length ? data.pairs : SAMPLE_PAIRS;
  }

  create() {
    this.state = 'playing';
    this.events.once('shutdown', () => voice.stop());
    this.shop = new Shop();
    this.tally = this.shop.startGame();
    this.history = new WordHistory();
    this.bonus = 0;
    this.lives = LIVES;
    this.score = 0;
    this.spelled = 0;
    this.mistakes = 0;
    this.wordIndex = 0;
    this.bubbles = [];
    this.overlay = null;
    this.safeUntil = 0;
    this.facing = 'right';
    this.pointerSteer = false; // the diver follows the mouse once it moves over the lake
    this.words = pickSpellingPairs(this.pairs, WORDS_PER_GAME);

    this.drawLake();
    // A suit bought in the shop recolours the diver.
    const suit = this.shop.skin('diver');
    this.diverSkin = suit ? `diver_${suit.suit}` : 'diver';
    this.diver = this.add.sprite(DIVER_START.x, DIVER_START.y, this.diverSkin, SWIM_ROWS.right * FRAMES_PER_ROW)
      .setScale(DIVER_SCALE).setDepth(20);
    this.shark = new Shark(SHARK_START);
    this.sharkSprite = this.add.sprite(SHARK_START.x, SHARK_START.y, 'shark', SWIM_ROWS.left * FRAMES_PER_ROW)
      .setScale(SHARK_SCALE).setDepth(22);
    this.dizzy = this.add.text(0, 0, '💫', { fontSize: '34px' }).setOrigin(0.5).setDepth(23).setVisible(false);
    this.createHud();

    this.keys = this.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D');
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('map'));
    this.input.keyboard.on('keydown-SPACE', () => this.sayWord());
    this.input.on('pointermove', () => (this.pointerSteer = true));
    this.input.on('pointerdown', () => (this.pointerSteer = true));
    this.input.on('gameout', () => (this.pointerSteer = false));

    if (!this.words.length) {
      this.endGame(t('spell.noWords'), t('spell.noWordsDetail'));
      return;
    }
    // Shark repellent from the shop: the shark starts the game stunned.
    this.repelled = this.shop.use('shark-repel');
    if (this.repelled) {
      // The scene clock only catches up with the game's on the first update, so use the game's time.
      this.shark.stun(this.game.loop.time, REPEL_MS);
      this.showMessage(`🧴 ${t('shark.repelled')}`, '#a8ffb0');
    }
    this.perkBar = showPerks(this, [this.repelled && 'shark-repel', suit?.id], { right: W - 24, top: 62 });
    this.startWord();
  }

  // ---------------------------------------------------------------- scenery

  drawLake() {
    const g = this.add.graphics();
    // Deeper water is darker. Bands rather than fillGradientStyle, which the Canvas renderer can't draw.
    const top = Phaser.Display.Color.ValueToColor(0x1e88c8);
    const deep = Phaser.Display.Color.ValueToColor(0x062a4a);
    for (let i = 0; i < 24; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, deep, 23, i);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b)).fillRect(0, (i * H) / 24, W, H / 24 + 1);
    }
    // Light from the surface.
    g.fillStyle(0xffffff, 0.06);
    for (let i = 0; i < 6; i++) {
      const x = 80 + i * 230;
      g.fillTriangle(x, 0, x + 90, 0, x - 60 + i * 20, H);
    }
    // The sandy bottom, rocks and weed.
    g.fillStyle(0xc2a36b, 1).fillEllipse(W / 2, H + 40, W * 1.4, 150);
    g.fillStyle(0xa88a55, 1).fillEllipse(W / 2 + 200, H + 50, W * 0.8, 120);
    [[90, 700, 46], [1180, 705, 56], [700, 712, 34]].forEach(([x, y, r]) => {
      g.fillStyle(0x4b5563).fillEllipse(x, y, r * 2, r * 1.2);
      g.fillStyle(0x6b7280).fillEllipse(x - r * 0.2, y - r * 0.2, r * 1.2, r * 0.6);
    });
    this.weeds = [[160, 70], [330, 90], [520, 60], [880, 100], [1040, 75], [1230, 85]].map(([x, h]) => ({ x, h }));
    this.weedLayer = this.add.graphics().setDepth(2);
    // Bubbles drifting up from the bottom.
    if (!this.textures.exists('water_bubble')) {
      const b = this.make.graphics({ x: 0, y: 0 }, false);
      b.lineStyle(2, 0xffffff, 0.8).strokeCircle(8, 8, 6);
      b.fillStyle(0xffffff, 0.6).fillCircle(6, 6, 2);
      b.generateTexture('water_bubble', 16, 16);
      b.destroy();
    }
    this.add.particles(0, 0, 'water_bubble', {
      x: { min: 0, max: W },
      y: H,
      speedY: { min: -70, max: -30 },
      speedX: { min: -10, max: 10 },
      lifespan: 9000,
      scale: { min: 0.4, max: 1.1 },
      alpha: { start: 0.7, end: 0 },
      frequency: 260,
    }).setDepth(3);
  }

  drawWeeds(t) {
    const g = this.weedLayer.clear();
    for (const { x, h } of this.weeds) {
      for (let k = -1; k <= 1; k++) {
        const points = [];
        for (let i = 0; i <= 6; i++) {
          const y = H - 10 - (i / 6) * h;
          points.push(new Phaser.Math.Vector2(x + k * 12 + Math.sin(t * 1.5 + i * 0.6 + x + k) * i * 2.2, y));
        }
        g.lineStyle(6, 0x15803d, 0.9).strokePoints(points);
      }
    }
  }

  // ---------------------------------------------------------------- word flow

  startWord() {
    const pair = this.words[this.wordIndex];
    this.run = new SpellingRun(pair, { choices: CHOICES });
    // How tricky the word is as it starts: missing it now makes it worth more next game, not this one.
    this.tricky = this.history.tricky(pair);
    voice.say(this.run.word);
    this.state = 'playing';
    this.placeBubbles();
    this.updateHud();
  }

  // Bubbles for the next letter's choices, away from the diver and the shark.
  placeBubbles() {
    this.clearBubbles();
    const { letters } = this.run.columns[this.run.position];
    const spots = placeLetters(letters, { avoid: [this.diver, this.shark] });
    this.bubbles = spots.map((spot, i) => ({ ...spot, sprite: this.makeBubble(spot, i) }));
  }

  makeBubble({ x, y, letter }, i) {
    const c = this.add.container(x, y).setDepth(15);
    const r = LETTER_RADIUS;
    const g = this.add.graphics();
    g.fillStyle(0xbfe9ff, 0.35).fillCircle(0, 0, r);
    g.lineStyle(4, 0xffffff, 0.9).strokeCircle(0, 0, r);
    g.fillStyle(0xffffff, 0.7).fillEllipse(-r * 0.4, -r * 0.45, r * 0.5, r * 0.3);
    const text = this.add.text(0, 2, letter, {
      fontFamily: FONT, fontSize: '42px', fontStyle: 'bold', color: '#ffffff', stroke: '#0b3a5c', strokeThickness: 7,
    }).setOrigin(0.5);
    c.add([g, text]);
    c.setScale(0);
    this.tweens.add({ targets: c, scale: 1, duration: 260, delay: i * 70, ease: 'Back.easeOut' });
    // A gentle bob; the bubble's spot for touching stays where it was placed.
    this.tweens.add({ targets: c, y: y - 6, duration: 1100 + i * 150, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return c;
  }

  clearBubbles() {
    this.bubbles.forEach((b) => b.sprite.destroy());
    this.bubbles = [];
  }

  popBubble(bubble, color) {
    this.bubbles = this.bubbles.filter((b) => b !== bubble);
    this.tweens.killTweensOf(bubble.sprite);
    this.tweens.add({ targets: bubble.sprite, scale: 1.5, alpha: 0, duration: 220, onComplete: () => bubble.sprite.destroy() });
    const ring = this.add.circle(bubble.x, bubble.y, LETTER_RADIUS, color, 0).setStrokeStyle(5, color).setDepth(16);
    this.tweens.add({ targets: ring, scale: 1.8, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
  }

  choose(bubble) {
    const { correct, done } = this.run.jump(bubble.letter);
    const now = this.time.now;
    if (!correct) {
      this.mistakes++;
      if (this.run.mistakes === 1) this.history.missed(this.run.pair);
      this.score = this.tally.add(WRONG_POINTS);
      sfx.wrong();
      this.popBubble(bubble, 0xff5a5a);
      this.shark.lunge(this.diver);
      this.sharkSprite.setPosition(this.shark.x, this.shark.y);
      this.cameras.main.shake(220, 0.006);
      this.showMessage(t('shark.wrongLetter', { letter: bubble.letter }), '#ff8a6a');
      this.updateHud();
      return;
    }
    sfx.correct();
    this.popBubble(bubble, 0x3ccf4a);
    this.shark.stun(now, STUN_MS);
    this.updateHud();
    if (done) {
      this.finishWord();
      return;
    }
    this.showMessage(`${t('shark.right')} 💫`, '#a8ffb0');
    this.placeBubbles();
  }

  finishWord() {
    this.state = 'between';
    this.clearBubbles();
    const points = spellingPoints(this.run.word, { mistakes: this.run.mistakes, tricky: this.tricky });
    if (!this.run.mistakes) this.history.learned(this.run.pair);
    this.score = this.tally.add(points);
    this.spelled++;
    // The shark waits while the next word comes.
    this.shark.stun(this.time.now, NEXT_WORD_MS + STUN_MS);
    sfx.win();
    const spoken = this.sayBoth();
    this.showMessage(`${this.run.prompt} = ${this.run.word}   +${points}`, '#a8ffb0');
    this.updateHud();
    // The next word comes once both words have been said; the shark is still dizzy as it starts.
    afterSpeech(this, spoken, NEXT_WORD_MS, () => {
      if (this.state === 'over') return;
      this.shark.stun(this.time.now, STUN_MS);
      this.wordIndex++;
      if (this.wordIndex >= this.words.length) this.endGame(t('shark.escaped'), t('shark.spelledAll'));
      else this.startWord();
    });
  }

  // The shark bites: a life is lost and the shark is chased off to the far side of the lake.
  bitten() {
    this.lives--;
    this.safeUntil = this.time.now + SAFE_MS;
    sfx.splash();
    this.cameras.main.shake(300, 0.01);
    this.updateHud();
    if (this.lives <= 0) {
      this.sayBoth();
      this.endGame(t('shark.caught'), t('spell.theWordWas', { word: this.run.word }));
      return;
    }
    this.shark.x = this.diver.x < W / 2 ? LAKE.right - 60 : LAKE.left + 60;
    this.shark.y = this.diver.y < H / 2 ? LAKE.bottom - 60 : LAKE.top + 60;
    this.sharkSprite.setPosition(this.shark.x, this.shark.y);
    this.tweens.add({ targets: this.diver, alpha: 0.25, duration: 120, yoyo: true, repeat: Math.floor(SAFE_MS / 240) - 1, onComplete: () => this.diver.setAlpha(1) });
    this.showMessage(t('shark.chomp', { n: this.lives }), '#ff8a6a');
  }

  endGame(title, detail) {
    this.state = 'over';
    this.clearBubbles();
    this.diver.anims?.stop();
    this.bonus = stageBonus('shark', { spelled: this.spelled, total: this.words.length, mistakes: this.mistakes });
    this.score = this.tally.add(this.bonus);
    this.updateHud();
    const items = [];
    items.push(this.add.rectangle(W / 2, H / 2, 760, 360, 0x062a4a, 0.94).setStrokeStyle(4, 0x7dd3fc));
    items.push(this.add.text(W / 2, H / 2 - 120, title, textStyle({
      fontFamily: FONT, fontSize: '50px', fontStyle: 'bold', color: '#7dd3fc', stroke: '#000', strokeThickness: 6,
    })).setOrigin(0.5));
    items.push(centeredText(this, W / 2, H / 2 - 30,
      `${detail}\n${t('spell.summary', { spelled: this.spelled, total: this.words.length, mistakes: this.mistakes })}\n` +
      (this.bonus ? `${t('common.stageBonus', { bonus: this.bonus })}\n` : '') +
      t('spell.pointsLine', { score: this.score, total: this.shop.points }), {
        fontFamily: FONT, fontSize: '24px', color: '#ffffff', align: 'center', lineSpacing: 10,
      }));
    const buttons = [
      this.words.length && [t('buttons.playAgain'), 0x0e7490, () => this.scene.restart({ pairs: this.pairs })],
      this.words.length && [t('buttons.lava'), 0xc0480e, () => this.scene.start('lava', { pairs: this.pairs })],
      [t('buttons.map'), 0x3a6ea5, () => this.scene.start('map')],
    ].filter(Boolean);
    buttons.forEach(([label, color, onClick], i) => {
      items.push(this.makeButton(W / 2 + (i - (buttons.length - 1) / 2) * 230, H / 2 + 115, label, color, onClick));
    });
    this.overlay = this.add.container(0, 0, items).setDepth(95);
  }

  // ---------------------------------------------------------------- HUD

  createHud() {
    const style = { fontFamily: FONT, fontSize: '28px', color: '#ffffff', stroke: '#06223a', strokeThickness: 6 };
    const fixed = (o) => o.setDepth(90);
    this.livesText = fixed(this.add.text(24, 18, '', { ...style, color: '#ff6b5a' }));
    this.wordText = fixed(this.add.text(24, 58, '', textStyle({ ...style, fontSize: '22px' })).setOrigin(0, 0));
    this.scoreText = fixed(this.add.text(W - 24, 18, '', style).setOrigin(1, 0));

    this.add.rectangle(W / 2, 54, 560, 100, 0x062a4a, 0.85).setStrokeStyle(3, 0x7dd3fc).setDepth(89);
    this.promptLabel = fixed(this.add.text(W / 2, 10, t('spell.inEnglish'), textStyle({ fontFamily: FONT, fontSize: '16px', color: '#bae6fd' })).setOrigin(0.5, 0));
    this.promptText = fixed(this.add.text(W / 2, 28, '', {
      fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffffff', rtl: true,
    }).setOrigin(0.5, 0));
    this.progressText = fixed(this.add.text(W / 2, 70, '', {
      fontFamily: 'Courier New, monospace', fontSize: '26px', fontStyle: 'bold', color: '#fde68a',
    }).setOrigin(0.5, 0));
    this.messageText = fixed(this.add.text(W / 2, 140, '', textStyle({ ...style, fontSize: '28px' })).setOrigin(0.5).setAlpha(0));
    this.hintText = fixed(this.add.text(W / 2, H - 16, t('shark.hint'), textStyle({
      fontFamily: FONT, fontSize: '16px', color: '#e0f2fe',
    })).setOrigin(0.5, 1).setAlpha(0.8));

    // Hear the word again (or press Space).
    this.sayButton = fixed(this.add.text(W / 2 + 236, 44, '🔊', {
      fontSize: '30px', backgroundColor: '#0b3a5ccc', padding: { x: 8, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }));
    this.sayButton.on('pointerover', () => this.sayButton.setScale(1.12));
    this.sayButton.on('pointerout', () => this.sayButton.setScale(1));
    this.sayButton.on('pointerdown', () => this.sayWord());
    fixed(this.add.text(W / 2 + 236, 84, t('keys.space'), textStyle({ fontFamily: FONT, fontSize: '14px', color: '#bae6fd' })).setOrigin(0.5));
  }

  // When a word ends (spelled or lost): its prompt, then the word itself, like "לחם = bread" on screen.
  // Resolves once both have been said.
  sayBoth() {
    voice.say(this.run.prompt);
    return voice.say(this.run.word);
  }

  sayWord() {
    if (!this.run || this.state === 'over') return;
    voice.say(this.run.word);
    this.tweens.add({ targets: this.sayButton, scale: 1.25, duration: 120, yoyo: true });
  }

  updateHud() {
    const hearts = '❤ '.repeat(Math.max(0, this.lives)).trim();
    this.livesText.setText(hearts || '—');
    this.scoreText.setText(`🪙 ${this.tally.total}  (+${this.score})`);
    this.wordText.setText(this.words.length ? t('spell.wordOf', { index: Math.min(this.wordIndex + 1, this.words.length), total: this.words.length }) : '');
    if (this.run) {
      const hebrew = this.run.lang === 'he';
      this.promptLabel.setText(t(hebrew ? 'spell.inHebrew' : 'spell.inEnglish'));
      this.promptText.setText(this.run.prompt);
      this.progressText.setRTL(hebrew).setText([...this.run.progress()].join(' '));
    }
  }

  showMessage(text, color) {
    this.messageText.setText(text).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this.messageText);
    this.tweens.add({ targets: this.messageText, alpha: 0, delay: 1300, duration: 400 });
  }

  makeButton(x, y, label, color, onClick) {
    const btn = this.add.text(x, y, label, textStyle({
      fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
      backgroundColor: Phaser.Display.Color.IntegerToColor(color).rgba,
      padding: { x: 26, y: 12 },
    })).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setScale(1.06));
    btn.on('pointerout', () => btn.setScale(1));
    btn.on('pointerup', () => this.state === 'over' && onClick());
    return btn;
  }

  // ---------------------------------------------------------------- loop

  // Which way the player is steering: the keys win; otherwise toward the mouse once it has moved.
  steering() {
    const k = this.keys;
    const keys = keyVector({
      left: k.LEFT.isDown || k.A.isDown, right: k.RIGHT.isDown || k.D.isDown,
      up: k.UP.isDown || k.W.isDown, down: k.DOWN.isDown || k.S.isDown,
    });
    if (keys.x || keys.y || !this.pointerSteer) return keys;
    const p = this.input.activePointer;
    return pointerVector(this.diver, { x: p.worldX, y: p.worldY });
  }

  playSwim(sprite, texture, dir) {
    const key = `${texture}-${dir}`;
    if (sprite.anims.currentAnim?.key !== key || !sprite.anims.isPlaying) sprite.play(key, true);
  }

  update(time, delta) {
    this.drawWeeds(time / 1000);
    if (this.state === 'over') return;
    const dt = Math.min(delta, 100) / 1000;
    const now = this.time.now;

    // A touch is checked before moving, so the diver (or a test) placed on a bubble chooses it.
    if (this.state === 'playing') {
      const bubble = touchedLetter(this.diver, this.bubbles);
      if (bubble) this.choose(bubble);
    }
    if (this.state === 'over') return;

    const vec = this.steering();
    const dir = swimDirection(vec.x, vec.y);
    if (dir) {
      const pos = moveDiver(this.diver, vec, dt);
      this.diver.setPosition(pos.x, pos.y);
      this.facing = dir;
      this.playSwim(this.diver, this.diverSkin, dir);
    } else {
      this.diver.anims.stop();
      this.diver.setFrame(SWIM_ROWS[this.facing] * FRAMES_PER_ROW);
    }

    const stunned = this.shark.stunned(now);
    const sharkDir = this.shark.chase(this.diver, dt, now) ?? 'left';
    this.sharkSprite.setPosition(this.shark.x, this.shark.y);
    if (stunned) {
      this.sharkSprite.anims.stop();
      this.sharkSprite.setFrame(SWIM_ROWS[this.sharkFacing ?? 'left'] * FRAMES_PER_ROW);
      this.sharkSprite.setAngle(Math.sin(time / 90) * 6);
      this.dizzy.setVisible(true).setPosition(this.shark.x, this.shark.y - 70 + Math.sin(time / 150) * 4);
    } else {
      this.sharkFacing = sharkDir;
      this.sharkSprite.setAngle(0);
      this.dizzy.setVisible(false);
      this.playSwim(this.sharkSprite, 'shark', sharkDir);
    }

    if (this.state === 'playing' && now >= this.safeUntil && this.shark.catches(this.diver, CATCH_RADIUS)) this.bitten();
  }
}
