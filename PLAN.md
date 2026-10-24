# Plan: Educational Balloon Archer (English ↔ Hebrew)

## Goal
Turn Balloon Archer into a vocabulary game. The player enters English–Hebrew word pairs.
Each question shows one word; the balloons carry candidate translations. Clicking the
balloon with the correct translation makes the hunter's arrow fly to it and pop it (+score).
Clicking a wrong balloon makes the arrow miss, costs points and resets the streak.

## Gameplay
> **Later change:** the textarea was replaced by saved word lists (`src/wordLists.js`): ready-made lists plus the
> player's own, each editable until locked, with one field per English and Hebrew word. See the README.

1. **Word list screen** (HTML overlay above the canvas — needed for proper Hebrew/RTL typing):
   - `<textarea>` with one pair per line: `english - hebrew` (separators accepted: `-`, `–`, `—`, `,`, `:`, `=`, tab).
   - Shows a parse summary (N valid pairs, list of invalid line numbers).
   - Direction select: English→Hebrew (default), Hebrew→English, Mixed.
   - "Start" is disabled until there are at least 2 valid pairs.
   - List is saved in `localStorage` and pre-filled next time; a built-in sample list is used the first time.
2. **Question**: a banner at the top shows the prompt word (e.g. `dog`). A wave of
   `min(4, pairs.length)` balloons rises, each labelled with one option (one correct, the rest distractors
   from other pairs, no duplicates).
3. **Click a balloon**:
   - Correct → arrow is launched from the bow and *homes* onto that balloon (guaranteed hit), pop animation,
     `+10 + streak bonus`, next question after a short delay.
   - Wrong → arrow launched toward it but deliberately misses (passes beside it), `-5` (score never < 0),
     streak reset, correct balloon flashes for 1s, the question stays.
   - Clicking empty sky does nothing (no free shots).
4. If every balloon in a wave escapes off the top without a correct hit → counts as a miss, the correct
   answer is shown briefly, next question.
5. Round = 60s (as now). End screen: score, correct/wrong counts, accuracy, list of words missed,
   buttons "Play again" and "Edit words".
6. Hunter, wind visuals, gallop (A/D) and sound stay. Wind no longer affects a correct arrow's outcome.

## Architecture
Pure, Phaser-free logic modules (unit-testable in Node) + Phaser scenes that use them.

### `src/vocab.js`
```js
export const SAMPLE_PAIRS: {en: string, he: string}[]   // ~12 everyday words
export function parseWordList(text: string): { pairs: {en, he}[], errors: {line: number, text: string}[] }
//  - one pair per line; trims; skips blank lines and lines starting with '#'
//  - splits on the FIRST separator among: tab, ' - ', '-', '–', '—', ',', ':', '='
//  - left side must contain Latin letters, right side must contain Hebrew letters (U+0590–U+05FF);
//    if reversed (Hebrew left, English right) it is swapped automatically
//  - en is lower-cased for comparison purposes but original casing kept in `en`
//  - duplicate pairs (same en+he, case-insensitive en) are dropped silently
//  - line numbers in errors are 1-based
export function serializeWordList(pairs): string           // "en - he" lines, round-trips through parseWordList
export function loadWordList(storage = globalThis.localStorage): string | null  // never throws
export function saveWordList(text: string, storage = globalThis.localStorage): void  // never throws
export const STORAGE_KEY = 'balloon-archer-words'
```

### `src/quiz.js`
```js
export const DIRECTIONS = { EN_HE: 'en-he', HE_EN: 'he-en', MIXED: 'mixed' }
export class Quiz {
  constructor(pairs, { direction = 'en-he', optionCount = 4, random = Math.random } = {})
  // throws Error if fewer than 2 pairs
  next(): { prompt: string, answer: string, options: string[], direction: 'en-he'|'he-en' }
  //  - picks a random pair, avoiding the same pair twice in a row when pairs.length > 1
  //  - options: length min(optionCount, pairs.length), contains answer exactly once, all unique,
  //    distractors are same-language words from other pairs, order shuffled
  //  - for MIXED each question randomly picks en-he or he-en
  current: question | null
  answer(option: string): { correct: boolean, points: number }
  //  - correct: points = 10 + 2 * min(streak, 5) where streak counts previous consecutive correct answers
  //  - wrong:  points = -5; streak resets
  //  - answering when current is null throws
  skip(): void                // wave escaped: counts as missed, streak resets, records the pair
  stats(): { correct, wrong, missed, streak, bestStreak, accuracy /*0..100 int*/, missedPairs: {en,he}[] }
}
export function shuffle(array, random = Math.random): array   // returns a new array (Fisher–Yates)
```

### `src/ballistics.js`
```js
// Homing step for a guaranteed hit: turns velocity toward the target by at most maxTurn rad/s.
export function steer(vx, vy, fromX, fromY, toX, toY, speed, maxTurn, dt): { vx, vy }
// Point for a deliberate miss: target offset perpendicular to the line of fire by `offset` px.
export function missPoint(fromX, fromY, toX, toY, offset): { x, y }
```

### Phaser changes
- `src/ui/wordListForm.js` — builds/destroys the HTML overlay form (uses vocab.js). Exports
  `showWordListForm({ initialText, onStart(pairs, direction) })` and `hideWordListForm()`.
- `GameScene.js` — question banner, balloons become containers (balloon image + text label, Hebrew labels
  with `rtl: true`), pointer click on a balloon instead of free shooting, homing arrows for correct
  answers, near-miss arrows for wrong ones, end screen with missed words. Remove the free-aim crosshair
  shot; keep aim pose (hunter points toward the cursor).
- `window.game` dev hook stays (tests use it). The scene exposes `scene.quiz` and `scene.balloons`
  (each balloon container has `.word: string` and `.isAnswer: boolean`) and `scene.state`
  ('setup' | 'playing' | 'over').
- DOM ids for tests: `#word-form`, `#word-input`, `#word-summary`, `#word-direction`, `#word-start`.

## Testing
- **Unit (Vitest, Node)**: `tests/vocab.test.js`, `tests/quiz.test.js`, `tests/ballistics.test.js`
  covering every rule above (seeded random for determinism).
- **E2E (Playwright + system Chrome `/usr/bin/google-chrome`)**: `tests/e2e/game.spec.js` — starts Vite,
  enters a word list, starts, clicks the correct balloon (found via `window.game`), asserts score rises;
  clicks a wrong balloon, asserts streak reset and penalty.
- Scripts: `npm test` (unit), `npm run test:e2e`.

## Work split
- **Coder agent**: `src/**`, `index.html`, README. Must not edit `package.json` or `tests/`.
- **Test agent**: `tests/**`, `vitest.config.js`, `playwright.config.js`, `package.json` (devDeps + scripts).
  Writes tests against the interfaces above, without waiting for the code.
- Then: run all tests, fix mismatches, commit.
