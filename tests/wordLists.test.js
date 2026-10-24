import { describe, it, expect } from 'vitest';
import { KINDS, LIBRARY_KEY, MIN_PAIRS, PRESET_LISTS, WordLibrary, checkPair } from '../src/wordLists.js';
import { STORAGE_KEY } from '../src/vocab.js';
import { memoryStorage, throwingStorage, HEBREW_RE, LATIN_RE } from './helpers.js';

const stored = (storage) => JSON.parse(storage.getItem(LIBRARY_KEY));

describe('PRESET_LISTS', () => {
  it('are playable lists of clean pairs of their kind', () => {
    expect(PRESET_LISTS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(PRESET_LISTS.map((l) => l.id)).size).toBe(PRESET_LISTS.length);
    for (const list of PRESET_LISTS) {
      expect(list.pairs.length).toBeGreaterThanOrEqual(MIN_PAIRS);
      list.pairs.reduce((kept, p) => {
        expect(checkPair(p.en, p.he, kept, -1, list.kind ?? KINDS.EN_HE)).toEqual({ ok: true, pair: p });
        return [...kept, p];
      }, []);
    }
  });
});

describe('checkPair', () => {
  it('accepts a pair and tidies spaces', () => {
    expect(checkPair('  good   morning ', ' בוקר  טוב ')).toEqual({ ok: true, pair: { en: 'good morning', he: 'בוקר טוב' } });
  });

  it.each([
    ['', 'כלב', 'en'],
    ['כלב', 'כלב', 'en'],
    ['123', 'כלב', 'en'],
    ['dog', '', 'he'],
    ['dog', 'dog', 'he'],
    ['dog', 'כלב dog', 'he'],
    ['a'.repeat(31), 'כלב', 'en'],
  ])('rejects %j / %j on the %s side', (en, he, field) => {
    const check = checkPair(en, he);
    expect(check.ok).toBe(false);
    expect(check.field).toBe(field);
    expect(check.error).toBeTruthy();
  });

  it('rejects a word already in the list, on either side, ignoring English case', () => {
    const list = [{ en: 'dog', he: 'כלב' }];
    expect(checkPair('Dog', 'כלבלב', list)).toMatchObject({ ok: false, field: 'en' });
    expect(checkPair('puppy', 'כלב', list)).toMatchObject({ ok: false, field: 'he' });
  });

  it('lets the edited pair keep its own words', () => {
    const list = [{ en: 'dog', he: 'כלב' }, { en: 'cat', he: 'חתול' }];
    expect(checkPair('Dog', 'כלב', list, 0).ok).toBe(true);
    expect(checkPair('cat', 'כלב', list, 0).ok).toBe(false);
  });
});

describe('WordLibrary.load', () => {
  it('starts with the preset lists, the first one selected', () => {
    const library = WordLibrary.load(memoryStorage());
    expect(library.lists.map((l) => l.name)).toEqual(PRESET_LISTS.map((l) => l.name));
    expect(library.selectedId).toBe(PRESET_LISTS[0].id);
    expect(library.lists.every((l) => l.locked === false)).toBe(true);
  });

  it('edits never change the presets themselves', () => {
    const library = WordLibrary.load(memoryStorage());
    library.removePair(PRESET_LISTS[1].id, 0);
    expect(WordLibrary.load(memoryStorage()).get(PRESET_LISTS[1].id).pairs).toEqual(PRESET_LISTS[1].pairs);
  });

  it('turns a list from the old text box into "My words", selected', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: 'dog - כלב\nbad line\nsun - שמש' });
    const library = WordLibrary.load(storage);
    expect(library.selected.name).toBe('My words');
    expect(library.selected.pairs).toEqual([{ en: 'dog', he: 'כלב' }, { en: 'sun', he: 'שמש' }]);
    expect(library.lists).toHaveLength(PRESET_LISTS.length + 1);
    expect(stored(storage).selectedId).toBe(library.selectedId);
  });

  it('does not migrate the old list again once lists are saved', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: 'dog - כלב' });
    const first = WordLibrary.load(storage);
    first.remove(first.selectedId);
    expect(WordLibrary.load(storage).lists.some((l) => l.name === 'My words')).toBe(false);
  });

  it('round-trips lists, lock state and selection', () => {
    const storage = memoryStorage();
    const library = WordLibrary.load(storage);
    const list = library.create('Trip');
    library.addPair(list.id, 'sea', 'ים');
    library.setLocked(list.id, true);
    const again = WordLibrary.load(storage);
    expect(again.selected).toEqual({ id: list.id, name: 'Trip', kind: KINDS.EN_HE, locked: true, pairs: [{ en: 'sea', he: 'ים' }] });
  });

  it.each(['not json', '{"lists": []}', '{"lists": "x"}', 'null', '[1,2]'])('falls back to presets for %j', (raw) => {
    const library = WordLibrary.load(memoryStorage({ [LIBRARY_KEY]: raw }));
    expect(library.lists.map((l) => l.id)).toEqual(PRESET_LISTS.map((l) => l.id));
  });

  it('drops broken lists and pairs from storage, and an unknown selection', () => {
    const raw = JSON.stringify({
      selectedId: 'gone',
      lists: [
        { id: 'a', name: 'A', locked: 'yes', pairs: [{ en: 'dog', he: 'כלב' }, { en: 'כלב', he: 'dog' }, null, { en: 'DOG', he: 'כלבה' }] },
        { name: 'no id' },
        null,
      ],
    });
    const library = WordLibrary.load(memoryStorage({ [LIBRARY_KEY]: raw }));
    expect(library.lists).toEqual([{ id: 'a', name: 'A', kind: KINDS.EN_HE, locked: false, pairs: [{ en: 'dog', he: 'כלב' }] }]);
    expect(library.selectedId).toBe('a');
  });

  it('never throws when storage is blocked or missing', () => {
    for (const storage of [throwingStorage(), undefined, null]) {
      const library = WordLibrary.load(storage);
      expect(() => library.addPair(library.selectedId, 'zebra', 'זברה')).not.toThrow();
    }
  });
});

