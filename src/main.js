import Phaser from 'phaser';
import PreloadScene from './scenes/PreloadScene.js';
import MapScene from './scenes/MapScene.js';
import GameScene from './scenes/GameScene.js';
import LavaScene from './scenes/LavaScene.js';
import ShopScene from './scenes/ShopScene.js';

// Under test automation (Playwright sets navigator.webdriver) headless Chrome has no GPU and emulates
// WebGL in software, which costs a lot of memory and CPU: draw with plain Canvas there instead.
// Players get WebGL as usual. (Don't cap the frame rate with fps.limit: it drops quick clicks on buttons.)
const automated = navigator.webdriver === true;

const game = new Phaser.Game({
  type: automated ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#8fd3ff',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // Right-click shouldn't open the browser menu over the game.
  disableContextMenu: true,
  scene: [PreloadScene, MapScene, GameScene, LavaScene, ShopScene],
});

// Handy for poking at the game from the browser console during development.
if (import.meta.env.DEV) window.game = game;
