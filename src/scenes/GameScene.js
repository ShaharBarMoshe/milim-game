import Phaser from 'phaser';
import { ARCHER_FRAMES, BALLOON_COLORS } from './PreloadScene.js';
import { sfx } from '../sound.js';
import { Quiz, DIRECTIONS } from '../quiz.js';
import { steer, missPoint } from '../ballistics.js';
import { showWordListForm, hideWordListForm } from '../ui/wordListForm.js';
import { lavaUnlocked, spellingWord, successRate, UNLOCK_MIN_CORRECT, UNLOCK_SUCCESS } from '../spelling.js';

const W = 1280;
const H = 720;
const GROUND_Y = 640;

const ARCHER_SCALE = 0.62;
const ARCHER_MIN_X = 90;
const ARCHER_MAX_X = 440;
// During a round the hunter rides back and forth on his own, halting only to shoot.
const RIDE_SPEED = 170;
const GALLOP_FPS = 10;
// Bow hand in the hunter frames, relative to the sprite's bottom-centre origin (unscaled px).
const BOW_HAND = { x: 46, y: 187 };

const ARROW_SCALE = 0.48;
const ARROW_SPEED = 1100;
const GRAVITY = 650;
const RELOAD_MS = 520;
// Homing arrows start with a little loft and curve in; the turn rate grows with flight time so
// they always converge, and HOMING_MAX_S is a hard backstop for the "always hits" promise.
const HOMING_LOFT = 0.18;
const HOMING_TURN = 6;
const HOMING_MAX_S = 1.6;
// How far beside the balloon edge a wrong answer's arrow passes.
const MISS_CLEARANCE = 46;

const ROUND_SECONDS = 60;
const WIND_CHANGE_MS = 12000;
const MAX_WIND = 160;

const OPTION_COUNT = 4;
const WAVE_MIN_X = 480;
const WAVE_MAX_X = 1220;
// ~85-100 px/s takes 8-9 s from the grass to off the top: enough time to read every label.
const RISE_MIN = 85;
const RISE_MAX = 98;
const BALLOON_SCALE_MIN = 0.84;
const BALLOON_SCALE_MAX = 0.94;
const LABEL_MAX_WIDTH = 150;
const NEXT_QUESTION_MS = 650;
const REVEAL_MS = 1500;

// Balloon body circle, relative to the 80x141 balloon image centre (the string hangs below it).
const BALLOON_BODY_OFFSET_Y = -21;
const BALLOON_BODY_RADIUS = 38;
// Where the balloon centre sits inside each pop frame (measured from pop_*.png).
const POP_ORIGIN = { x: 0.68, y: 0.47 };