describe('WordLibrary editing', () => {
  const fresh = () => {
    const storage = memoryStorage();
    return { storage, library: WordLibrary.load(storage) };
  };

  it('creates selected empty lists with unique names', () => {
    const { library } = fresh();
    const a = library.create('Trip');
    const b = library.create('Trip');
    expect([a.name, b.name]).toEqual(['Trip', 'Trip 2']);
    expect(a.id).not.toBe(b.id);
    expect(library.selected).toBe(b);
    expect(b.pairs).toEqual([]);
  });

  it('adds, edits and removes pairs, saving each change', () => {
    const { storage, library } = fresh();
    const { id } = library.create('Mine');
    expect(library.addPair(id, ' dog ', 'כלב').ok).toBe(true);
    expect(library.addPair(id, 'cat', 'חתול').ok).toBe(true);
    expect(library.addPair(id, 'dog', 'כלבלב')).toMatchObject({ ok: false, field: 'en' });
    expect(library.updatePair(id, 1, 'kitten', 'חתלתול').ok).toBe(true);
    expect(library.updatePair(id, 1, 'dog', 'חתלתול').ok).toBe(false);
    expect(stored(storage).lists.find((l) => l.id === id).pairs).toEqual([{ en: 'dog', he: 'כלב' }, { en: 'kitten', he: 'חתלתול' }]);
    library.removePair(id, 0);
    expect(WordLibrary.load(storage).get(id).pairs).toEqual([{ en: 'kitten', he: 'חתלתול' }]);
  });

  it('renames, keeping the old name for a blank one', () => {
    const { library } = fresh();
    const { id } = library.create('Mine');
    library.rename(id, '  Words  for   trip ');
    expect(library.get(id).name).toBe('Words for trip');
    library.rename(id, '   ');
    expect(library.get(id).name).toBe('Words for trip');
  });

  it('a locked list refuses every change until it is unlocked', () => {
    const { library } = fresh();
    const id = PRESET_LISTS[1].id;
    const before = structuredClone(library.get(id));
    library.setLocked(id, true);
    expect(() => library.addPair(id, 'zebra', 'זברה')).toThrow(/locked/);
    expect(() => library.updatePair(id, 0, 'zebra', 'זברה')).toThrow(/locked/);
    expect(() => library.removePair(id, 0)).toThrow(/locked/);
    expect(() => library.rename(id, 'X')).toThrow(/locked/);
    expect(() => library.remove(id)).toThrow(/locked/);
    expect(library.get(id)).toEqual({ ...before, locked: true });
    library.setLocked(id, false);
    expect(library.addPair(id, 'zebra', 'זברה').ok).toBe(true);
  });

  it('a locked list can still be chosen to play', () => {
    const { library } = fresh();
    library.setLocked(PRESET_LISTS[2].id, true);
    library.select(PRESET_LISTS[2].id);
    expect(library.selected.id).toBe(PRESET_LISTS[2].id);
  });

  it('deletes a list and selects a neighbour, but never the last list', () => {
    const { library } = fresh();
    const ids = library.lists.map((l) => l.id);
    library.select(ids[1]);
    library.remove(ids[1]);
    expect(library.lists.map((l) => l.id)).toEqual([ids[0], ...ids.slice(2)]);
    expect(library.selectedId).toBe(ids[2]);
    library.lists.slice(1).forEach((l) => library.remove(l.id));
    expect(library.lists).toHaveLength(1);
    expect(() => library.remove(library.lists[0].id)).toThrow();
  });

  it('throws for unknown lists and pairs', () => {
    const { library } = fresh();
    expect(() => library.select('nope')).toThrow();
    expect(() => library.removePair(library.selectedId, 999)).toThrow();
    expect(() => library.updatePair(library.selectedId, -1, 'a', 'א')).toThrow();
  });

  it('every pair in every English–Hebrew list stays English on one side and Hebrew on the other', () => {
    const { library } = fresh();
    for (const l of library.lists.filter((l) => l.kind === KINDS.EN_HE)) {
      for (const p of l.pairs) {
        expect(p.en).toMatch(LATIN_RE);
        expect(p.en).not.toMatch(HEBREW_RE);
        expect(p.he).toMatch(HEBREW_RE);
      }
    }
  });
});

