# Balloon Archer: test plan

The test strategy for the whole game: the word lists, the map, the three games (balloons, lava, shark), the shop, speech, scoring and
the English/Hebrew UI. It follows the QA conventions of the `qa-expert` skill: test case ids `TC-<AREA>-<NNN>`, priorities
P0–P4 and Arrange–Act–Assert tests. Browser tests follow the `webapp-testing` and `phaser-movement-testing` skills.
Where the skills don't fit this repo, the rules below say how they were adapted.

## Strategy

| Level | Tool | What belongs there | Budget |
|-------|------|--------------------|--------|
| Unit | Vitest (`tests/*.test.js`, Node) | Every rule and edge case: scoring, quiz, spelling, chase physics, shop, storage fallbacks, file import/export, speech queueing, i18n resources | Runs in a few seconds; no limit on the number of tests |
| E2e | Playwright (`tests/e2e/*.spec.js`, system Chrome, Canvas renderer, 800×450) | Core user flows only: the screens connect, input reaches the game, state is saved | About 25 tests, each under 60 s, the suite under 10 min (`globalTimeout`) |

Rules:

- **Logic lives in pure modules** (`src/*.js` without Phaser), so a rule is tested once, in Node, with an injected
  `random` (`mulberry32`) and storage (`memoryStorage` / `throwingStorage`). Scenes only drive those modules.
- **The test seams are `window.game`, `window.i18n` (dev builds) and the scene fields** listed in CLAUDE.md (`state`, `quiz`,
  `run`, `overlay`, `diver`, `shark`, `bubbles`, `langButton`, ...). The e2e specs read state through them and click canvas objects by
  converting game coordinates to page coordinates (`tests/e2e/play.js`).
- **Movement in e2e** (phaser-movement-testing): Phaser reads key *state* in `update()`, so a single key press does nothing.
  Playwright's `keyboard.down` → wait → `keyboard.up` does reach Phaser in real Chrome. Where an exact position matters,
  the specs instead teleport the sprite (`diver.setPosition`) and let `update()` do the collision, which is the "test seam" workaround the skill recommends.
- **Keep e2e light** (memory: a full run once took 1.2 GB): Canvas renderer under `navigator.webdriver`, one worker, no
  `--repeat-each` and no `fps.limit`. During development, run the one spec that covers a change; run the full suite only for broad changes.
- **Mock the network**: Wiktionary is routed with `page.route` in `speech.spec.js`; everything else gets silent failures.
- **Every e2e test checks for page errors** (`pageerror` collected in `beforeEach`, asserted empty in `afterEach`).

### Priorities

| Priority | Meaning here |
|----------|--------------|
| P0 | The game can't be played: a screen doesn't open, a crash, saved data lost |
| P1 | A game rule or a purchase is wrong: wrong scoring, wrong unlocks, points lost |
| P2 | A minor feature or edge case: an odd input, a fallback, layout in one language |
| P3 | Cosmetic: a sprite, an animation, a tint |
| P4 | Docs |

### Quality gates (before a commit or deploy)

- `npm test` is all green.
- The e2e specs touching the change are green. For a change that touches every scene (like i18n), one full `npm run test:e2e` is green.
- `npm run build` succeeds.
- There are no P0 or P1 bugs open.

## Areas, risks and test cases

Status: **exists** means it was already in the suite before this plan; **new** means it was added with this plan.

### 1. Word lists (WL)

Risks: losing the user's lists; bad pairs getting in (both sides English, duplicates); locked lists being changed; Hebrew–Hebrew lists
treated as English; broken import files.

| Id | Pri | Level | Case | File | Status |
|----|-----|-------|------|------|--------|
| TC-WL-001 | P0 | unit | Presets load the first time; storage round trip; broken storage falls back to the presets | tests/wordLists.test.js | exists |
| TC-WL-002 | P1 | unit | `checkPair` rejects empty, same-language and duplicate sides, and tidies spaces | tests/wordLists.test.js | exists |
| TC-WL-003 | P1 | unit | A locked list refuses every edit until it is unlocked, and can still be played | tests/wordLists.test.js | exists |
| TC-WL-004 | P1 | unit | Hebrew–Hebrew lists: kind kept, a kind change allowed only while empty | tests/wordLists.test.js | exists |
| TC-WL-005 | P1 | unit | Import/export file: round trip, bad rows skipped and reported, junk never throws | tests/listFile.test.js | exists |
| TC-WL-006 | P2 | unit | The old textarea format is parsed and migrated | tests/vocab.test.js, tests/wordLists.test.js | exists |
| TC-WL-007 | P0 | e2e | The first visit offers ready-made lists that play at once | tests/e2e/wordlists.spec.js | exists |
| TC-WL-008 | P0 | e2e | A new list is built word by word, saved and played; edit and remove in the table | tests/e2e/wordlists.spec.js | exists |
| TC-WL-009 | P1 | e2e | A locked list stays locked after a reload | tests/e2e/wordlists.spec.js | exists |
| TC-WL-010 | P2 | e2e | Share by WhatsApp or Email (with and without file sharing); JSON upload | tests/e2e/wordlists.spec.js | exists |

