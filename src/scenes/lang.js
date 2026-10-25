// The language flag button for the Phaser screens, and shop item texts in the chosen language.
import { isRtl, t, textStyle, toggleLanguage, language } from '../i18n.js';

const FLAG_W = 54;
const FLAG_H = 36;

// A flag button showing the current language (the US flag in English, Israel's in Hebrew). Clicking it
// switches language and restarts the scene with `data`, so every text is drawn again. The hit area is
// 64×48, a little bigger than the flag, so it's easy to tap.
export function addLangButton(scene, x, y, { data, depth = 30, canToggle = () => true } = {}) {
  const frame = scene.add.rectangle(0, 0, FLAG_W + 8, FLAG_H + 8, 0x0f172a, 0.75).setStrokeStyle(2, 0xfef3c7);
  const flag = scene.add.image(0, 0, language() === 'he' ? 'flag_il' : 'flag_us').setDisplaySize(FLAG_W, FLAG_H);
  const button = scene.add.container(x, y, [frame, flag]).setDepth(depth);
  button.setSize(FLAG_W + 10, FLAG_H + 12).setInteractive({ useHandCursor: true });
  button.flag = flag;
  button.label = t('lang.switch');
  // A small tip under the flag on hover: which language it switches to.
  const tip = scene.add.text(x, y + FLAG_H / 2 + 14, t('lang.switch'), {
    fontFamily: 'Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#fef3c7', backgroundColor: '#0f172add', padding: { x: 6, y: 3 },
  }).setOrigin(0.5, 0).setDepth(depth).setVisible(false);
  button.on('pointerover', () => {
    frame.setStrokeStyle(3, 0xfcd34d);
    tip.setVisible(true);
  });
  button.on('pointerout', () => {
    frame.setStrokeStyle(2, 0xfef3c7);
    tip.setVisible(false);
  });
  button.on('pointerup', () => {
    if (!canToggle()) return;
    toggleLanguage();
    scene.scene.restart(data);
  });
  return button;
}

// An item's name, short badge label, "about" line or how long it lasts, from the locale files
// (src/shop.js keeps the English as the fallback).
export const itemText = (it, field) => t(`items.${it.id}.${field}`, { defaultValue: it[field] ?? '' });

// Several centred lines, centred on (x, y). Phaser draws right-to-left text flush right and ignores
// `align`, so in Hebrew each line is its own text, centred, stacked in a container.
export function centeredText(scene, x, y, text, style) {
  if (!isRtl() || !String(text).includes('\n')) return scene.add.text(x, y, text, textStyle(style)).setOrigin(0.5);
  const gap = style.lineSpacing ?? 0;
  const lines = String(text).split('\n').map((line) => scene.add.text(0, 0, line, textStyle(style)).setOrigin(0.5, 0));
  const height = lines.reduce((sum, l) => sum + l.height, 0) + gap * (lines.length - 1);
  let top = -height / 2;
  for (const line of lines) {
    line.setY(top);
    top += line.height + gap;
  }
  const block = scene.add.container(x, y, lines);
  block.text = text; // like a Text, for anyone reading what it says
  return block;
}