describe('Hebrew–Hebrew lists', () => {
  const HE = KINDS.HE_HE;

  it('take Hebrew words on both sides', () => {
    expect(checkPair(' גדול ', 'קטן', [], -1, HE)).toEqual({ ok: true, pair: { en: 'גדול', he: 'קטן' } });
  });

  it.each([
    ['big', 'קטן', 'en'],
    ['גדול', 'small', 'he'],
    ['', 'קטן', 'en'],
    ['גדול', '', 'he'],
    ['גדול', 'גדול', 'he'],
  ])('reject %j / %j on the %s side', (first, second, field) => {
    const check = checkPair(first, second, [], -1, HE);
    expect(check).toMatchObject({ ok: false, field });
    expect(check.error).toMatch(/first|second|different/);
  });

  it('reject a word already on the same side', () => {
    const list = [{ en: 'גדול', he: 'קטן' }];
    expect(checkPair('גדול', 'זעיר', list, -1, HE)).toMatchObject({ ok: false, field: 'en' });
    expect(checkPair('ענק', 'קטן', list, -1, HE)).toMatchObject({ ok: false, field: 'he' });
  });

  it('a ready-made one exists and loads as Hebrew–Hebrew', () => {
    const library = WordLibrary.load(memoryStorage());
    const hebrew = library.lists.filter((l) => l.kind === HE);
    expect(hebrew.length).toBeGreaterThanOrEqual(1);
    hebrew[0].pairs.forEach((p) => {
      expect(p.en).toMatch(HEBREW_RE);
      expect(p.he).toMatch(HEBREW_RE);
    });
  });

  it('are created, checked and saved as Hebrew–Hebrew', () => {
    const storage = memoryStorage();
    const library = WordLibrary.load(storage);
    const { id } = library.create('Opposites', HE);
    expect(library.addPair(id, 'dog', 'כלב').ok).toBe(false);
    expect(library.addPair(id, 'חם', 'קר').ok).toBe(true);
    expect(library.updatePair(id, 0, 'hot', 'קר').ok).toBe(false);
    const again = WordLibrary.load(storage).get(id);
    expect(again.kind).toBe(HE);
    expect(again.pairs).toEqual([{ en: 'חם', he: 'קר' }]);
  });

  it('a list changes kind only while it is empty and unlocked', () => {
    const lib = WordLibrary.load(memoryStorage());
    const { id } = lib.create('Mine');
    lib.setKind(id, HE);
    expect(lib.get(id).kind).toBe(HE);
    lib.addPair(id, 'חם', 'קר');
    expect(() => lib.setKind(id, KINDS.EN_HE)).toThrow();
    lib.removePair(id, 0);
    lib.setLocked(id, true);
    expect(() => lib.setKind(id, KINDS.EN_HE)).toThrow(/locked/);
    expect(() => lib.create('X', 'fr-he')).toThrow();
  });

  it('stored pairs that do not fit the kind are dropped, and an unknown kind means English–Hebrew', () => {
    const raw = JSON.stringify({
      lists: [
        { id: 'h', name: 'H', kind: HE, pairs: [{ en: 'חם', he: 'קר' }, { en: 'dog', he: 'כלב' }] },
        { id: 'x', name: 'X', kind: 'klingon', pairs: [{ en: 'dog', he: 'כלב' }] },
      ],
    });
    const library = WordLibrary.load(memoryStorage({ [LIBRARY_KEY]: raw }));
    expect(library.get('h').pairs).toEqual([{ en: 'חם', he: 'קר' }]);
    expect(library.get('x').kind).toBe(KINDS.EN_HE);
  });
});
