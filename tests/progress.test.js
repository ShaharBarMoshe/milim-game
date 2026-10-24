import { describe, it, expect } from 'vitest';
import { PROGRESS_KEY, isLavaOpen, loadProgress, openLava } from '../src/progress.js';
import { memoryStorage, throwingStorage } from './helpers.js';

describe('the lava level on the map', () => {
  it('starts closed', () => {
    expect(loadProgress(memoryStorage())).toEqual({ lavaOpen: false });
    expect(isLavaOpen(memoryStorage())).toBe(false);
  });

  it('opens once and is saved', () => {
    const storage = memoryStorage();
    openLava(storage);
    openLava(storage);
    expect(isLavaOpen(storage)).toBe(true);
    expect(JSON.parse(storage.getItem(PROGRESS_KEY))).toEqual({ lavaOpen: true });
  });

  it('counts an older save that listed word lists as open', () => {
    expect(isLavaOpen(memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ lavaUnlocked: ['preset-everyday'] }) }))).toBe(true);
    expect(isLavaOpen(memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ lavaUnlocked: [] }) }))).toBe(false);
  });

  it.each(['not json', '{"lavaOpen": "yes"}', '[1]', 'null'])('reads broken data %j as closed', (raw) => {
    expect(loadProgress(memoryStorage({ [PROGRESS_KEY]: raw }))).toEqual({ lavaOpen: false });
  });

  it('never throws when storage is blocked or missing', () => {
    for (const storage of [throwingStorage(), undefined, null]) {
      expect(() => openLava(storage)).not.toThrow();
      expect(isLavaOpen(storage)).toBe(false);
    }
  });
});
