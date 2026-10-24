// A row of small badges in a game's HUD, one for each shop item active in this game.
import { item } from '../shop.js';

const ICONS = {
  'balloons-time': '⏱', 'balloons-slow': '🎈', 'balloons-fire': '🔥', 'archer-gold': '🏇', 'archer-night': '🌙',
  'lava-rope': '🪢', 'lava-life': '❤', 'robot-gold': '✨', 'robot-ice': '❄', 'player-girl': '👧', 'player-boy': '👦',
  'player-axe-boy': '🪓', 'player-axe-scout': '🪓', 'player-axe-girl': '🪓', 'player-shadow-mage': '🔮', 'player-frost-mage': '🧊',
};
const BADGE_W = 66;
const BADGE_H = 58;
const GAP = 8;
const FONT = 'Trebuchet MS, Arial, sans-serif';

// Draws the badges right-aligned so the last one ends at `right`; returns their container (or null).
// Each entry is an item id, or [id, count] to show how many are left.
export function showPerks(scene, entries, { right, top, depth = 90 }) {
  const counts = {};
  const items = entries
    .filter(Boolean)
    .map((e) => (Array.isArray(e) ? ((counts[e[0]] = e[1]), e[0]) : e))
    .map(item)
    .filter(Boolean);
  if (!items.length) return null;
  const parts = [];
  items.forEach((it, i) => {
    const x = right - (items.length - i) * (BADGE_W + GAP) + GAP + BADGE_W / 2;
    const g = scene.add.graphics();
    g.fillStyle(0x0f172a, 0.72).fillRoundedRect(x - BADGE_W / 2, top, BADGE_W, BADGE_H, 10);
    g.lineStyle(2, it.kind === 'single' ? 0x34d399 : 0xfcd34d, 0.9).strokeRoundedRect(x - BADGE_W / 2, top, BADGE_W, BADGE_H, 10);
    const icon = scene.add.text(x, top + 20, ICONS[it.id] ?? '★', { fontSize: '24px', color: '#ffffff' }).setOrigin(0.5);
    const label = scene.add.text(x, top + 45, `${it.short ?? it.name}${counts[it.id] ? ` ×${counts[it.id]}` : ''}`, {
      fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#f8fafc',
    }).setOrigin(0.5);
    parts.push(g, icon, label);
  });
  const bar = scene.add.container(0, 0, parts).setDepth(depth).setScrollFactor(0);
  bar.perkIds = items.map((it) => it.id);
  return bar;
}
