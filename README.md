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
   - **📂 Upload file** makes a new list from a `.txt`, `.csv` or `.tsv` file (under 1 MB), named after the file.
     One pair per line, English and Hebrew in either order, separated by a comma, tab, ` - `, `=`, `:`, `;` and so
     on (`dog,כלב`, `"cat";"חתול"`, `בית - house`). Blank lines, lines starting with `#` and a header row
     (`english,hebrew`) are skipped. A file whose lines are Hebrew on both sides becomes a Hebrew–Hebrew list.
     Lines that aren't a good pair (a word twice, too long, no separator) are left out, and the message under the
     buttons says which. The file needs at least 2 good pairs.
   - Add a word by typing the English in one box and the Hebrew in the other (Enter moves on, Enter again adds).
     Wrong input is explained (Hebrew in the English box, a word already in the list, …) and nothing is added.
   - Edit any word right in the table, or remove it with ✕. An edit that would break the list is undone.
   - **🔓 Unlocked / 🔒 Locked** protects a list: a locked list can be played but not changed or deleted until unlocked.
   - **Delete list** asks for a second click. Every list, ready-made ones included, can be edited unless locked.
   - Everything is saved in the browser. A list typed in the old text box is kept as "My words".
2. **The map**: an old parchment map of the Word Realm with a place for each game. Hover a place to mark it and read
   what it is; click it to play. **Balloon Meadow** is the balloon game. **Lava Crossing** is the lava level, always open; only
   a Hebrew–Hebrew list can't open it, since it spells English words. **✎ Change words** goes back to the word lists.
3. **Questions**: the banner shows a word and a wave of balloons rises with candidate translations.
   - Click the right balloon: the arrow homes in and pops it. +10 points, plus 2 per answer in your current streak (up to +10),
     plus the long word and tricky word bonuses (see **Points** below).
   - Click a wrong balloon: the arrow flies past it, −5 points (never below what you had when the round started), the streak resets and the right balloon flashes.
   - Clicking empty sky does nothing. If the answer floats away, the answer is shown and the next question comes up.
4. After 60 seconds you get your score (the points this round added), correct/wrong/missed counts, accuracy and the words to practise,
   with **Play again**, **Lava level** and **Map**.

- **Esc** in a game or the shop goes back to the map (points won so far are already saved); **Esc** on the map
  opens the word lists.
- **Mouse**: the hunter turns and draws the bow toward the cursor.
- The hunter gallops back and forth on his own during a round and halts to shoot. **A / D** or **← / →** turn the horse around.

## Spoken words

