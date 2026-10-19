// Small deterministic PRNG for tests (mulberry32). Returns floats in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const HEBREW_RE = /[֐-׿]/;
export const LATIN_RE = /[A-Za-z]/;

// In-memory stand-in for window.localStorage.
export function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
  };
}

// Storage whose every method throws (e.g. Safari private mode / blocked storage).
export function throwingStorage() {
  const boom = () => {
    throw new Error('storage blocked');
  };
  return { getItem: boom, setItem: boom, removeItem: boom, clear: boom };
}
