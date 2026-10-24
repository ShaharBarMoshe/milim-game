// The players sold in the shop, as the games draw them. Each has two sprite sheets in the frame layouts
// of the art they replace: `<sprite>_archer` (ARCHER_FRAMES, balloon game) and `<sprite>_jumper`
// (ROBOT_FRAMES, lava level). Measurements are in unscaled frame pixels from the bottom centre.
// The kids come from tools/draw_kids.py, the others from tools/slice_characters.py (gemini-pics/).

const kid = { archer: { w: 208, h: 250, hand: { x: 44, y: 132 } }, jumper: { w: 247, h: 127, waist: 40 }, projectile: 'arrow' };
const fighter = (projectile, hand) => ({ archer: { w: 260, h: 250, hand }, jumper: { w: 247, h: 127, waist: 36 }, projectile });

export const PLAYER_SPRITES = {
  kid_girl: kid,
  kid_boy: kid,
  'char_axe-boy': fighter('axe', { x: 38, y: 118 }),
  'char_axe-scout': fighter('axe', { x: 38, y: 118 }),
  'char_axe-girl': fighter('axe', { x: 38, y: 118 }),
  'char_shadow-mage': fighter('orb_purple', { x: 48, y: 104 }),
  'char_frost-mage': fighter('orb_teal', { x: 48, y: 104 }),
};

// How each projectile flies in the balloon game: its texture, size and spin (radians per second).
export const PROJECTILES = {
  arrow: { texture: 'arrow', scale: 0.48, spin: 0 },
  axe: { texture: 'proj_axe', scale: 0.9, spin: 14 },
  orb_purple: { texture: 'proj_orb_purple', scale: 1, spin: 0 },
  orb_teal: { texture: 'proj_orb_teal', scale: 1, spin: 0 },
};
