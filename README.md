# Balloon Archer

A Phaser 3 vocabulary game (English ↔ Hebrew): a mounted hunter (`hunter.jpeg`) shoots the balloon carrying the right translation.

## Play

```bash
npm install
npm run dev        # open the printed http://localhost URL
```

1. **Word list**: type one pair per line, e.g. `dog - כלב` (also `,` `:` `=` `–` `—` or a tab). Hebrew-first lines are
   swapped automatically, blank lines and lines starting with `#` are ignored, and unreadable lines are listed by number.
   Pick a direction (Mixed by default: some questions show the English word, some the Hebrew; or English→Hebrew / Hebrew→English only) and press **Start** (needs at least 2 pairs; Ctrl+Enter works too).
   The list is saved in the browser; the first visit starts with a sample list.
2. **Questions**: the banner shows a word and a wave of balloons rises with candidate translations.
   - Click the right balloon: the arrow homes in and pops it. +10 points, plus 2 per answer in your current streak (up to +10).
   - Click a wrong balloon: the arrow flies past it, −5 points (never below 0), the streak resets and the right balloon flashes.
   - Clicking empty sky does nothing. If the answer floats away, the answer is shown and the next question comes up.
3. After 60 seconds you get your score, correct/wrong/missed counts, accuracy and the words to practise,
   with **Play again** and **Edit words**.

- **Mouse**: the hunter turns and draws the bow toward the cursor.
- The hunter gallops back and forth on his own during a round and halts to shoot. **A / D** or **← / →** turn the horse around.

## Code

- `src/vocab.js`: parse/serialize the word list, sample pairs, localStorage load/save (never throws).
- `src/quiz.js`: questions, options, scoring and stats (`Quiz`, `shuffle`, `DIRECTIONS`); pass `random` for determinism.
- `src/ballistics.js`: `steer` (homing step) and `missPoint` (where a deliberate miss passes).
- `src/ui/wordListForm.js`: the HTML word-list overlay (HTML so Hebrew typing and RTL work natively).
- `src/scenes/GameScene.js`: the game. In dev, `window.game.scene.getScene('game')` exposes `state`, `quiz` and `balloons`.

The first three are Phaser-free and are unit-tested in Node (`npm test`); `npm run test:e2e` drives the game in Chrome.

## Sprites

`tools/slice_sprites.py` (Pillow + NumPy) cuts `hunter.jpeg` into frames along the white gaps between poses, makes the white background transparent, and writes `public/assets/hunter.png`.

The arrow, balloon and pop assets were cut from an earlier balloon/arrow sheet (`Gemini_Generated_Image_ujowyqujowyqujow.jpeg`). That sheet is no longer in the folder, so the script keeps the existing files; put it back to regenerate them.

```bash
npm run sprites    # regenerate public/assets/ from the source JPEGs
```
