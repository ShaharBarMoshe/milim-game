import Phaser from 'phaser';
import { ROBOT_FRAMES } from './PreloadScene.js';
import { sfx } from '../sound.js';
import { voice } from '../speech.js';
import { Shop } from '../shop.js';
import { showPerks } from './perks.js';
import { WordHistory, spellingPoints, stageBonus } from '../score.js';
import { PLAYER_SPRITES } from '../players.js';
import { shuffle } from '../quiz.js';
import { SAMPLE_PAIRS } from '../vocab.js';
import { SpellingRun, pickSpellingPairs, typedLetter } from '../spelling.js';
import { t, textStyle } from '../i18n.js';
import { centeredText } from './lang.js';

const W = 1280;
const H = 720;
const LAVA_Y = 660;

const WORDS_PER_GAME = 5;
const LIVES = 3;
const CHOICES = 3; // rocks per letter

const START_X = 150;
const START_TOP = 470;
const COL_GAP = 200;
// One floating rock per height in each column, far enough apart for the robot to stand between.
const ROCK_TOPS = [230, 390, 550];
const ROCK_HALF_W = 58;

const ROBOT_SCALE = 0.78;
const JUMP_MS = 620;
const RESPAWN_MS = 1300; // in the lava: splash, then back on the last safe rock (or game over)
const HANG_Y = LAVA_Y - 8; // a wrong jump leaves the robot dangling just above the lava
const HANG_MS = 650;
const CLIMB_MS = 1700;
const ROBOT_WAIST = 52; // where the rope is tied, above the robot's feet
const CAMERA_LEAD = 360; // robot's distance from the left edge of the view

const FONT = 'Trebuchet MS, Arial, sans-serif';

export default class LavaScene extends Phaser.Scene {
  constructor() {
    super('lava');
  }

  init(data) {
    this.pairs = data?.pairs?.length ? data.pairs : SAMPLE_PAIRS;
  }

  create() {
    this.state = 'playing';
    this.events.once('shutdown', () => voice.stop());
    this.shop = new Shop();
    // Points go into the wallet shared by all the games as they're won.
    this.tally = this.shop.startGame();
    this.history = new WordHistory();
    this.bonus = 0;
    this.lives = LIVES;
    this.score = 0;
    this.spelled = 0;
    this.mistakes = 0;
    this.wordIndex = 0;
    this.rocks = [];
    this.words = pickSpellingPairs(this.pairs, WORDS_PER_GAME);

    this.drawBackground();
    this.lava = this.add.graphics().setDepth(30).setScrollFactor(0);
    this.highlight = this.add.graphics().setDepth(16);
    // A player bought in the shop jumps in place of the robot (same frames).
    const player = this.shop.skin('player');
    const look = player && PLAYER_SPRITES[player.sprite];
    this.waist = look ? look.jumper.waist : ROBOT_WAIST;
    this.robot = this.add
      .sprite(0, 0, look ? `${player.sprite}_jumper` : 'robot', ROBOT_FRAMES.ready)
      .setOrigin(0.5, 1)
      .setScale(ROBOT_SCALE)
      .setDepth(20);
    const skin = this.shop.skin('robot');
    if (skin) this.robot.setTint(skin.tint);
    this.rope = this.add.graphics().setDepth(21); // in front of the robot, so the waist loop shows
    this.ropeFrom = null; // the peg on the rock the robot jumped from, while the rope is out
    this.createHud();

    this.input.on('pointerdown', (pointer) => {
      // Not leftButtonDown(): touch and some touchpads report no button on tap.
      if (pointer.rightButtonDown() || this.state !== 'playing') return;
      const rock = this.rockAt(pointer.worldX, pointer.worldY);
      if (rock) this.jumpTo(rock);
    });
    // Typing a letter jumps onto the rock with that letter, if the next column has one.
    // Esc leaves the game for the map (the points won so far are already saved).
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('map'));
    this.input.keyboard.on('keydown', (event) => {
      if (event.code === 'Space') {
        this.sayWord();
        return;
      }
      if (this.state !== 'playing') return;
      const letter = typedLetter(event, this.run?.lang);
      const rock = letter && this.nextRocks().find((r) => r.letter === letter);
      if (rock) this.jumpTo(rock);
    });

