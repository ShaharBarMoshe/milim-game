// The old-paper look shared by the map and the shop.
import Phaser from 'phaser';

export const W = 1280;
export const H = 720;
export const FONT = 'Georgia, "Times New Roman", serif';
export const INK = 0x4a2a0c; // dark brown map ink
export const PARCHMENT = 0xdcc498;

export function drawParchment(scene) {
  const g = scene.add.graphics().setDepth(0);
  g.fillStyle(PARCHMENT).fillRect(0, 0, W, H);
  // Stains and blotches of old paper.
  const rnd = new Phaser.Math.RandomDataGenerator(['word-realm']);
  for (let i = 0; i < 70; i++) {
    g.fillStyle(rnd.pick([0xc9ad7a, 0xe8d5ac, 0xbf9f6a]), rnd.realInRange(0.12, 0.3));
    g.fillCircle(rnd.between(0, W), rnd.between(0, H), rnd.between(10, 70));
  }
  g.lineStyle(1, INK, 0.08);
  for (let x = 0; x <= W; x += 80) g.lineBetween(x, 0, x, H);
  for (let y = 0; y <= H; y += 80) g.lineBetween(0, y, W, y);
  // Burnt, darker edges.
  for (let i = 0; i < 28; i++) {
    g.lineStyle(4, 0x4e2a0c, 0.05 + (28 - i) * 0.012);
    g.strokeRect(i * 4, i * 4, W - i * 8, H - i * 8);
  }
  g.lineStyle(3, INK, 0.7).strokeRect(14, 14, W - 28, H - 28);
  g.lineStyle(1, INK, 0.5).strokeRect(22, 22, W - 44, H - 44);
  return g;
}

// A small wooden signpost reading SHOP, drawn around (0, 0) for a container.
export function drawShopSign(scene) {
  const g = scene.add.graphics();
  g.fillStyle(0x5b3a1a).fillRect(-4, -4, 8, 34); // the post
  g.fillStyle(0x8a5a2b).fillRoundedRect(-30, -24, 60, 26, 4);
  g.lineStyle(2, 0x3b1f08).strokeRoundedRect(-30, -24, 60, 26, 4);
  const text = scene.add.text(0, -11, 'SHOP', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#fef3c7' }).setOrigin(0.5);
  return [g, text];
}