### 2. Map and navigation (MAP)

Risks: a place can't be clicked (hit-area bugs have happened); a game wrongly locked; Esc or back buttons leading nowhere.

| Id | Pri | Level | Case | File | Status |
|----|-----|-------|------|------|--------|
| TC-MAP-001 | P0 | e2e | The map opens after a list is chosen and names the list | tests/e2e/map.spec.js | exists |
| TC-MAP-002 | P0 | e2e | Each place (balloons, lava, shark) starts its game with the chosen words | tests/e2e/map.spec.js, tests/e2e/shark.spec.js | exists |
| TC-MAP-003 | P1 | e2e | A Hebrew–Hebrew list opens the lava level, spelled in Hebrew | tests/e2e/map.spec.js | exists |
| TC-MAP-004 | P1 | e2e | Esc in a game goes to the map, and Esc on the map opens the word lists | tests/e2e/map.spec.js | exists |
| TC-MAP-005 | P0 | e2e | Whole flow: win the balloons → lava → map → word lists | tests/e2e/flow.spec.js | exists |

### 3. Balloon game (BAL)

Risks: wrong scoring or streaks; balloons that can't be hit; the end-screen buttons; shop perks not applied.

| Id | Pri | Level | Case | File | Status |
|----|-----|-------|------|------|--------|
| TC-BAL-001 | P1 | unit | Quiz: questions, directions, no repeats, scoring, skip, stats | tests/quiz.test.js | exists |
| TC-BAL-002 | P1 | unit | Ballistics: steering converges and the miss point never hits | tests/ballistics.test.js | exists |
| TC-BAL-003 | P1 | unit | Points: length, streak and tricky-word bonuses; the stage bonus | tests/score.test.js, tests/stageBonus.test.js | exists |
| TC-BAL-004 | P0 | e2e | A right balloon scores, and a wrong one penalises and resets the streak | tests/e2e/game.spec.js | exists |
| TC-BAL-005 | P1 | e2e | The end screen shows success with escapes counted and offers Lava; Play again works | tests/e2e/lava.spec.js | exists |
| TC-BAL-006 | P3 | e2e | A shop player throws its own projectile with no arrow in the pop | tests/e2e/shop.spec.js | exists |

### 4. Lava level (LAVA)

Risks: a word that can't be spelled; the rope or lives logic; keyboard layouts (Hebrew keyboard typing English).

| Id | Pri | Level | Case | File | Status |
|----|-----|-------|------|------|--------|
| TC-LAVA-001 | P1 | unit | `spellingWord` and `spellingTarget` (en and he), `letterChoices`, `SpellingRun` | tests/spelling.test.js | exists |
| TC-LAVA-002 | P1 | unit | `typedLetter` reads the physical key on both layouts | tests/spelling.test.js | exists |
| TC-LAVA-003 | P0 | e2e | Clicking the right rocks spells the word; typing also spells it | tests/e2e/lava.spec.js | exists |
| TC-LAVA-004 | P1 | e2e | A wrong rock drowns the robot and costs a life; with the rope, it is saved once | tests/e2e/lava.spec.js, tests/e2e/shop.spec.js | exists |

### 5. Shark Lake (SHK)

Risks: the diver unable to reach a bubble; the shark stunned forever, or never; a catch costing more than one life; missing suit sheets.

| Id | Pri | Level | Case | File | Status |
|----|-----|-------|------|------|--------|
| TC-SHK-001 | P1 | unit | Swim direction, key and pointer vectors, clamping to the lake | tests/sharkChase.test.js | exists |
| TC-SHK-002 | P1 | unit | The shark's chase, stun (it extends, never shortens), lunge limit and catch radius | tests/sharkChase.test.js | exists |
| TC-SHK-003 | P1 | unit | `placeLetters` keeps its gaps and always terminates; `touchedLetter` picks the nearest | tests/sharkChase.test.js | exists |
| TC-SHK-004 | P0 | e2e | A right bubble stuns the shark, a wrong one brings it closer, and Esc goes to the map | tests/e2e/shark.spec.js | exists |
| TC-SHK-005 | P1 | e2e | Being caught costs lives until game over; Map goes back | tests/e2e/shark.spec.js | exists |
| TC-SHK-006 | P2 | e2e | A bought suit is worn | tests/e2e/shark.spec.js | exists |

### 6. Shop and wallet (SHOP)

Risks: points lost or spent twice; single-use stock not used up; skins in the wrong slot; broken saved data.

