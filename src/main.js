import Phaser from 'phaser';
import PreloadScene from './scenes/PreloadScene.js';
import GameScene from './scenes/GameScene.js';
import LavaScene from './scenes/LavaScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#8fd3ff',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // Right-click shouldn't open the browser menu over the game.
  disableContextMenu: true,
  scene: [PreloadScene, GameScene, LavaScene],
});

// Handy for poking at the game from the browser console during development.
if (import.meta.env.DEV) window.game = game;
