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
   - **📤 Share list** sends the selected list to a friend as a `.txt` file (the text inside is JSON). **WhatsApp** and **Email** open the
     device's share menu with the file attached (phones, and Chrome, Edge and Safari on Windows and Mac): choose
     WhatsApp or Mail there. A web page can't attach a file to a WhatsApp or email link, so where the browser can't
     share files (e.g. Chrome on Linux) the file is downloaded and WhatsApp or the mail app opens with a message,
     for you to attach it. It's `.txt` rather than `.json` because Chrome on Android won't share a `.json` file.
     **⬇ Download file** just saves it. The friend adds it with **📂 Upload list**.
   - **📂 Upload list** adds a list from a word list file, `.txt` or `.json` (1 MB at most), such as one a friend sent.
     See **Word list files** below.
   - Add a word by typing the English in one box and the Hebrew in the other (Enter moves on, Enter again adds).
     Wrong input is explained (Hebrew in the English box, a word already in the list, …) and nothing is added.
   - Edit any word right in the table, or remove it with ✕. An edit that would break the list is undone.
   - **🔓 Unlocked / 🔒 Locked** protects a list: a locked list can be played but not changed or deleted until unlocked.
   - **Delete list** asks for a second click. Every list, ready-made ones included, can be edited unless locked.
   - Everything is saved in the browser. A list typed in the old text box is kept as "My words".
2. **The map**: an old parchment map of the Word Realm with a place for each game. Hover a place to mark it and read
   what it is; click it to play. **Balloon Meadow** is the balloon game. **Lava Crossing** is the lava level, always open; only
   a Hebrew–Hebrew list can't open it, since it spells English words. **Shark Lake** (where a shark's fin circles)
   is the diving game, open under the same rule. **✎ Change words** goes back to the word lists.
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

## Language (English / עברית)

The game's own texts (menus, buttons, hints, the shop) are in English or Hebrew. The flag button switches them: on the
word list screen it sits in the panel's top corner, on the map beside **Change words**, and in the shop beside the
back button. It shows the language in use (the US flag for English, Israel's for Hebrew). In Hebrew the word list
screen and the texts run right to left. The choice is saved in the browser. The words in your lists are never
translated.

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

## Word list files

A shared list is a JSON file:

```json
{
  "app": "milim",
  "version": 1,
  "name": "Animals",
  "kind": "en-he",
  "words": [
    { "en": "dog", "he": "כלב" },
    { "en": "cat", "he": "חתול" }
  ]
}
```

- `kind` is `en-he` (English–Hebrew) or `he-he` (Hebrew–Hebrew, e.g. opposites). Without it, a file whose rows
  are all Hebrew on both sides is Hebrew–Hebrew. `name` defaults to the file name.
- A row can also be a pair in brackets, `["dog", "כלב"]`, and in an English–Hebrew list the two words may come in
  either order. A bare array of rows, or `pairs` in place of `words`, works too.
- Uploading and sharing both check every row the way typing does. A bad row (a word twice,
  Hebrew in the English place, too long, not two words) is left out and the message under the buttons says which
  rows were skipped and why. Only a file or list with no good row at all is refused. A name that's taken gets a
  number ("Animals 2").

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
  success or better. A lava game with every word crossed: +50, and +50 more with no mistakes (the same for a Shark Lake
  game with every word spelled). The end screen
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
| Shark Lake | Shark repellent (the shark starts stunned for 5 s) | one game | 100 |
| | Red / Orange / Purple / Pink / Black wetsuit | skin | 300 each |
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

## Shark Lake (spelling)

Open it from **Shark Lake** on the map. A diver swims in a lake while a shark hunts it. The banner shows the word to
spell (as in the lava level), and three letter bubbles float in the water: the next letter and two wrong ones.

- Swim with the arrow keys (or WASD), or move the mouse over the lake: the diver swims toward it, in four directions.
- Swim into the **right** letter: the shark is stunned for 3 seconds (💫), and the next letter's bubbles appear.
- A **wrong** letter pops its bubble, takes 5 points back and makes the shark lunge closer.
- The shark is slower than the diver. If it catches you, you lose one of 3 lives, the shark is chased off to the far side
  and the diver is safe for a moment. Losing all three ends the game (**Caught!**).
- Points as in the lava level, 5 words per game. **🔊** or **Space** says the word; **Esc** goes back to the map.
- The end screen has **Play again**, **Lava** and **Map**. Practice it directly: `http://localhost:5173/?level=shark`.

## Code

- `tools/slice_characters.py` (`npm run characters`): cuts the five Gemini characters out of `gemini-pics/` (removing the black or white background, grid lines and boxes) and packs their walk, aim, throw, hurt and front poses into the same frame layouts. `src/players.js` lists every player's sheets, throwing hand, rope tie point and projectile.
- `tools/draw_kids.py` (`npm run kids`): draws the girl and boy players as sprite sheets in the same frame layouts as `hunter.png` and `robot.png`.
- `src/scenes/MapScene.js`: the word list screen and the adventure map (drawn in Phaser, styled after `fantasy_rpg_adventure_map.html`).
- `src/vocab.js`: sample pairs, and the old one-text-box word list format (read once to move it into a list).
- `src/wordLists.js`: ready-made lists, `checkPair` validation and `WordLibrary` (create, rename, lock, delete lists; add, edit, remove pairs; `importList` for a shared list; saved in localStorage, never throws).
- `src/listFile.js`: word list files (`toListFile`, `parseListFile`, `listFileName`, `shareMessage`, `fallbackShareUrl`); bad rows are skipped and reported, never thrown.
- `src/score.js`: points for both games (`balloonPoints`, `spellingPoints`, `lengthBonus`) and `WordHistory`, the tricky words (saved in localStorage, never throws).
- `src/shop.js`: the wallet, the catalogue and `Tally`, which saves a game's points into the wallet as they're won.
- `src/quiz.js`: questions, options, scoring and stats (`Quiz`, `shuffle`, `DIRECTIONS`); pass `random` for determinism.
- `src/ballistics.js`: `steer` (homing step) and `missPoint` (where a deliberate miss passes).
- `src/ui/wordListForm.js`: the HTML word-list overlay (HTML so Hebrew typing and RTL work natively).
- `src/i18n.js`: the UI language with [i18next](https://www.i18next.com/) (`initI18n`, `t`, `setLanguage`, `toggleLanguage`, `onLanguageChange`, `textStyle` for right-to-left Phaser text; saved under `balloon-archer-lang`). The texts are key → string config in `src/locales/en.json` and `src/locales/he.json`, which have the same keys.
- `src/scenes/lang.js`: the flag button for the Phaser screens (`addLangButton`), shop item texts (`itemText`) and centred multi-line Hebrew text (`centeredText`).
- `src/spelling.js`: lava-level rules (`spellingWord`, `SpellingRun`, `successRate`).
- `src/speech.js`: spoken words (`Speaker`, `voice`): Wiktionary lookup, 6 s deadline, one word at a time.
- `src/sharkChase.js`: Shark Lake's chase (`Shark`, `moveDiver`, `keyVector`, `pointerVector`, `placeLetters`, `touchedLetter`, `SWIM_ROWS`).
- `src/scenes/SharkScene.js`: Shark Lake. In dev, `getScene('shark')` exposes `state`, `run`, `bubbles`, `diver`, `shark`, `lives`, `score`.
- `tools/slice_divers.py` (`npm run divers`): cuts the diver and the shark out of `gemini-pics/diver.jpeg` and `shark.jpeg` (removing the black and the blue water backgrounds) into `diver.png`, `shark.png` and a recoloured `diver_<suit>.png` per wetsuit.
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