| Id | Pri | Level | Case | File | Status |
|----|-----|-------|------|------|--------|
| TC-SHOP-001 | P0 | unit | One wallet for every game, saved; `Tally` saves as points are won | tests/shop.test.js | exists |
| TC-SHOP-002 | P1 | unit | Single use against permanent; refusals don't spend; skins one per slot | tests/shop.test.js | exists |
| TC-SHOP-003 | P1 | unit | Broken storage gives an empty wallet; blocked storage never throws | tests/shop.test.js | exists |
| TC-SHOP-004 | P2 | unit | Prices are balanced against what a game earns | tests/shop.test.js | exists |
| TC-SHOP-005 | P0 | unit | Every sprite sheet the game loads for players, suits and the shark exists in `public/assets` | tests/assets.test.js | **new** |
| TC-SHOP-006 | P0 | e2e | Buying the rope spends the points and the rope saves the robot | tests/e2e/shop.spec.js | exists |

### 7. Speech (SPK)

Risks: overlapping audio; repeated API calls; a refused autoplay never retried; Hebrew words spoken.

| Id | Pri | Level | Case | File | Status |
|----|-----|-------|------|------|--------|
| TC-SPK-001 | P1 | unit | What can be spoken; picking the recording; queueing; deadlines; stop | tests/speech.test.js | exists |
| TC-SPK-002 | P1 | unit | The cache: only new words call the API, a no-recording result expires after 30 days, blocked storage | tests/speech.test.js | exists |
| TC-SPK-003 | P2 | e2e | Words are said in the balloon and lava games; the cache survives a reload | tests/e2e/speech.spec.js | exists |

### 8. English / Hebrew UI (I18N)

Risks: a key missing in one language (the raw key shows on screen); a `{{var}}` missing in one translation; Hebrew text drawn
left-to-right; the language not saved; hard-coded English left in a scene; a flag button that can't be clicked; e2e
tests that find buttons by English label breaking when the language changes.

| Id | Pri | Level | Case | File | Status |
|----|-----|-------|------|------|--------|
| TC-I18N-001 | P0 | unit | en.json and he.json have exactly the same keys | tests/i18n.test.js | **new** |
| TC-I18N-002 | P1 | unit | No empty strings; Hebrew strings contain Hebrew letters | tests/i18n.test.js | **new** |
| TC-I18N-003 | P1 | unit | The same `{{vars}}` in both languages for every key; the `_one`/`_other` plurals come in pairs | tests/i18n.test.js | **new** |
| TC-I18N-004 | P1 | unit | `initI18n`: default en, saved he, broken values fall back to en, throwing storage never throws | tests/i18n.test.js | **new** |
| TC-I18N-005 | P1 | unit | `setLanguage` saves and notifies, ignores unknown codes; unsubscribe works; `toggleLanguage` | tests/i18n.test.js | **new** |
| TC-I18N-006 | P2 | unit | `t()` interpolates in both languages; `isRtl` and `textStyle` add `rtl` only in Hebrew | tests/i18n.test.js | **new** |
| TC-I18N-007 | P1 | unit | No hard-coded English UI text left in the scenes (source scan, documented allowlist) | tests/i18n.test.js | **new** |
| TC-I18N-008 | P2 | unit | Every shop item has a translated name in both languages | tests/i18n.test.js | **new** |
| TC-I18N-009 | P0 | e2e | The word-list form's flag switches to Hebrew: `<html dir=rtl lang=he>` and the he.json texts | tests/e2e/i18n.spec.js | **new** |
| TC-I18N-010 | P0 | e2e | The map's flag button switches the title to Hebrew, and the choice survives a reload | tests/e2e/i18n.spec.js | **new** |
| TC-I18N-011 | P1 | e2e | A Hebrew end-screen button works by its Hebrew label | tests/e2e/i18n.spec.js | **new** |
| TC-I18N-012 | P3 | manual | Hebrew layout fits at 1280×720: the map, the shop, the three games and their end screens (screenshots) | — | manual |

## E2e budget

There are about 35 e2e tests after this plan, over the target of about 25. Merge candidates, best first:

- the two "Play again" / end-screen tests in `lava.spec.js` (TC-BAL-005);
- the WhatsApp/Email pair in `wordlists.spec.js` (TC-WL-010), which could become one test;
- `game.spec.js`, whose scoring rules are fully covered by `tests/quiz.test.js`; only "clicking a balloon hits it" needs e2e.

None were removed with this plan. They are recorded here so the next cleanup has a list to start from.

## Running

```bash
npm test                                   # all unit tests (seconds)
PW_DISABLE_TS_ESM=1 npx playwright test tests/e2e/i18n.spec.js   # one spec
npm run test:e2e                           # the full e2e suite: only for broad changes
```
