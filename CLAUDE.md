# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Balloon Archer: a Phaser 3 (plain ES modules, Vite, no TypeScript) English ↔ Hebrew vocabulary game. README.md describes the gameplay rules in detail; PLAN.md is the original design (partly superseded, e.g. the textarea became saved word lists).

## Commands

```bash
npm run dev                         # Vite dev server, http://localhost:5173 (?level=lava jumps straight to the lava level)
npm test                            # Vitest unit tests (Node, tests/*.test.js)
npx vitest run tests/quiz.test.js   # one unit test file; add -t "name" for one test
npm run test:e2e                    # Playwright e2e in tests/e2e (starts its own Vite on port 5181)
PW_DISABLE_TS_ESM=1 npx playwright test tests/e2e/lava.spec.js -g "unlocks"   # one e2e test
npm run build                       # production build
npm run sprites                     # regenerate public/assets/ from the source JPEGs (Python, Pillow + NumPy)
```

- E2e uses the system Chrome at `/usr/bin/google-chrome`, one worker, and `--strictPort 5181` with `reuseExistingServer: false`, so two e2e runs at once fail with "port already used". The full e2e suite (50 tests) takes 15–30 minutes and is capped at 30 by `globalTimeout`; each test has its own `timeout` (60 s, raised per test with `test.setTimeout`).
- There is no linter configured.

## Architecture

- **Logic and rendering are split.** `src/quiz.js` (questions, scoring, stats), `src/wordLists.js` (`WordLibrary`, `checkPair`, list kinds `en-he` / `he-he`), `src/spelling.js` (lava unlock rule, `SpellingRun`), `src/speech.js` (`Speaker`: Wiktionary recordings via one MediaWiki API request per word, injectable `fetch`/`createAudio`, 6 s deadline per word), `src/ballistics.js` and `src/vocab.js` import no Phaser and are unit-tested in Node. Game rules belong there; scenes only drive them. Functions take an injectable `random` (tests use `mulberry32` from `tests/helpers.js`) and storage (`memoryStorage` in tests stands in for localStorage).
- **Scenes** (`src/main.js`, 1280×720 FIT): `PreloadScene` loads assets, builds the procedural textures, then starts `game` (or `lava` with `?level=lava`). `GameScene` is the balloon round: its state is `setup` → `playing` → `over`, and its end screen opens `LavaScene` with `{ pairs }` when `lavaUnlocked(stats)` passes.
- **The word-list screen is HTML, not Phaser** (`src/ui/wordListForm.js`, an overlay in `index.html`) so Hebrew typing and RTL work natively. `GameScene.openSetup()` shows it, and its `onStart(pairs, direction)` callback starts the round.
- **Two different percentages:** `Quiz.stats().accuracy` is correct ÷ (correct + wrong), while `successRate` in `spelling.js` also counts escaped waves (`missed`) as failures. The lava unlock and the on-screen "Success %" use `successRate` (≥ 90%, at least 5 correct), so letting balloons float away can't unlock the level.
- **Testing hooks:** in dev builds `window.game` is exposed. E2e specs read scene state through it (`getScene('game')` → `state`, `quiz`, `balloons`, `overlay`; `getScene('lava')` → `state`, `run`, `rocks`, `lives`, `score`) and click canvas objects by converting game coordinates to page coordinates (`tests/e2e/play.js`). Keep those fields when refactoring scenes.
- **Sprites:** `tools/slice_sprites.py` cuts `hunter.jpeg`, `lava1.jpeg` and `lava2.jpeg` into `public/assets/` sheets. Frame indices used in code (e.g. `ARCHER_FRAMES`, robot frames in `PreloadScene.js`) must match the frame order the script writes.
- **Speech is fire-and-forget:** scenes call `voice.say(english)` and never await it; `voice.stop()` runs on scene shutdown. E2e tests that need it mock `https://en.wiktionary.org/w/api.php?**` with `page.route` (see `tests/e2e/speech.spec.js`); the rest just get silent failures.