    if (!this.words.length) {
      this.endGame(t('spell.noWords'), t('spell.noWordsDetail'));
      return;
    }
    // Single-use shop items: an extra life is taken at the start of a game; a safety rope only when it
    // catches the robot (each rope saves it once).
    this.extraLife = this.shop.use('lava-life');
    if (this.extraLife) this.lives++;
    this.startWord();
    const ready = [
      this.ropes() && `🪢 ${t('lava.ropes', { n: this.ropes() })}`,
      this.extraLife && `❤ ${t('lava.extraLife', { left: this.shop.count('lava-life') })}`,
    ].filter(Boolean);
    if (ready.length) this.showMessage(t('common.using', { items: ready.join('   ') }), '#fff7c2');
    this.showPerkBar();
  }

  ropes() {
    return this.shop.count('lava-rope');
  }

  // Badges for everything from the shop that's on in this game (the rope with how many are left).
  showPerkBar() {
    this.perkBar?.destroy();
    this.perkBar = showPerks(this, [this.ropes() && ['lava-rope', this.ropes()], this.extraLife && 'lava-life', this.shop.skin('robot')?.id, this.shop.skin('player')?.id], {
      right: W - 24, top: 62,
    });
  }

  // ---------------------------------------------------------------- scenery

  drawBackground() {
    const sky = this.add.graphics().setScrollFactor(0);
    sky.fillGradientStyle(0x14040a, 0x14040a, 0x6a1c08, 0x6a1c08, 1);
    sky.fillRect(0, 0, W, H);

    // Cave walls in two parallax layers.
    [[0.15, 0x2a0c0c, 230], [0.35, 0x1c0808, 330]].forEach(([factor, color, base]) => {
      const g = this.add.graphics().setScrollFactor(factor);
      g.fillStyle(color, 1);
      for (let x = -100; x < W * 3; x += 180) {
        const peak = base - Phaser.Math.Between(40, 150);
        g.fillTriangle(x - 140, LAVA_Y, x, peak, x + 160, LAVA_Y);
      }
    });

    this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: W },
      y: LAVA_Y,
      speedY: { min: -90, max: -30 },
      speedX: { min: -20, max: 20 },
      lifespan: 3200,
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffb040, 0xff6a20, 0xff3010],
      frequency: 90,
    }).setScrollFactor(0).setDepth(31);
  }

  drawLava(time) {
    const t = time / 1000;
    const shift = this.cameras.main.scrollX;
    const surface = (x) => LAVA_Y + Math.sin((x + shift) * 0.018 + t * 1.6) * 6 + Math.sin((x + shift) * 0.05 - t * 2.3) * 3;
    const points = [];
    for (let x = 0; x <= W; x += 16) points.push(new Phaser.Math.Vector2(x, surface(x)));

    const g = this.lava.clear();
    g.fillGradientStyle(0xff7a10, 0xff7a10, 0x8a1600, 0x8a1600, 1);
    g.fillPoints([new Phaser.Math.Vector2(0, H), ...points, new Phaser.Math.Vector2(W, H)], true);
    g.lineStyle(5, 0xffc04a, 1);
    g.strokePoints(points);
    g.fillStyle(0xffd27a, 0.55);
    for (let i = 0; i < 14; i++) {
      const x = (i * 97 + t * 40 * (i % 2 ? 1 : -1) - shift * 0.5) % W;
      g.fillEllipse((x + W) % W, LAVA_Y + 30 + (i % 4) * 22, 40 + (i % 3) * 20, 6);
    }
  }

  // A rock in a container so it can sink as one piece: letter rocks float, start/goal are pillars.
  makeRock(x, top, { letter = null, column = -1, width = ROCK_HALF_W * 2, pillar = false } = {}) {
    const c = this.add.container(x, 0).setDepth(10);
    const g = this.add.graphics();
    const half = width / 2;
    c.add(g);
    if (pillar) this.drawPillar(g, top, half);
    else this.drawFloatingRock(g, top, half);

    if (letter) {
      c.add(this.add.text(0, top + 38, letter, {
        fontFamily: FONT, fontSize: '46px', fontStyle: 'bold', color: '#ffe9b0', stroke: '#2a0f05', strokeThickness: 8,
      }).setOrigin(0.5));
    }
    return { x, y: top, letter, column, container: c, alive: true, halfWidth: half };
  }

  drawFloatingRock(g, top, half) {
    const jag = () => Phaser.Math.Between(-4, 4);
    const V = Phaser.Math.Vector2;
    const outline = [
      new V(-half, top + 8), new V(-half + 8 + jag(), top + 32), new V(-half * 0.6 + jag(), top + 56),
      new V(-half * 0.25, top + 76), new V(jag(), top + 88), new V(half * 0.3, top + 74),
      new V(half * 0.65 + jag(), top + 50), new V(half - 6 + jag(), top + 28), new V(half, top + 8),
    ];
    g.fillStyle(0xff6a00, 0.18).fillEllipse(0, top + 96, half * 1.6, 18);
    g.fillStyle(0x3b302c, 1).fillPoints(outline, true);
    g.fillStyle(0x2a211e, 1).fillPoints([new V(half * 0.2, top + 14), new V(half, top + 8), new V(half - 6, top + 28), new V(half * 0.65, top + 50), new V(half * 0.3, top + 74), new V(half * 0.1, top + 80)], true);
    g.lineStyle(2, 0xff8a2a, 0.5).lineBetween(-half * 0.3, top + 62, -half * 0.05, top + 84);
    g.fillStyle(0x8c7b6b, 1).fillEllipse(0, top + 6, half * 2, 28);
    g.fillStyle(0xa6937f, 1).fillEllipse(-8, top + 2, half * 1.4, 14);
  }

  drawPillar(g, top, half) {
    const width = half * 2;
    const bottom = LAVA_Y + 80;
    const jag = () => Phaser.Math.Between(-5, 5);
    const left = [];
    const right = [];
    for (let y = top + 8; y <= bottom; y += 26) {
      const spread = ((y - top) / (bottom - top)) * 10;
      left.push(new Phaser.Math.Vector2(-half - spread + jag(), y));
      right.push(new Phaser.Math.Vector2(half + spread + jag(), y));
    }
    g.fillStyle(0x3b302c, 1).fillPoints([...left, ...right.reverse()], true);
    g.fillStyle(0x2a211e, 1).fillRect(half * 0.35, top + 14, half * 0.6, bottom - top);
    g.fillStyle(0x56463e, 1).fillRect(-half + 6, top + 14, 10, bottom - top);
    g.lineStyle(2, 0xff8a2a, 0.55);
    g.lineBetween(-half * 0.4, LAVA_Y - 70, -half * 0.1, LAVA_Y);
    g.lineBetween(half * 0.3, LAVA_Y - 40, half * 0.5, LAVA_Y);
    g.fillStyle(0xff6a00, 0.3).fillRect(-half - 10, LAVA_Y - 26, width + 20, 26);
    g.fillStyle(0x8c7b6b, 1).fillEllipse(0, top + 6, width, 30);
    g.fillStyle(0xa6937f, 1).fillEllipse(-8, top + 2, width * 0.7, 16);
  }

  makeFlag(x, top) {
    const g = this.add.graphics().setDepth(11);
    g.fillStyle(0xd9d2c5, 1).fillRect(x + 40, top - 110, 6, 112);
    g.fillStyle(0x3ccf4a, 1).fillTriangle(x + 46, top - 110, x + 110, top - 90, x + 46, top - 70);
    this.worldObjects.push(g);
  }

  // ---------------------------------------------------------------- word flow

  startWord() {
    this.worldObjects?.forEach((o) => o.destroy());
    this.worldObjects = [];
    this.rocks.forEach((r) => r.container.destroy());

    const pair = this.words[this.wordIndex];
    this.run = new SpellingRun(pair, { choices: CHOICES });
    // How tricky the word is as it starts: missing it now makes it worth more next game, not this one.
    this.tricky = this.history.tricky(pair);
    voice.say(this.run.word); // English only: a Hebrew word stays silent
    this.start = this.makeRock(START_X, START_TOP, { pillar: true });
    this.rocks = [];
    this.run.columns.forEach((col, i) => {
      const tops = shuffle(ROCK_TOPS);
      col.letters.forEach((letter, j) => {
        this.rocks.push(this.makeRock(START_X + (i + 1) * COL_GAP, tops[j], { letter, column: i }));
      });
    });
    const goalX = START_X + (this.run.word.length + 1) * COL_GAP + 40;
    this.goal = this.makeRock(goalX, START_TOP, { width: 200, pillar: true });
    this.makeFlag(goalX, START_TOP);
    this.worldObjects.push(this.start.container, this.goal.container);

    this.worldWidth = goalX + 300;
    this.cameras.main.setBounds(0, 0, Math.max(W, this.worldWidth), H);
    this.cameras.main.setScroll(0, 0);
    this.cameras.main.fadeIn(300);

    this.current = this.start;
    this.ropeFrom = null;
    this.robot.setVisible(true).setAlpha(1).setPosition(this.start.x, this.start.y + 6).setFrame(ROBOT_FRAMES.front);
    this.time.delayedCall(500, () => this.state === 'playing' && this.robot.setFrame(ROBOT_FRAMES.ready));
    this.state = 'playing';
    this.updateHud();
  }

  nextRocks() {
    return this.rocks.filter((r) => r.alive && r.column === this.run.position);
  }

  // The next-column rock nearest the pointer: anywhere in the column's band counts, so a click a little
  // beside or between rocks still lands on the closest one.
  rockAt(x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const r of this.nextRocks()) {
      if (Math.abs(x - r.x) > COL_GAP / 2) continue;
      const dist = Math.abs(y - (r.y + 35));
      if (dist < bestDist && dist <= 110) {
        best = r;
        bestDist = dist;
      }
    }
    return best;
  }

  jumpTo(rock) {
    const { correct, done } = this.run.jump(rock.letter);
    this.state = 'jumping';
    sfx.jump();
    if (this.ropes()) this.attachRope(this.current);
    this.animateJump(rock, () => {
      if (!correct) {
        this.sinkInLava(rock);
        return;
      }
      sfx.thud();
      this.detachRope();
      this.current = rock;
      this.flashRock(rock, 0x3ccf4a);
      this.updateHud();
      if (done) {
        this.time.delayedCall(350, () => this.finishWord());
      } else {
        this.state = 'playing';
      }
    }, correct);
  }

  // Crouch, take off, fly in an arc and land; `onLand` runs as the feet touch the target.
  animateJump(target, onLand, settle = true) {
    const fromX = this.robot.x;
    const fromY = this.robot.y;
    const toX = target.x;
    const toY = target.y + 6;
    const height = 100 + Math.max(0, fromY - toY);
    this.robot.setFrame(ROBOT_FRAMES.ready);
    this.time.delayedCall(90, () => {
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: JUMP_MS,
        onUpdate: (tween) => {
          const t = tween.getValue();
          this.robot.x = Phaser.Math.Linear(fromX, toX, t);
          this.robot.y = Phaser.Math.Linear(fromY, toY, t) - 4 * height * t * (1 - t);
          this.robot.setFrame(t < 0.25 ? ROBOT_FRAMES.takeoff : t < 0.8 ? ROBOT_FRAMES.air : ROBOT_FRAMES.land);
        },
        onComplete: () => {
          if (settle) {
            this.robot.setFrame(ROBOT_FRAMES.land);
            this.time.delayedCall(140, () => this.robot.setFrame(ROBOT_FRAMES.settle));
            this.time.delayedCall(300, () => this.state !== 'over' && this.robot.setFrame(ROBOT_FRAMES.ready));
          }
          onLand();
        },
      });
    });
  }

  // ---------------------------------------------------------------- rope

  // Every jump is roped to a peg on the rock it starts from.
  attachRope(rock) {
    this.tweens.killTweensOf(this.rope);
    this.rope.setAlpha(1);
    this.ropeFrom = { x: rock.x + 26, y: rock.y + 4 };
    this.ropeSlack = 1;
  }

  // A safe landing: the rope fades away.
  detachRope() {
    if (!this.ropeFrom) return;
    this.tweens.add({ targets: this.rope, alpha: 0, duration: 250, onComplete: () => (this.ropeFrom = null) });
  }

  drawRope() {
    this.rope.clear();
    if (!this.ropeFrom || !this.robot.visible) return;
    const { x: ax, y: ay } = this.ropeFrom;
    const bx = this.robot.x;
    const by = this.robot.y - this.waist;
    // Slack while flying, straight once the robot hangs on it.
    const sag = this.ropeSlack * Math.min(70, Math.hypot(bx - ax, by - ay) * 0.3);
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(ax, ay - 10),
      new Phaser.Math.Vector2((ax + bx) / 2, (ay + by) / 2 + sag),
      new Phaser.Math.Vector2(bx, by),
    );
    const points = curve.getPoints(20);
    // A light rope with a dark outline, so it shows against the dark rock and the bright lava.
    this.rope.fillStyle(0x2a1606).fillRect(ax - 6, ay - 20, 12, 22); // the peg
    this.rope.fillStyle(0x8a5a2b).fillRect(ax - 4, ay - 18, 8, 18);
    this.rope.lineStyle(8, 0x2a1606).strokePoints(points);
    this.rope.lineStyle(4, 0xf0c27a).strokePoints(points);
    // The loop around the robot's waist.
    this.rope.lineStyle(7, 0x2a1606).strokeEllipse(bx, by, 56, 18);
    this.rope.lineStyle(3.5, 0xf0c27a).strokeEllipse(bx, by, 56, 18);
  }

  // Wrong letter: the rock gives way. A safety rope (from the shop) catches the robot just above the lava:
  // no life is lost, it climbs back to the rock it jumped from, and that rope is used up. Without one
  // the robot falls in.
  sinkInLava(rock) {
    this.state = 'falling';
    this.mistakes++;
    if (this.run.mistakes === 1) this.history.missed(this.run.pair);
    rock.alive = false;
    sfx.wrong();
    this.showMessage(t('spell.wrongLetter', { letter: rock.letter }), '#ff8a6a');
    this.tweens.add({ targets: rock.container, y: LAVA_Y - rock.y + 60, duration: 700, ease: 'Quad.easeIn' });
    this.robot.setFrame(ROBOT_FRAMES.fall);
    if (!this.ropeFrom) {
      this.fallIn(rock);
      return;
    }
    const anchor = this.ropeFrom;
    this.shop.use('lava-rope');
    this.tweens.add({ targets: this, ropeSlack: 0, duration: 400 });
    this.tweens.add({
      targets: this.robot,
      x: anchor.x + 30,
      y: HANG_Y,
      duration: 520,
      ease: 'Quad.easeIn',
      onComplete: () => {
        // The rope jerks tight with the robot's feet over the lava.
        sfx.thud();
        this.cameras.main.shake(180, 0.004);
        const left = this.ropes();
        const ropesLeft = left ? t('lava.ropesLeft', { n: left }) : t('lava.noRopesLeft');
        this.showMessage(`${t('lava.ropeSaved')} ${ropesLeft}`, '#a8ffb0');
        this.showPerkBar();
        this.steamPuffs(this.robot.x);
        this.tweens.add({ targets: this.robot, y: HANG_Y - 16, duration: 140, yoyo: true, repeat: 1, ease: 'Sine.easeOut' });
        this.time.delayedCall(HANG_MS, () => this.climbBack());
      },
    });
  }

  climbBack() {
    if (this.state === 'over') return;
    let frame = 0;
    this.tweens.add({
      targets: this.robot,
      x: this.current.x,
      y: this.current.y + 6,
      duration: CLIMB_MS,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        // Hand over hand: switch between two poses as it rises.
        const step = Math.floor(tween.progress * 10);
        if (step !== frame) {
          frame = step;
          this.robot.setFrame(step % 2 ? ROBOT_FRAMES.frontCrouch : ROBOT_FRAMES.front);
        }
      },
      onComplete: () => {
        this.robot.setFrame(ROBOT_FRAMES.frontLand);
        this.time.delayedCall(250, () => this.state === 'playing' && this.robot.setFrame(ROBOT_FRAMES.ready));
        this.detachRope();
        this.state = 'playing';
        this.showMessage(t('spell.tryAgain'), '#ffd166');
      },
    });
  }

  // Wisps of steam rising from the lava under the dangling robot.
  steamPuffs(x) {
    for (let i = 0; i < 6; i++) {
      const puff = this.add.circle(x + Phaser.Math.Between(-30, 30), LAVA_Y, Phaser.Math.Between(6, 12), 0xffffff, 0.5).setDepth(21);
      this.tweens.add({
        targets: puff,
        y: LAVA_Y - Phaser.Math.Between(60, 110),
        alpha: 0,
        scale: 2,
        delay: i * 90,
        duration: 800,
        onComplete: () => puff.destroy(),
      });
    }
  }

  // Into the lava (the rope, if any, snaps): a life is lost, then back on the last safe rock, or game over.
  fallIn(rock) {
    this.ropeFrom = null;
    this.tweens.add({
      targets: this.robot,
      y: LAVA_Y + 90,
      x: rock.x + 20,
      duration: 520,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.robot.setVisible(false);
        sfx.splash();
        this.cameras.main.shake(250, 0.006);
        const splash = this.add.image(rock.x, LAVA_Y + 50, 'lava_splash').setOrigin(0.5, 1).setDepth(35);
        this.tweens.add({ targets: splash, alpha: 0, delay: 900, duration: 500, onComplete: () => splash.destroy() });
        this.lives--;
        this.updateHud();
      },
    });
    this.time.delayedCall(RESPAWN_MS, () => {
      if (this.state === 'over') return;
      if (this.lives <= 0) {
        voice.say(this.run.word);
        this.endGame(t('lava.burnedOut'), t('spell.theWordWas', { word: this.run.word }));
        return;
      }
      // Back on the last safe rock to try again; the sunken rock is gone.
      this.robot.setPosition(this.current.x, this.current.y + 6).setFrame(ROBOT_FRAMES.front).setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.robot, alpha: 1, duration: 300 });
      this.time.delayedCall(450, () => this.state === 'playing' && this.robot.setFrame(ROBOT_FRAMES.ready));
      this.state = 'playing';
      this.showMessage(t('spell.tryAgain'), '#ffd166');
    });
  }

  finishWord() {
    this.state = 'jumping';
    const points = spellingPoints(this.run.word, { mistakes: this.run.mistakes, tricky: this.tricky });
    if (!this.run.mistakes) this.history.learned(this.run.pair);
    if (this.ropes()) this.attachRope(this.current);
    this.animateJump(this.goal, () => {
      sfx.win();
      voice.say(this.run.word);
      this.detachRope();
      this.score = this.tally.add(points);
      this.spelled++;
      this.robot.setFrame(ROBOT_FRAMES.frontLand);
      this.tweens.add({ targets: this.robot, y: this.robot.y - 30, duration: 180, yoyo: true, repeat: 1 });
      this.showMessage(`${this.run.prompt} = ${this.run.word}   +${points}`, '#a8ffb0');
      this.updateHud();
    }, false);
    this.time.delayedCall(JUMP_MS + 1900, () => {
      if (this.state === 'over') return;
      this.wordIndex++;
      if (this.wordIndex >= this.words.length) this.endGame(t('lava.master'), t('lava.crossedAll'));
      else this.startWord();
    });
  }

  endGame(title, detail) {
    this.state = 'over';
    // Crossing every word earns a stage bonus, on top of the score.
    this.bonus = stageBonus('lava', { spelled: this.spelled, total: this.words.length, mistakes: this.mistakes });
    this.score = this.tally.add(this.bonus);
    this.updateHud();
    const items = [];
    items.push(this.add.rectangle(W / 2, H / 2, 760, 360, 0x2a0c08, 0.92).setStrokeStyle(4, 0xffb040));
    items.push(this.add.text(W / 2, H / 2 - 120, title, textStyle({
      fontFamily: FONT, fontSize: '50px', fontStyle: 'bold', color: '#ffd166', stroke: '#000', strokeThickness: 6,
    })).setOrigin(0.5));
    items.push(centeredText(this, W / 2, H / 2 - 30,
      `${detail}\n${t('spell.summary', { spelled: this.spelled, total: this.words.length, mistakes: this.mistakes })}\n` +
      (this.bonus ? `${t('common.stageBonus', { bonus: this.bonus })}\n` : '') +
      t('spell.pointsLine', { score: this.score, total: this.shop.points }), {
        fontFamily: FONT, fontSize: '24px', color: '#ffffff', align: 'center', lineSpacing: 10,
      }));
    const by = H / 2 + 115;
    const buttons = [
      this.words.length && [t('buttons.playAgain'), 0xc0480e, () => this.scene.restart({ pairs: this.pairs })],
      [t('buttons.balloons'), 0x2e9e4f, () => this.scene.start('game')],
      [t('buttons.map'), 0x3a6ea5, () => this.scene.start('map')],
    ].filter(Boolean);
    buttons.forEach(([label, color, onClick], i) => {
      items.push(this.makeButton(W / 2 + (i - (buttons.length - 1) / 2) * 230, by, label, color, onClick));
    });
    // Not a Container: Phaser hit-tests a fixed (scrollFactor 0) container's children as if they scrolled
    // with the camera, so once the view had moved along the word the buttons couldn't be clicked.
    items.forEach((item) => item.setScrollFactor(0).setDepth(95));
  }

  // ---------------------------------------------------------------- HUD

  createHud() {
    const style = { fontFamily: FONT, fontSize: '28px', color: '#ffffff', stroke: '#2a0f05', strokeThickness: 6 };
    const fixed = (o) => o.setScrollFactor(0).setDepth(90);
    this.livesText = fixed(this.add.text(24, 18, '', { ...style, color: '#ff6b5a' }));
    this.wordText = fixed(this.add.text(24, 58, '', textStyle({ ...style, fontSize: '22px' })).setOrigin(0, 0));
    this.scoreText = fixed(this.add.text(W - 24, 18, '', style).setOrigin(1, 0));

    this.add.rectangle(W / 2, 74, 560, 134, 0x2a0c08, 0.85).setStrokeStyle(3, 0xffb040).setScrollFactor(0).setDepth(89);
    this.promptLabel = fixed(this.add.text(W / 2, 22, t('spell.inEnglish'), textStyle({ fontFamily: FONT, fontSize: '18px', color: '#ffcf99' })).setOrigin(0.5, 0));
    this.promptText = fixed(this.add.text(W / 2, 44, '', {
      fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffffff', rtl: true,
    }).setOrigin(0.5, 0));
    this.progressText = fixed(this.add.text(W / 2, 98, '', {
      fontFamily: 'Courier New, monospace', fontSize: '30px', fontStyle: 'bold', color: '#ffd166',
    }).setOrigin(0.5, 0));
    this.messageText = fixed(this.add.text(W / 2, 170, '', textStyle({ ...style, fontSize: '30px' })).setOrigin(0.5).setAlpha(0));

    // Hear the English word again (or press Space).
    this.sayButton = fixed(this.add.text(W / 2 + 236, 60, '🔊', {
      fontSize: '34px', backgroundColor: '#5a1e0ecc', padding: { x: 8, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }));
    this.sayButton.on('pointerover', () => this.sayButton.setScale(1.12));
    this.sayButton.on('pointerout', () => this.sayButton.setScale(1));
    this.sayButton.on('pointerdown', () => this.sayWord());
    fixed(this.add.text(W / 2 + 236, 102, t('keys.space'), textStyle({ fontFamily: FONT, fontSize: '14px', color: '#ffcf99' })).setOrigin(0.5));
  }

  sayWord() {
    if (!this.run || this.state === 'over') return;
    voice.say(this.run.word);
    this.tweens.add({ targets: this.sayButton, scale: 1.25, duration: 120, yoyo: true });
  }

  updateHud() {
    const hearts = '❤ '.repeat(Math.max(0, this.lives)).trim();
    this.livesText.setText(hearts || '—');
    // The wallet total, which every game adds to, and this game's share of it.
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
    this.tweens.add({ targets: this.messageText, alpha: 0, delay: 1100, duration: 400 });
  }

  flashRock(rock, color) {
    const ring = this.add.ellipse(rock.x, rock.y + 6, rock.halfWidth * 2 + 16, 40).setStrokeStyle(4, color).setDepth(17);
    this.tweens.add({ targets: ring, alpha: 0, scale: 1.3, duration: 500, onComplete: () => ring.destroy() });
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

  update(time, delta) {
    this.drawLava(time);
    this.drawRope();

    // Keep the robot in view as it crosses.
    const cam = this.cameras.main;
    const target = Phaser.Math.Clamp(this.robot.x - CAMERA_LEAD, 0, Math.max(0, (this.worldWidth ?? W) - W));
    cam.scrollX += (target - cam.scrollX) * Math.min(1, (delta / 1000) * 4);

    // Pulse the rocks you can jump to next; the one under the mouse glows brighter.
    this.highlight.clear();
    if (this.state !== 'playing' || !this.run) return;
    const p = this.input.activePointer;
    const hovered = this.rockAt(p.worldX, p.worldY);
    const pulse = 0.45 + Math.sin(time / 180) * 0.25;
    for (const rock of this.nextRocks()) {
      const hot = rock === hovered;
      this.highlight.lineStyle(hot ? 5 : 3, hot ? 0xfff2a0 : 0xffb040, hot ? 1 : pulse);
      this.highlight.strokeEllipse(rock.x, rock.y + 6, rock.halfWidth * 2 + 12, 36);
    }
  }
}