The English word of each question is said out loud, using the pronunciation recordings on
[Wiktionary](https://en.wiktionary.org) (free, no key needed). Each word is looked up once and the answer is saved in
the browser, so only new words call the API (a word with no recording is checked again after 30 days):

- Balloons: when the question starts, whether it shows the English word or the Hebrew one, and again when the
  question ends (popped or escaped).
- Lava: when a word starts, and again when it is crossed (or lost).
- Words with anything other than English letters are skipped. Only words and phrases that Wiktionary has an
  English recording of are said (e.g. "dog", "ice cream"); others stay silent. A failed request, or one with no answer within 6 seconds, is
  skipped too; the game never waits for speech.

## Points

All the games share one total, saved in the browser. It never starts again from 0: the top left of each game
shows the total (🪙) and, in brackets, what this round or game has added. Points are saved the moment you win
them, so leaving a game early with **Esc** keeps them.

- **Long words** are worth more. In the balloon game, every letter past 4 in the longer of the two words adds
  2 points (up to +12: *house* +2, *morning* +6, *butterfly* +10). In the lava level every letter is 10 points.
- **Tricky words** are worth more: a word you got wrong in an earlier game adds +5 a balloon (+10 a lava word)
  for each time you missed it, up to twice. Answering it right with no mistakes takes one away. A word you miss
  now becomes tricky from the next question it comes up in, not the current one.
- **Completing a stage** earns a bonus. A balloon round with at least 5 right answers: +30, and +30 more at 80%
  success or better. A lava game with every word crossed: +50, and +50 more with no mistakes. The end screen
  shows it as ⭐ Stage bonus.
- A typical game earns about 200–300 points with the stage bonus, and the shop prices follow that: a single-use item costs about half
  a game, a skin a couple of games, and the best players about five.

## Trading Post (shop)

The points from every game go into the shop's wallet, also shown on the map. The **Trading Post** sign on the map opens the shop: a grid of items, one row per game.
Choose an item to see its price and confirm (**Buy** / **Cancel**); the points are taken off straight away.

Some items are **used up** and can be bought again and again; the shop card shows how many you have left.
More time, Slow balloons and Extra life each last one round or game: a new game of their kind (Play again
included) takes one from your stock and says so on screen. A **Safety rope** is used only when it saves you.
The others are **permanent**: upgrades work for good, and skins can be worn or taken off for free by clicking
them again.

| Game | Item | Kind | Points |
| --- | --- | --- | --- |
| Balloon Meadow | More time (+15 s) | one round | 150 |
| | Slow balloons (rise a quarter slower) | one round | 100 |
| | Fire arrows | permanent | 300 |
| | Golden archer / Night rider | skin | 400 / 300 |
| Lava Crossing | Safety rope (catches you once; you keep your life) | one save | 100 |
| | Extra life (4 instead of 3) | one game | 150 |
| | Gold robot / Ice robot | skin | 400 / 300 |
| Players | Girl / Boy (run and shoot arrows) | skin | 600 / 600 |
| | Axe warrior / Axe scout / Axe girl (throw a spinning axe) | skin | 800 each |
| | Shadow mage / Frost mage (cast magic orbs) | skin | 1000 each |

During a game, badges at the top right show every shop item it has on (green border: used up this game; gold: permanent).

While you have ropes, every jump is roped: a wrong letter leaves the robot hanging just above the lava, it
climbs back and keeps its life, and that rope is gone. With no ropes left, a wrong letter drops the robot into
the lava: it loses a life and comes back on the last safe rock. Points,
items, the stock and worn skins are saved in the browser (`src/shop.js`).

## Lava level (spelling)

Open it from **Lava Crossing** on the map or the balloon end screen's **Lava level** button. A robot crosses a lava lake on floating rocks: the banner shows the Hebrew word (e.g. כלב) and each column of rocks holds one letter of the English word plus two wrong letters. Jump d → o → g to reach the flag.

- Click a rock in the next column, or just type the letter.
- The English word is said when it starts; **🔊** in the banner (or **Space**) says it again. A word the browser
  wouldn't play before your first click or key press plays then.
- A wrong letter sinks its rock. With a **Safety rope** from the shop (every jump is then roped to a peg on the
  rock it starts from) the robot dangles just above the lava, keeps its life and climbs back; that rope is used
  up. Without one it falls into the lava, loses one of 3 lives and comes back on the last safe rock.
- The end screen has **Play again**, **Balloons** and **Map**.
- 10 points per letter, +20 for a word with no mistakes, +10 for each earlier miss of a tricky word. 5 words per game, taken from your list (single words of 2–12 letters; Hebrew–Hebrew lists are spelled in Hebrew).
- Practice it directly: open `http://localhost:5173/?level=lava` (uses the chosen word list).

## Code

- `tools/slice_characters.py` (`npm run characters`): cuts the five Gemini characters out of `gemini-pics/` (removing the black or white background, grid lines and boxes) and packs their walk, aim, throw, hurt and front poses into the same frame layouts. `src/players.js` lists every player's sheets, throwing hand, rope tie point and projectile.
- `tools/draw_kids.py` (`npm run kids`): draws the girl and boy players as sprite sheets in the same frame layouts as `hunter.png` and `robot.png`.
- `src/scenes/MapScene.js`: the word list screen and the adventure map (drawn in Phaser, styled after `fantasy_rpg_adventure_map.html`).
- `src/vocab.js`: sample pairs, and the old one-text-box word list format (read once to move it into a list).
- `src/wordLists.js`: ready-made lists, `checkPair` validation and `WordLibrary` (create, rename, lock, delete lists; add, edit, remove pairs; saved in localStorage, never throws).
- `src/score.js`: points for both games (`balloonPoints`, `spellingPoints`, `lengthBonus`) and `WordHistory`, the tricky words (saved in localStorage, never throws).
- `src/shop.js`: the wallet, the catalogue and `Tally`, which saves a game's points into the wallet as they're won.
- `src/quiz.js`: questions, options, scoring and stats (`Quiz`, `shuffle`, `DIRECTIONS`); pass `random` for determinism.
- `src/ballistics.js`: `steer` (homing step) and `missPoint` (where a deliberate miss passes).
- `src/ui/wordListForm.js`: the HTML word-list overlay (HTML so Hebrew typing and RTL work natively).
- `src/spelling.js`: lava-level rules (`spellingWord`, `SpellingRun`, `successRate`).
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
