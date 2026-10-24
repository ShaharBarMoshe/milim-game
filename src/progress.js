// What the player has earned on the map: whether the lava level is open. One good balloon round
// opens it for every word list. Saved in the browser; no Phaser or DOM here, so it runs (and is
// tested) in Node. Never throws.

export const PROGRESS_KEY = 'balloon-archer-progress';

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadProgress(storage = defaultStorage()) {
  try {
    const data = JSON.parse(storage?.getItem(PROGRESS_KEY) ?? 'null');
    // Older saves listed the word lists that had opened it; any of them counts.
    const open = data?.lavaOpen === true || (Array.isArray(data?.lavaUnlocked) && data.lavaUnlocked.length > 0);
    return { lavaOpen: open };
  } catch {
    return { lavaOpen: false };
  }
}

export function isLavaOpen(storage = defaultStorage()) {
  return loadProgress(storage).lavaOpen;
}

export function openLava(storage = defaultStorage()) {
  try {
    storage?.setItem(PROGRESS_KEY, JSON.stringify({ lavaOpen: true }));
  } catch {
    // storage unavailable (private mode) — the game registry still remembers it until the page closes
  }
}