const FONT = 'Trebuchet MS, Arial, sans-serif';
const HEBREW = /[֐-׿]/;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
    this.state = 'setup';
    this.balloons = [];
    this.arrows = [];
    this.quiz = null;
    this.question = null;
    this.pairs = null;
    // Mixed by default: some questions show the English word, others the Hebrew one.
    this.direction = DIRECTIONS.MIXED;
    this.waveId = 0;
    this.wind = 0;
    this.ready = true;
    this.rideDir = 1;
    this.best = loadBest();

    this.drawBackground();
    this.createArcher();
    this.createHud();
    this.createBanner();

    this.aimGuide = this.add.graphics().setDepth(20);
    this.crosshair = this.add.graphics().setDepth(100);
    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 380 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      rotate: { min: 0, max: 360 },
      gravityY: 500,
      lifespan: 650,
      emitting: false,
    }).setDepth(40);

    // No key capture: the word-list textarea must still receive A, D and the arrow keys.
    this.keys = this.input.keyboard.addKeys('A,D,LEFT,RIGHT', false);
    this.input.on('pointerdown', (pointer) => {
      if (pointer.leftButtonDown() && this.state === 'playing') this.handleClick(pointer.worldX, pointer.worldY);
    });
    this.events.once('shutdown', hideWordListForm);

    this.setWind(Phaser.Math.Between(-MAX_WIND / 2, MAX_WIND / 2));
    this.openSetup();
  }

  // ---------------------------------------------------------------- setup

  drawBackground() {
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x5ab8f5, 0x5ab8f5, 0xcdeeff, 0xcdeeff, 1);
    sky.fillRect(0, 0, W, H);

    this.add.circle(1110, 110, 60, 0xfff3a8).setAlpha(0.9);
    this.add.circle(1110, 110, 85, 0xfff3a8).setAlpha(0.25);

    this.clouds = [];
    for (let i = 0; i < 6; i++) {
      const cloud = this.add
        .image(Phaser.Math.Between(0, W), Phaser.Math.Between(40, 330), 'cloud')
        .setAlpha(Phaser.Math.FloatBetween(0.55, 0.9))
        .setScale(Phaser.Math.FloatBetween(0.6, 1.3));
      cloud.drift = Phaser.Math.FloatBetween(8, 22);
      this.clouds.push(cloud);
    }

    // Hills sit behind the balloons; the ground strip is in front so balloons rise out of it.
    const hills = this.add.graphics().setDepth(5);
    hills.fillStyle(0x7cc96b, 1);
    for (let x = -100; x < W + 200; x += 260) hills.fillEllipse(x, GROUND_Y + 20, 420, 190);

    const ground = this.add.graphics().setDepth(30);
    ground.fillStyle(0x5aae4a, 1);
    ground.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ground.fillStyle(0x4a9a3c, 1);
    for (let x = 0; x < W; x += 14) ground.fillTriangle(x, GROUND_Y + 2, x + 7, GROUND_Y - 9, x + 14, GROUND_Y + 2);
    ground.fillStyle(0x8a5a32, 1);
    ground.fillRect(0, GROUND_Y + 40, W, H - GROUND_Y - 40);
  }

  createArcher() {
    this.archer = this.add
      .sprite(200, GROUND_Y + 4, 'hunter', ARCHER_FRAMES.gallopLevel[0])
      .setOrigin(0.5, 1)
      .setScale(ARCHER_SCALE)
      .setDepth(32);
  }

  createHud() {
    const style = { fontFamily: FONT, fontSize: '28px', color: '#ffffff', stroke: '#1d3557', strokeThickness: 6 };
    this.scoreText = this.add.text(24, 18, '', style).setDepth(90);
    this.timeText = this.add.text(W / 2, 18, '', style).setOrigin(0.5, 0).setDepth(90);
    this.accText = this.add.text(W - 24, 18, '', style).setOrigin(1, 0).setDepth(90);
    this.windText = this.add.text(W / 2, 54, '', { ...style, fontSize: '20px' }).setOrigin(0.5, 0).setDepth(90);
    this.comboText = this.add.text(24, 56, '', { ...style, fontSize: '22px', color: '#ffe066' }).setDepth(90);
    this.resetStats();
    this.updateHud();
  }

  createBanner() {
    this.bannerBg = this.add.graphics();
    this.bannerCaption = this.add.text(0, -28, '', {
      fontFamily: FONT, fontSize: '18px', color: '#cfe8ff',
    }).setOrigin(0.5);
    this.bannerWord = this.add.text(0, 10, '', {
      fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: '#ffffff', stroke: '#0b1c2c', strokeThickness: 6,
    }).setOrigin(0.5);
    this.banner = this.add.container(W / 2, 140, [this.bannerBg, this.bannerCaption, this.bannerWord])
      .setDepth(92)
      .setVisible(false);
  }

  setBanner(caption, word, color = '#ffffff') {
    this.bannerCaption.setText(caption);
    this.bannerWord.setRTL(HEBREW.test(word)).setText(word).setColor(color);
    const width = Math.max(260, this.bannerWord.width + 70, this.bannerCaption.width + 50);
    this.bannerBg.clear();
    this.bannerBg.fillStyle(0x1d3557, 0.85).fillRoundedRect(-width / 2, -50, width, 96, 18);
    this.bannerBg.lineStyle(3, 0xffffff, 0.9).strokeRoundedRect(-width / 2, -50, width, 96, 18);
    this.banner.setVisible(true);
  }

  resetStats() {
    this.score = 0;
    this.timeLeft = ROUND_SECONDS;
  }

  hideOverlay() {
    this.overlay?.destroy();
    this.overlay = null;
  }

  // ---------------------------------------------------------------- round flow

  openSetup() {
    this.state = 'setup';
    this.stopTimers();
    this.hideOverlay();
    this.clearWave(false);
    this.banner.setVisible(false);
    this.updateHud();
    showWordListForm({
      initialDirection: this.direction,
      onStart: (pairs, direction) => this.startRound(pairs, direction),
    });
  }

  startRound(pairs = this.pairs, direction = this.direction) {
    hideWordListForm();
    this.hideOverlay();
    this.clearWave(false);
    this.pairs = pairs;
    this.direction = direction;
    this.quiz = new Quiz(pairs, { direction, optionCount: OPTION_COUNT });
    this.resetStats();
    this.state = 'playing';
    this.setWind(Phaser.Math.Between(-MAX_WIND / 2, MAX_WIND / 2));

    this.stopTimers();
    this.windTimer = this.time.addEvent({
      delay: WIND_CHANGE_MS,
      loop: true,
      callback: () => this.setWind(Phaser.Math.Between(-MAX_WIND, MAX_WIND)),
    });
    this.clockTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        this.timeLeft--;
        if (this.timeLeft <= 5 && this.timeLeft > 0) sfx.tick();
        if (this.timeLeft <= 0) this.endRound();
        this.updateHud();
      },
    });
    this.nextQuestion();
    this.updateHud();
  }

  stopTimers() {
    this.clockTimer?.remove();
    this.windTimer?.remove();
    this.clockTimer = this.windTimer = null;
  }

  endRound() {
    this.state = 'over';
    this.stopTimers();
    this.clearWave(true);
    this.banner.setVisible(false);
    const isBest = this.score > this.best;
    if (isBest) {
      this.best = this.score;
      saveBest(this.best);
    }
    this.time.delayedCall(300, () => this.state === 'over' && this.showEndScreen(isBest));
  }

  showEndScreen(isBest) {
    this.hideOverlay();
    const s = this.quiz.stats();
    const items = [];
    const shown = s.missedPairs.slice(0, 12);
    const rows = shown.length > 6 ? Math.ceil(shown.length / 2) : shown.length;
    const extra = s.missedPairs.length > shown.length ? 30 : 0;
    // The lava level spells English words, so a Hebrew–Hebrew list doesn't lead there.
    const canSpell = this.pairs.some((p) => spellingWord(p.en));
    const unlocked = canSpell && lavaUnlocked(s);
    const panelH = 330 + (unlocked ? 50 : 0) + (shown.length ? 80 + rows * 32 + extra : 0);
    const top = H / 2 - panelH / 2;
    items.push(this.add.rectangle(W / 2, H / 2, 820, panelH, 0x1d3557, 0.9).setStrokeStyle(4, 0xffffff));
    items.push(this.add.text(W / 2, top + 50, isBest ? 'NEW BEST!' : "TIME'S UP!", {
      fontFamily: FONT, fontSize: '50px', fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5));
    items.push(this.add.text(W / 2, top + 130,
      `Score: ${this.score}     Best: ${this.best}\n` +
      `Correct: ${s.correct}   Wrong: ${s.wrong}   Missed: ${s.missed}   Success: ${successRate(s)}%\n` +
      `Best streak: ${s.bestStreak}`, {
        fontFamily: FONT, fontSize: '24px', color: '#ffffff', align: 'center', lineSpacing: 8,
      }).setOrigin(0.5));

    if (s.missedPairs.length) {
      items.push(this.add.text(W / 2, top + 210, 'Words to practise', {
        fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffb4a8',
      }).setOrigin(0.5));
      // Two columns of "english – עברית" lines; anything beyond 12 is summarised.
      shown.forEach((p, i) => {
        const col = shown.length > 6 ? (i < Math.ceil(shown.length / 2) ? -1 : 1) : 0;
        const row = col === 1 ? i - Math.ceil(shown.length / 2) : i;
        items.push(this.add.text(W / 2 + col * 190, top + 248 + row * 32, `${p.en}  –  ${p.he}`, {
          fontFamily: FONT, fontSize: '22px', color: '#ffffff',
        }).setOrigin(0.5, 0));
      });
      if (s.missedPairs.length > shown.length) {
        items.push(this.add.text(W / 2, top + 248 + rows * 32, `…and ${s.missedPairs.length - shown.length} more`, {
          fontFamily: FONT, fontSize: '18px', color: '#cfe8ff',
        }).setOrigin(0.5, 0));
      }
    }

    const by = top + panelH - 55;
    if (unlocked) {
      // 90%+ of the questions right opens the lava spelling level.
      items.push(this.add.text(W / 2, by - 62, `🌋 ${successRate(s)}% success — Lava spelling level unlocked!`, {
        fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#ffb36b', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5));
      items.push(this.makeButton(W / 2 - 260, by, 'Play again', 0x2e9e4f, () => this.startRound()));
      items.push(this.makeButton(W / 2, by, 'Lava level', 0xc0480e, () => this.scene.start('lava', { pairs: this.pairs })));
      items.push(this.makeButton(W / 2 + 260, by, 'Edit words', 0x3a6ea5, () => this.openSetup()));
    } else {
      if (canSpell && s.correct + s.wrong + s.missed > 0) {
        // Say why it is still locked; escaped balloons count against success.
        const why = s.correct < UNLOCK_MIN_CORRECT
          ? `Get at least ${UNLOCK_MIN_CORRECT} right and ${UNLOCK_SUCCESS}% success to unlock the lava level`
          : `${successRate(s)}% success${s.missed ? ` (${s.missed} escaped balloons count as misses)` : ''}, need ${UNLOCK_SUCCESS}% for the lava level`;
        items.push(this.add.text(W / 2, by - 50, why, {
          fontFamily: FONT, fontSize: '18px', color: '#cfe8ff',
        }).setOrigin(0.5));
      }
      items.push(this.makeButton(W / 2 - 130, by, 'Play again', 0x2e9e4f, () => this.startRound()));
      items.push(this.makeButton(W / 2 + 130, by, 'Edit words', 0x3a6ea5, () => this.openSetup()));
    }
    this.overlay = this.add.container(0, 0, items).setDepth(95);
  }

  makeButton(x, y, label, color, onClick) {
    const btn = this.add.text(x, y, label, {
      fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
      backgroundColor: Phaser.Display.Color.IntegerToColor(color).rgba,
      padding: { x: 26, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setScale(1.06));
    btn.on('pointerout', () => btn.setScale(1));
    // pointerup, so the same press can't also land as a click in the freshly started round.
    btn.on('pointerup', () => this.state === 'over' && onClick());
    return btn;
  }

  setWind(value) {
    this.wind = value;
    this.updateHud();
  }

  updateHud() {
    const playing = this.state !== 'setup';
    const stats = this.quiz?.stats();
    this.scoreText.setText(playing ? `Score: ${this.score}` : '');
    this.timeText.setText(playing ? `⏱ ${Math.max(0, this.timeLeft)}` : '');
    this.timeText.setColor(this.timeLeft <= 10 ? '#ff6b6b' : '#ffffff');
    this.accText.setText(playing && stats ? `Success: ${successRate(stats)}%` : '');
    const strength = Math.round(Math.abs(this.wind) / 32);
    const dir = (this.wind < 0 ? '◀' : '▶').repeat(strength);
    this.windText.setText(!playing ? '' : strength === 0 ? 'Wind: calm' : `Wind: ${dir} ${strength}`);
    this.comboText.setText(playing && stats?.streak >= 2 ? `Streak x${stats.streak}` : '');
  }

  // ---------------------------------------------------------------- questions & waves

  nextQuestion() {
    if (this.state !== 'playing') return;
    this.clearWave(true);
    this.waveId++;
    this.waveResolved = false;
    this.question = this.quiz.next();
    this.setBanner('Pop the translation of', this.question.prompt);
    this.spawnWave(this.question);
  }

  spawnWave(question) {
    const { options, answer } = question;
    const slot = (WAVE_MAX_X - WAVE_MIN_X) / options.length;
    const colors = Phaser.Utils.Array.Shuffle(Object.keys(BALLOON_COLORS));
    options.forEach((word, i) => {
      const x = WAVE_MIN_X + slot * (i + 0.5) + Phaser.Math.FloatBetween(-0.1, 0.1) * slot;
      // Start just behind the grass (and still inside the canvas), slightly staggered.
      const y = GROUND_Y + 20 + Phaser.Math.Between(0, 50);
      this.balloons.push(this.createBalloon(word, word === answer, x, y, colors[i % colors.length]));
    });
  }

  createBalloon(word, isAnswer, x, y, color) {
    const scale = Phaser.Math.FloatBetween(BALLOON_SCALE_MIN, BALLOON_SCALE_MAX);
    // The container's origin is the balloon body centre, so balloon.x/y is where to click.
    const img = this.add.image(0, -BALLOON_BODY_OFFSET_Y * scale, `balloon_${color}`).setScale(scale);
    const label = this.add.text(0, 0, word, {
      fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#14213d', strokeThickness: 6, align: 'center', rtl: HEBREW.test(word),
    }).setOrigin(0.5);
    if (label.width > LABEL_MAX_WIDTH) label.setScale(LABEL_MAX_WIDTH / label.width);

    const balloon = this.add.container(x, y, [img, label]).setDepth(28);
    balloon.word = word;
    balloon.isAnswer = isAnswer;
    balloon.color = color;
    balloon.img = img;
    balloon.label = label;
    balloon.balloonScale = scale;
    balloon.baseX = x;
    balloon.rise = Phaser.Math.Between(RISE_MIN, RISE_MAX);
    balloon.swayAmp = Phaser.Math.Between(8, 18);
    balloon.swayFreq = Phaser.Math.FloatBetween(0.8, 1.5);
    balloon.phase = Math.random() * Math.PI * 2;
    balloon.tried = false;
    balloon.targeted = false;
    return balloon;
  }

  // Removes the current wave; with `animate`, leftover balloons drift off instead of vanishing.
  clearWave(animate) {
    for (const b of this.balloons) {
      if (animate) {
        this.tweens.add({ targets: b, alpha: 0, y: b.y - 90, duration: 380, onComplete: () => b.destroy() });
      } else {
        b.destroy();
      }
    }
    this.balloons = [];
    if (!animate) {
      this.arrows.forEach((a) => a.destroy());
      this.arrows = [];
    }
  }

  balloonBody(balloon) {
    return { x: balloon.x, y: balloon.y, r: BALLOON_BODY_RADIUS * balloon.balloonScale };
  }

  balloonAt(x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const b of this.balloons) {
      const body = this.balloonBody(b);
      const d = Phaser.Math.Distance.Between(x, y, body.x, body.y);
      // Generous target: the body plus a margin, or anywhere on the (possibly wider) label.
      const onLabel = b.label.getBounds().contains(x, y);
      if ((d < body.r + 12 || onLabel) && d < bestDist) {
        best = b;
        bestDist = d;
      }
    }
    return best;
  }

  handleClick(x, y) {
    if (this.waveResolved) return;
    const balloon = this.balloonAt(x, y);
    // Empty sky (or a balloon already tried) does nothing: no free shots.
    if (!balloon || balloon.tried) return;

    const { correct, points } = this.quiz.answer(balloon.word);
    this.score = Math.max(0, this.score + points);
    if (correct) {
      this.waveResolved = true;
      balloon.targeted = true;
      balloon.award = points;
      this.fireArrow(balloon, true);
      sfx.correct();
    } else {
      balloon.tried = true;
      balloon.img.setAlpha(0.55);
      this.fireArrow(balloon, false);
      sfx.wrong();
      this.floatText(balloon.x, balloon.y - 40, `${points}`, '#ff8a80');
      const answer = this.balloons.find((b) => b.isAnswer);
      if (answer) this.flashBalloon(answer);
      this.tweens.add({ targets: this.banner, x: W / 2 + 10, duration: 50, yoyo: true, repeat: 3, onComplete: () => this.banner.setX(W / 2) });
    }
    this.updateHud();
  }

  // Wave escaped without a correct hit: count it as missed, show the answer, move on.
  waveEscaped() {
    this.waveResolved = true;
    this.quiz.skip();
    this.setBanner('Too late! The answer was', this.question.answer, '#ffd166');
    this.updateHud();
    const id = this.waveId;
    this.time.delayedCall(REVEAL_MS, () => id === this.waveId && this.nextQuestion());
  }

  flashBalloon(balloon) {
    let on = false;
    this.time.addEvent({
      delay: 125,
      repeat: 7,
      callback: () => {
        if (!balloon.active) return;
        on = !on;
        if (on) balloon.img.setTintFill(0xffffff);
        else balloon.img.clearTint();
      },
    });
    this.tweens.add({ targets: balloon, scale: 1.15, duration: 250, yoyo: true, repeat: 1 });
  }

  updateBalloons(time, dt) {
    const t = time / 1000;
    let answerEscaped = false;
    for (const b of this.balloons) {
      b.y -= b.rise * dt;
      // Wind nudges balloons a little, kept small so a wave never bunches up.
      b.baseX += this.wind * 0.03 * dt;
      const sway = Math.sin(t * b.swayFreq + b.phase);
      b.x = b.baseX + sway * b.swayAmp;
      b.rotation = sway * 0.06;
    }
    this.balloons = this.balloons.filter((b) => {
      // A balloon with a homing arrow on the way stays until it is popped.
      if (b.targeted || b.y > -110) return true;
      if (b.isAnswer) answerEscaped = true;
      b.destroy();
      return false;
    });
    // Once the answer is gone the question can't be won, so treat the wave as escaped.
    if (this.state === 'playing' && !this.waveResolved && (answerEscaped || this.balloons.length === 0)) {
      this.waveEscaped();
    }
  }

  popBalloon(balloon, arrow) {
    const body = this.balloonBody(balloon);
    const index = this.balloons.indexOf(balloon);
    if (index >= 0) this.balloons.splice(index, 1);
    balloon.destroy();
    sfx.pop();

    // Sprite-sheet pop, aligned with the arrow's flight direction.
    const pop = this.add
      .sprite(body.x, body.y, `pop_${balloon.color}`)
      .setOrigin(POP_ORIGIN.x, POP_ORIGIN.y)
      .setScale(balloon.balloonScale)
      .setRotation(arrow.rotation)
      .setDepth(36);
    pop.play(`pop_${balloon.color}`);
    pop.on('animationcomplete', () =>
      this.tweens.add({ targets: pop, alpha: 0, duration: 180, onComplete: () => pop.destroy() }),
    );
    // The pop frames already show the arrow piercing the balloon; hide the real one meanwhile.
    arrow.setVisible(false);
    this.time.delayedCall(170, () => arrow.active && arrow.setVisible(true));

    this.sparks.setParticleTint(BALLOON_COLORS[balloon.color]);
    this.sparks.explode(18, body.x, body.y);
    this.floatText(body.x, body.y - 20, `+${balloon.award}`, '#ffffff');

    const id = this.waveId;
    this.time.delayedCall(NEXT_QUESTION_MS, () => id === this.waveId && this.nextQuestion());
  }

  floatText(x, y, label, color) {
    const txt = this.add.text(x, y, label, {
      fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color, stroke: '#1d3557', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: txt, y: txt.y - 60, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => txt.destroy() });
  }

  // ---------------------------------------------------------------- archer & aiming

  launchPoint() {
    const facing = this.archer.flipX ? -1 : 1;
    return new Phaser.Math.Vector2(
      this.archer.x + facing * BOW_HAND.x * ARCHER_SCALE,
      this.archer.y - BOW_HAND.y * ARCHER_SCALE,
    );
  }

  aimAngle() {
    const p = this.input.activePointer;
    const origin = this.launchPoint();
    return Phaser.Math.Angle.Between(origin.x, origin.y, p.worldX, p.worldY);
  }

  updateAim() {
    const p = this.input.activePointer;
    const gallop = ARCHER_FRAMES.gallopLevel;
    if (this.galloping) {
      this.archer.setFlipX(this.rideDir < 0);
      this.archer.setFrame(gallop[Math.floor((this.time.now / 1000) * GALLOP_FPS) % gallop.length]);
    } else {
      this.archer.setFlipX(p.worldX < this.archer.x);
    }

    if (this.ready && !this.galloping) {
      // Pick the pose whose bow angle is closest to where the mouse points.
      const angle = this.aimAngle();
      const elevation = Phaser.Math.RadToDeg(-Math.atan2(Math.sin(angle), Math.abs(Math.cos(angle))));
      const up = ARCHER_FRAMES.aimUp.find(([minElevation]) => elevation >= minElevation);
      if (up) {
        this.archer.setFrame(up[1]);
      } else {
        this.archer.setFrame(gallop[0]);
      }
    }

    // Short direction-only guide: shows which way the hunter is aiming.
    const origin = this.launchPoint();
    const angle = this.aimAngle();
    this.aimGuide.clear();
    if (this.ready && !this.galloping && this.state === 'playing') {
      this.aimGuide.fillStyle(0xffffff, 0.8);
      for (let i = 1; i <= 4; i++) {
        const d = 30 + i * 16;
        this.aimGuide.fillCircle(origin.x + Math.cos(angle) * d, origin.y + Math.sin(angle) * d, 4 - i * 0.6);
      }
    }

    // The pointer itself is a CSS cursor (index.html); a green ring marks a balloon you can still pick.
    this.crosshair.clear();
    if (this.state !== 'playing' || this.waveResolved) return;
    const target = this.balloonAt(p.worldX, p.worldY);
    if (target && !target.tried) {
      this.crosshair.lineStyle(4, 0x2e9e4f, 1).strokeCircle(p.worldX, p.worldY, 24);
      this.crosshair.lineStyle(2, 0xa8ffb0, 1).strokeCircle(p.worldX, p.worldY, 24);
    }
  }

  moveArcher(dt) {
    // Ride only during a round, and halt while shooting and reloading (ready is false then).
    this.galloping = this.state === 'playing' && this.ready;
    if (!this.galloping) return;

    // A / D (or arrows) turn the horse around. Keys aren't captured, so this is skipped
    // outside a round, while the player may be typing the word list.
    if (this.keys.A.isDown || this.keys.LEFT.isDown) this.rideDir = -1;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) this.rideDir = 1;

    this.archer.x += this.rideDir * RIDE_SPEED * dt;
    if (this.archer.x <= ARCHER_MIN_X || this.archer.x >= ARCHER_MAX_X) {
      this.archer.x = Phaser.Math.Clamp(this.archer.x, ARCHER_MIN_X, ARCHER_MAX_X);
      this.rideDir = this.archer.x <= ARCHER_MIN_X ? 1 : -1;
    }
  }

  // Correct answers get a homing arrow that always hits; wrong ones fly past the balloon.
  fireArrow(target, hit) {
    this.archer.setFlipX(target.x < this.archer.x);
    const origin = this.launchPoint();
    const body = this.balloonBody(target);
    const arrow = this.add.image(origin.x, origin.y, 'arrow').setScale(ARROW_SCALE).setDepth(35);
    arrow.halfLength = (arrow.width / 2) * ARROW_SCALE;
    arrow.age = 0;
    arrow.stuck = false;
    arrow.target = target;

    let angle;
    if (hit) {
      arrow.mode = 'homing';
      const side = body.x >= origin.x ? 1 : -1;
      angle = Phaser.Math.Angle.Between(origin.x, origin.y, body.x, body.y) - side * HOMING_LOFT;
    } else {
      arrow.mode = 'miss';
      // Lead the rising balloon, then aim beside where it will be (over its top, on the far side).
      const flight = Phaser.Math.Distance.Between(origin.x, origin.y, body.x, body.y) / ARROW_SPEED;
      const side = body.x >= origin.x ? -1 : 1;
      arrow.aim = missPoint(origin.x, origin.y, body.x, body.y - target.rise * flight, side * (body.r + MISS_CLEARANCE));
      angle = Phaser.Math.Angle.Between(origin.x, origin.y, arrow.aim.x, arrow.aim.y);
    }
    arrow.vx = Math.cos(angle) * ARROW_SPEED;
    arrow.vy = Math.sin(angle) * ARROW_SPEED;
    arrow.setRotation(angle);
    this.arrows.push(arrow);
    sfx.shoot();

    // Release -> reach into the quiver -> nock a new arrow -> ready again.
    this.ready = false;
    this.archer.setFrame(ARCHER_FRAMES.release);
    this.reloadEvents?.forEach((e) => e.remove());
    this.reloadEvents = [
      this.time.delayedCall(RELOAD_MS * 0.3, () => this.archer.setFrame(ARCHER_FRAMES.grabArrow)),
      this.time.delayedCall(RELOAD_MS * 0.65, () => this.archer.setFrame(ARCHER_FRAMES.nock)),
      this.time.delayedCall(RELOAD_MS, () => (this.ready = true)),
    ];
  }

  // ---------------------------------------------------------------- arrows

  updateArrows(dt) {
    for (const arrow of this.arrows) {
      if (arrow.stuck) continue;
      arrow.age += dt;

      if (arrow.mode === 'homing') {
        const target = arrow.target;
        if (!target.active) {
          arrow.mode = 'free';
        } else {
          const body = this.balloonBody(target);
          const turn = HOMING_TURN * (1 + arrow.age * 4);
          ({ vx: arrow.vx, vy: arrow.vy } = steer(arrow.vx, arrow.vy, arrow.x, arrow.y, body.x, body.y, ARROW_SPEED, turn, dt));
          arrow.x += arrow.vx * dt;
          arrow.y += arrow.vy * dt;
          arrow.rotation = Math.atan2(arrow.vy, arrow.vx);
          const tipX = arrow.x + Math.cos(arrow.rotation) * arrow.halfLength;
          const tipY = arrow.y + Math.sin(arrow.rotation) * arrow.halfLength;
          const close = Phaser.Math.Distance.Between(tipX, tipY, body.x, body.y) < body.r + 4 ||
            Phaser.Math.Distance.Between(arrow.x, arrow.y, body.x, body.y) < body.r;
          if (close || arrow.age > HOMING_MAX_S) {
            arrow.mode = 'free';
            this.popBalloon(target, arrow);
          }
          continue;
        }
      } else if (arrow.mode === 'miss') {
        // Straight to the miss point; after passing it the arrow falls away under gravity and wind.
        const ahead = (arrow.aim.x - arrow.x) * arrow.vx + (arrow.aim.y - arrow.y) * arrow.vy;
        if (ahead <= 0) arrow.mode = 'free';
      }

      if (arrow.mode === 'free') {
        arrow.vy += GRAVITY * dt;
        arrow.vx += this.wind * dt;
      }
      arrow.x += arrow.vx * dt;
      arrow.y += arrow.vy * dt;
      arrow.rotation = Math.atan2(arrow.vy, arrow.vx);
      const tipY = arrow.y + Math.sin(arrow.rotation) * arrow.halfLength;

      if (tipY >= GROUND_Y + 14) {
        arrow.stuck = true;
        arrow.y -= tipY - (GROUND_Y + 14);
        sfx.thud();
        this.tweens.add({ targets: arrow, alpha: 0, delay: 1400, duration: 500, onComplete: () => arrow.destroy() });
      } else if (arrow.x < -150 || arrow.x > W + 150 || arrow.y < -400) {
        arrow.destroy();
      }
    }
    this.arrows = this.arrows.filter((a) => a.active && !a.stuck);
  }

  // ---------------------------------------------------------------- loop

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.moveArcher(dt);
    this.updateAim();
    this.updateBalloons(time, dt);
    this.updateArrows(dt);
    for (const c of this.clouds) {
      c.x += (c.drift * Math.sign(this.wind || 1) + this.wind * 0.12) * dt;
      if (c.x > W + 150) c.x = -150;
      if (c.x < -150) c.x = W + 150;
    }
  }
}

function loadBest() {
  try {
    return Number(localStorage.getItem('balloon-archer-best')) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem('balloon-archer-best', String(value));
  } catch {
    // storage unavailable (private mode) — best score just won't persist
  }
}
