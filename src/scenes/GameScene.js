import Phaser from 'phaser';
import { ARCHER_FRAMES, BALLOON_COLORS } from './PreloadScene.js';
import { sfx } from '../sound.js';

const W = 1280;
const H = 720;
const GROUND_Y = 640;

const ARCHER_SCALE = 0.62;
const ARCHER_MIN_X = 90;
const ARCHER_MAX_X = 380;
const ARCHER_WALK_SPEED = 260;
const GALLOP_FPS = 10;
// Bow hand in the hunter frames, relative to the sprite's bottom-centre origin (unscaled px).
const BOW_HAND = { x: 46, y: 187 };

const ARROW_SCALE = 0.48;
const ARROW_SPEED = 1150;
const GRAVITY = 650;
const RELOAD_MS = 520;

const ROUND_SECONDS = 60;
const WIND_CHANGE_MS = 12000;
const MAX_WIND = 160;

// Balloon body circle, relative to the 80x141 balloon image centre (the string hangs below it).
const BALLOON_BODY_OFFSET_Y = -21;
const BALLOON_BODY_RADIUS = 38;
// Where the balloon centre sits inside each pop frame (measured from pop_*.png).
const POP_ORIGIN = { x: 0.68, y: 0.47 };

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
    this.state = 'title';
    this.balloons = [];
    this.arrows = [];
    this.wind = 0;
    this.ready = true;
    this.best = loadBest();

    this.drawBackground();
    this.createArcher();
    this.createHud();

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

    this.keys = this.input.keyboard.addKeys('A,D,LEFT,RIGHT');
    this.input.on('pointerdown', (pointer) => {
      if (!pointer.leftButtonDown()) return;
      if (this.state === 'playing') this.shoot();
      else this.startRound();
    });

    // Idle balloons drift on the title screen so there is something to aim at.
    this.spawnTimer = this.time.addEvent({ delay: 900, loop: true, callback: () => this.spawnBalloon() });
    this.fillSky();
    this.showOverlay('BALLOON ARCHER', 'Aim with the mouse  •  Left click to shoot\nA / D to ride  •  Watch the wind!', 'Click to start');
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
    const style = { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '28px', color: '#ffffff', stroke: '#1d3557', strokeThickness: 6 };
    this.scoreText = this.add.text(24, 18, '', style).setDepth(90);
    this.timeText = this.add.text(W / 2, 18, '', style).setOrigin(0.5, 0).setDepth(90);
    this.accText = this.add.text(W - 24, 18, '', style).setOrigin(1, 0).setDepth(90);
    this.windText = this.add.text(W / 2, 58, '', { ...style, fontSize: '22px' }).setOrigin(0.5, 0).setDepth(90);
    this.comboText = this.add.text(24, 56, '', { ...style, fontSize: '22px', color: '#ffe066' }).setDepth(90);
    this.resetStats();
    this.updateHud();
  }

  resetStats() {
    this.score = 0;
    this.shots = 0;
    this.hits = 0;
    this.combo = 0;
    this.timeLeft = ROUND_SECONDS;
  }

  showOverlay(title, body, prompt) {
    this.hideOverlay();
    const bg = this.add.rectangle(W / 2, H / 2 - 20, 720, 330, 0x1d3557, 0.82).setStrokeStyle(4, 0xffffff);
    const t = this.add.text(W / 2, H / 2 - 130, title, {
      fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '54px', fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);
    const b = this.add.text(W / 2, H / 2 - 20, body, {
      fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '26px', color: '#ffffff', align: 'center', lineSpacing: 10,
    }).setOrigin(0.5);
    const p = this.add.text(W / 2, H / 2 + 90, prompt, {
      fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '30px', color: '#a8ffb0', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.tweens.add({ targets: p, alpha: 0.35, duration: 650, yoyo: true, repeat: -1 });
    this.overlay = this.add.container(0, 0, [bg, t, b, p]).setDepth(95);
  }

  hideOverlay() {
    this.overlay?.destroy();
    this.overlay = null;
  }

  // ---------------------------------------------------------------- round flow

  startRound() {
    this.hideOverlay();
    this.balloons.forEach((b) => b.destroy());
    this.balloons = [];
    this.resetStats();
    this.state = 'playing';
    this.setWind(Phaser.Math.Between(-MAX_WIND / 2, MAX_WIND / 2));

    this.fillSky();
    this.spawnTimer.reset({ delay: 750, loop: true, callback: () => this.spawnBalloon() });
    this.windTimer?.remove();
    this.windTimer = this.time.addEvent({
      delay: WIND_CHANGE_MS,
      loop: true,
      callback: () => this.setWind(Phaser.Math.Between(-MAX_WIND, MAX_WIND)),
    });
    this.clockTimer?.remove();
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
    this.updateHud();
  }

  endRound() {
    this.state = 'over';
    this.clockTimer.remove();
    this.windTimer.remove();
    const isBest = this.score > this.best;
    if (isBest) {
      this.best = this.score;
      saveBest(this.best);
    }
    const acc = this.shots ? Math.round((this.hits / this.shots) * 100) : 0;
    this.time.delayedCall(300, () =>
      this.showOverlay(
        isBest ? 'NEW BEST!' : "TIME'S UP!",
        `Score: ${this.score}     Best: ${this.best}\nBalloons popped: ${this.hits}     Accuracy: ${acc}%`,
        'Click to play again',
      ),
    );
  }

  setWind(value) {
    this.wind = value;
    this.updateHud();
  }

  updateHud() {
    const playing = this.state !== 'title';
    this.scoreText.setText(`Score: ${this.score}`);
    this.timeText.setText(playing ? `⏱ ${Math.max(0, this.timeLeft)}` : '');
    this.timeText.setColor(this.timeLeft <= 10 ? '#ff6b6b' : '#ffffff');
    const acc = this.shots ? Math.round((this.hits / this.shots) * 100) : 0;
    this.accText.setText(`Accuracy: ${acc}%`);
    const strength = Math.round(Math.abs(this.wind) / 32);
    const dir = (this.wind < 0 ? '◀' : '▶').repeat(strength);
    this.windText.setText(strength === 0 ? 'Wind: calm' : `Wind: ${dir} ${strength}`);
    this.comboText.setText(this.combo >= 2 ? `Combo x${this.combo}` : '');
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
    this.archer.setFlipX(p.worldX < this.archer.x);

    if (this.ready) {
      // Pick the pose whose bow angle is closest to where the mouse points.
      const angle = this.aimAngle();
      const elevation = Phaser.Math.RadToDeg(-Math.atan2(Math.sin(angle), Math.abs(Math.cos(angle))));
      const up = ARCHER_FRAMES.aimUp.find(([minElevation]) => elevation >= minElevation);
      if (up) {
        this.archer.setFrame(up[1]);
      } else {
        // Level shots use the gallop cycle, animated while the horse is moving.
        const gallop = ARCHER_FRAMES.gallopLevel;
        const step = this.galloping ? Math.floor((this.time.now / 1000) * GALLOP_FPS) % gallop.length : 0;
        this.archer.setFrame(gallop[step]);
      }
    }

    // Short direction-only guide: shows where the arrow leaves, not where it lands.
    const origin = this.launchPoint();
    const angle = this.aimAngle();
    this.aimGuide.clear();
    if (this.ready && this.state === 'playing') {
      this.aimGuide.fillStyle(0xffffff, 0.8);
      for (let i = 1; i <= 4; i++) {
        const d = 30 + i * 16;
        this.aimGuide.fillCircle(origin.x + Math.cos(angle) * d, origin.y + Math.sin(angle) * d, 4 - i * 0.6);
      }
    }

    this.crosshair.clear();
    this.crosshair.lineStyle(3, this.ready ? 0xffffff : 0xff6b6b, 0.95);
    this.crosshair.strokeCircle(p.worldX, p.worldY, 14);
    this.crosshair.lineBetween(p.worldX - 22, p.worldY, p.worldX - 8, p.worldY);
    this.crosshair.lineBetween(p.worldX + 8, p.worldY, p.worldX + 22, p.worldY);
    this.crosshair.lineBetween(p.worldX, p.worldY - 22, p.worldX, p.worldY - 8);
    this.crosshair.lineBetween(p.worldX, p.worldY + 8, p.worldX, p.worldY + 22);
  }

  moveArcher(dt) {
    const left = this.keys.A.isDown || this.keys.LEFT.isDown;
    const right = this.keys.D.isDown || this.keys.RIGHT.isDown;
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    this.galloping = dir !== 0;
    if (!dir) return;
    this.archer.x = Phaser.Math.Clamp(this.archer.x + dir * ARCHER_WALK_SPEED * dt, ARCHER_MIN_X, ARCHER_MAX_X);
  }

  shoot() {
    if (!this.ready) return;
    this.ready = false;
    const angle = this.aimAngle();
    const origin = this.launchPoint();

    const arrow = this.add.image(origin.x, origin.y, 'arrow').setScale(ARROW_SCALE).setRotation(angle).setDepth(35);
    arrow.vx = Math.cos(angle) * ARROW_SPEED;
    arrow.vy = Math.sin(angle) * ARROW_SPEED;
    arrow.halfLength = (arrow.width / 2) * ARROW_SCALE;
    arrow.popped = 0;
    arrow.stuck = false;
    this.arrows.push(arrow);
    this.shots++;
    sfx.shoot();

    // Release -> reach into the quiver -> nock a new arrow -> ready again.
    this.archer.setFrame(ARCHER_FRAMES.release);
    this.time.delayedCall(RELOAD_MS * 0.3, () => this.archer.setFrame(ARCHER_FRAMES.grabArrow));
    this.time.delayedCall(RELOAD_MS * 0.65, () => this.archer.setFrame(ARCHER_FRAMES.nock));
    this.time.delayedCall(RELOAD_MS, () => (this.ready = true));
    this.updateHud();
  }

  // ---------------------------------------------------------------- balloons

  spawnBalloon(y = H + 90) {
    if (this.state === 'over') return;
    const colors = Object.keys(BALLOON_COLORS);
    const color = Phaser.Utils.Array.GetRandom(colors);
    const scale = Phaser.Math.FloatBetween(0.5, 0.85);
    // Difficulty ramps up over the round: balloons rise faster near the end.
    const progress = this.state === 'playing' ? 1 - this.timeLeft / ROUND_SECONDS : 0;
    const speed = Phaser.Math.Between(55, 110) * (1 + progress * 0.9) * (1.25 - scale * 0.4);

    const balloon = this.add.image(0, y, `balloon_${color}`).setScale(scale).setDepth(28);
    balloon.color = color;
    balloon.baseX = Phaser.Math.Between(520, W - 60);
    balloon.rise = speed;
    balloon.swayAmp = Phaser.Math.Between(10, 40);
    balloon.swayFreq = Phaser.Math.FloatBetween(0.8, 1.8);
    balloon.phase = Math.random() * Math.PI * 2;
    balloon.points = scale < 0.62 ? 25 : scale < 0.74 ? 15 : 10;
    balloon.x = balloon.baseX;
    this.balloons.push(balloon);
  }

  // Start with balloons already mid-air instead of waiting for them to rise from the ground.
  fillSky() {
    for (let i = 0; i < 5; i++) this.spawnBalloon(Phaser.Math.Between(180, GROUND_Y - 60));
  }

  balloonBody(balloon) {
    return {
      x: balloon.x - Math.sin(balloon.rotation) * BALLOON_BODY_OFFSET_Y * balloon.scale,
      y: balloon.y + Math.cos(balloon.rotation) * BALLOON_BODY_OFFSET_Y * balloon.scale,
      r: BALLOON_BODY_RADIUS * balloon.scale,
    };
  }

  updateBalloons(time, dt) {
    const t = time / 1000;
    for (const b of this.balloons) {
      b.y -= b.rise * dt;
      // Wind nudges balloons too, so the field shifts along with your arrows.
      b.baseX += this.wind * 0.08 * dt;
      const sway = Math.sin(t * b.swayFreq + b.phase);
      b.x = b.baseX + sway * b.swayAmp;
      b.rotation = sway * 0.08;
    }
    this.balloons = this.balloons.filter((b) => {
      if (b.y > -120 && b.x > -100 && b.x < W + 100) return true;
      b.destroy();
      return false;
    });
  }

  popBalloon(balloon, arrow) {
    const body = this.balloonBody(balloon);
    this.balloons.splice(this.balloons.indexOf(balloon), 1);
    balloon.destroy();

    arrow.popped++;
    this.hits++;
    this.combo++;
    const multi = arrow.popped; // several balloons with one arrow multiplies the reward
    const gained = balloon.points * multi + Math.min(this.combo - 1, 10) * 2;
    this.score += gained;
    sfx.pop();

    // Sprite-sheet pop, aligned with the arrow's flight direction.
    const pop = this.add
      .sprite(body.x, body.y, `pop_${balloon.color}`)
      .setOrigin(POP_ORIGIN.x, POP_ORIGIN.y)
      .setScale(balloon.scale)
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

    const label = multi > 1 ? `+${gained}  x${multi}!` : `+${gained}`;
    const txt = this.add.text(body.x, body.y - 20, label, {
      fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: multi > 1 ? '34px' : '26px', fontStyle: 'bold', color: '#ffffff', stroke: '#1d3557', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: txt, y: txt.y - 60, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => txt.destroy() });
    this.updateHud();
  }

  // ---------------------------------------------------------------- arrows

  updateArrows(dt) {
    for (const arrow of this.arrows) {
      if (arrow.stuck) continue;
      const prevTipX = arrow.x + Math.cos(arrow.rotation) * arrow.halfLength;
      const prevTipY = arrow.y + Math.sin(arrow.rotation) * arrow.halfLength;

      arrow.vy += GRAVITY * dt;
      arrow.vx += this.wind * dt;
      arrow.x += arrow.vx * dt;
      arrow.y += arrow.vy * dt;
      arrow.rotation = Math.atan2(arrow.vy, arrow.vx);

      const tipX = arrow.x + Math.cos(arrow.rotation) * arrow.halfLength;
      const tipY = arrow.y + Math.sin(arrow.rotation) * arrow.halfLength;

      // Sweep the tip along this frame's path so fast arrows can't skip through a balloon.
      const steps = 4;
      for (let s = 1; s <= steps; s++) {
        const x = Phaser.Math.Linear(prevTipX, tipX, s / steps);
        const y = Phaser.Math.Linear(prevTipY, tipY, s / steps);
        for (const balloon of [...this.balloons]) {
          const body = this.balloonBody(balloon);
          if (Phaser.Math.Distance.Between(x, y, body.x, body.y) < body.r) this.popBalloon(balloon, arrow);
        }
      }

      if (tipY >= GROUND_Y + 14) {
        arrow.stuck = true;
        arrow.y -= tipY - (GROUND_Y + 14);
        sfx.thud();
        this.arrowFinished(arrow);
        this.tweens.add({ targets: arrow, alpha: 0, delay: 1400, duration: 500, onComplete: () => arrow.destroy() });
      } else if (arrow.x < -150 || arrow.x > W + 150) {
        this.arrowFinished(arrow);
        arrow.destroy();
      }
    }
    this.arrows = this.arrows.filter((a) => a.active && !a.stuck);
  }

  arrowFinished(arrow) {
    if (arrow.popped === 0 && this.state === 'playing') {
      this.combo = 0;
      this.updateHud();
    }
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
