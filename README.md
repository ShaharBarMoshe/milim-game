# Balloon Archer

A Phaser 3 vocabulary game (English ↔ Hebrew): a mounted hunter (`hunter.jpeg`) shoots the balloon carrying the right translation.

## Play

```bash
npm install
npm run dev        # open the printed http://localhost URL
```

1. **Word lists**: pick a list (Everyday words, Animals, Food, Home, School, Colors, Opposites, or your own) and press
   **To the map** (needs at least 2 pairs; Ctrl+Enter works too). Pick a direction first if you like: Mixed by default (some questions
   show the English word, some the Hebrew), or English→Hebrew / Hebrew→English only.
   - **+ New list** makes an empty list; type its name in the name box.
   - Add a word by typing the English in one box and the Hebrew in the other (Enter moves on, Enter again adds).
     Wrong input is explained (Hebrew in the English box, a word already in the list, …) and nothing is added.
   - Edit any word right in the table, or remove it with ✕. An edit that would break the list is undone.
   - **🔓 Unlocked / 🔒 Locked** protects a list: a locked list can be played but not changed or deleted until unlocked.
   - **Delete list** asks for a second click. Every list, ready-made ones included, can be edited unless locked.
   - Everything is saved in the browser. A list typed in the old text box is kept as "My words".
2. **The map**: an old parchment map of the Word Realm with a place for each game. Hover a place to mark it and read
   what it is; click it to play. **Balloon Meadow** is the balloon game. **Lava Crossing** (the lava level) stays
   locked until you win a balloon round (see below); after that it's open for every list, and the map
   announces it the first time back. A Hebrew–Hebrew list
   can't open it, since it spells English words. **✎ Change words** goes back to the word lists.
3. **Questions**: the banner shows a word and a wave of balloons rises with candidate translations.
   - Click the right balloon: the arrow homes in and pops it. +10 points, plus 2 per answer in your current streak (up to +10).
   - Click a wrong balloon: the arrow flies past it, −5 points (never below 0), the streak resets and the right balloon flashes.
   - Clicking empty sky does nothing. If the answer floats away, the answer is shown and the next question comes up.
4. After 60 seconds you get your score, correct/wrong/missed counts, accuracy and the words to practise,
   with **Play again**, **Lava level** (once it's unlocked) and **Map**.

- **Mouse**: the hunter turns and draws the bow toward the cursor.
- The hunter gallops back and forth on his own during a round and halts to shoot. **A / D** or **← / →** turn the horse around.

## Spoken words

The English word of each question is said out loud, using the pronunciation recordings on
[Wiktionary](https://en.wiktionary.org) (free, no key needed; one API request per word, cached):

- Balloons: when the question shows the English word, and again when the question ends (popped or escaped).
  When the question shows the Hebrew word, the English word is the answer, so it is only said at the end.
- Lava: when a word starts, and again when it is crossed (or lost).
- Words with anything other than English letters are skipped. Only words and phrases that Wiktionary has an
  English recording of are said (e.g. "dog", "ice cream"); others stay silent. A failed request, or one with no answer within 6 seconds, is
  skipped too; the game never waits for speech.

## Lava level (spelling)

Get **90% or more** of a balloon round right (escaped waves count as misses, at least 5 correct) and the end screen offers the **Lava level**, which also opens Lava Crossing on the map. A robot crosses a lava lake on floating rocks: the banner shows the Hebrew word (e.g. כלב) and each column of rocks holds one letter of the English word plus two wrong letters. Jump d → o → g to reach the flag.

- Click a rock in the next column, or just type the letter.
- Every jump is roped to a peg on the rock it starts from. On a right letter the rope disappears once the robot lands.
- A wrong letter sinks its rock: the robot drops on the rope until it dangles just above the lava, loses one of 3 lives,
  and climbs back to the rock it jumped from. On the last life the rope snaps and the robot falls into the lava.
- The end screen has **Play again**, **Balloons** and **Map**.
- 10 points per letter, +20 for a word with no mistakes. 5 words per game, taken from your list (single English words of 2–8 letters).
- Practice it directly: open `http://localhost:5173/?level=lava` (uses the chosen word list).

## Code

- `src/scenes/MapScene.js`: the word list screen and the adventure map (drawn in Phaser, styled after `fantasy_rpg_adventure_map.html`).
- `src/progress.js`: whether the lava level is open on the map (localStorage, never throws).
- `src/vocab.js`: sample pairs, and the old one-text-box word list format (read once to move it into a list).
- `src/wordLists.js`: ready-made lists, `checkPair` validation and `WordLibrary` (create, rename, lock, delete lists; add, edit, remove pairs; saved in localStorage, never throws).
- `src/quiz.js`: questions, options, scoring and stats (`Quiz`, `shuffle`, `DIRECTIONS`); pass `random` for determinism.
- `src/ballistics.js`: `steer` (homing step) and `missPoint` (where a deliberate miss passes).
- `src/ui/wordListForm.js`: the HTML word-list overlay (HTML so Hebrew typing and RTL work natively).
- `src/spelling.js`: lava-level rules (`lavaUnlocked`, `spellingWord`, `SpellingRun`).
- `src/speech.js`: spoken words (`Speaker`, `voice`): Wiktionary lookup, 6 s deadline, one word at a time.
- `src/scenes/LavaScene.js`: the lava level. In dev, `getScene('lava')` exposes `state`, `run`, `rocks`, `lives`, `score`.
- `src/scenes/GameScene.js`: the game. In dev, `window.game.scene.getScene('game')` exposes `state`, `quiz` and `balloons`.

The first three are Phaser-free and are unit-tested in Node (`npm test`); `npm run test:e2e` drives the game in Chrome.

## Sprites

`tools/slice_sprites.py` (Pillow + NumPy) cuts `hunter.jpeg` into frames along the white gaps between poses, makes the white background transparent, and writes `public/assets/hunter.png`.

For the lava level it reads `lava1.jpeg` (jumps that end in the lava) and `lava2.jpeg` (jumps that land), cuts the robot out of the rocks and lava drawn under it, and writes `robot.png` (9 frames) and `lava_splash.png`.

The arrow, balloon and pop assets were cut from an earlier balloon/arrow sheet (`Gemini_Generated_Image_ujowyqujowyqujow.jpeg`). That sheet is no longer in the folder, so the script keeps the existing files; put it back to regenerate them.

```bash
npm run sprites    # regenerate public/assets/ from the source JPEGs
```
