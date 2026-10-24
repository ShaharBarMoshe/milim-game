// Word list files: a list saved as JSON to send to a friend, and read back.
// No Phaser or DOM here, so it runs (and is tested) in Node. Nothing here throws on bad input:
// rows that can't be used are skipped and reported, and only a file with no good rows is refused.
//
//   { "app": "milim", "version": 1, "name": "Animals", "kind": "en-he",
//     "words": [{ "en": "dog", "he": "כלב" }, { "en": "cat", "he": "חתול" }] }

import { KINDS, checkPair } from './wordLists.js';

export const LIST_FILE_VERSION = 1;
export const MAX_FILE_BYTES = 1024 * 1024;

const HEBREW = /[֐-׿]/;
const LATIN = /[A-Za-z]/;
const NOT_A_FILE = 'This is not a word list file';

// The file for a list. Pairs that no longer pass checkPair are left out and reported by their
// 1-based row: { ok, file, skipped: [{ row, pair, error }] }, or { ok: false, error, skipped } when none pass.
export function toListFile(list) {
  const kind = Object.values(KINDS).includes(list?.kind) ? list.kind : KINDS.EN_HE;
  const words = [];
  const skipped = [];
  (Array.isArray(list?.pairs) ? list.pairs : []).forEach((pair, i) => {
    const check = checkPair(pair?.en, pair?.he, words, -1, kind);
    if (check.ok) words.push(check.pair);
    else skipped.push({ row: i + 1, pair, error: check.error });
  });
  if (!words.length) return { ok: false, error: 'This list has no valid words to share', skipped };
  const name = String(list?.name ?? '').trim() || 'Word list';
  return { ok: true, file: { app: 'milim', version: LIST_FILE_VERSION, name, kind, words }, skipped };
}

// A safe file name for a list: "Animals 2" -> "Animals-2.txt". Hebrew letters are kept. The text inside is
// JSON, but the file is .txt because Chrome on Android shares only some kinds of file and .json isn't one.
export function listFileName(name) {
  const base = String(name ?? '')
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return base ? `${base}.txt` : 'word-list.txt';
}

// The two words of a row, from { en, he } or [en, he], or null when it isn't two strings.
function rowWords(row) {
  const words = Array.isArray(row) ? (row.length === 2 ? row : null) : row && typeof row === 'object' ? [row.en, row.he] : null;
  return words && words.every((w) => typeof w === 'string') ? words : null;
}

const isHebrewOnly = (word) => HEBREW.test(word) && !LATIN.test(word);

// Reads a word list file: { ok, list: { name, kind, pairs }, skipped: [{ row, text, error }] }, or
// { ok: false, error, skipped } when nothing in it can be used.
export function parseListFile(text, fallbackName = 'Shared words') {
  let data;
  try {
    data = JSON.parse(String(text ?? '').replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: NOT_A_FILE, skipped: [] };
  }
  const isObject = data && typeof data === 'object' && !Array.isArray(data);
  const rows = Array.isArray(data) ? data : isObject ? (Array.isArray(data.words) ? data.words : Array.isArray(data.pairs) ? data.pairs : null) : null;
  if (!rows) return { ok: false, error: NOT_A_FILE, skipped: [] };

  const name = (isObject && typeof data.name === 'string' && data.name.trim()) || fallbackName;
  let kind = isObject && Object.values(KINDS).includes(data.kind) ? data.kind : null;
  if (!kind) {
    const both = rows.map(rowWords).filter(Boolean);
    kind = both.length && both.every((w) => w.every(isHebrewOnly)) ? KINDS.HE_HE : KINDS.EN_HE;
  }

  const pairs = [];
  const skipped = [];
  rows.forEach((row, i) => {
    const words = rowWords(row);
    let check = null;
    if (words) {
      let [en, he] = words;
      // An English–Hebrew row may have its words the other way round.
      if (kind === KINDS.EN_HE && HEBREW.test(en) && !HEBREW.test(he) && LATIN.test(he)) [en, he] = [he, en];
      check = checkPair(en, he, pairs, -1, kind);
    }
    if (check?.ok) pairs.push(check.pair);
    else skipped.push({ row: i + 1, text: String(JSON.stringify(row) ?? row).slice(0, 60), error: check?.error ?? 'Not a word pair' });
  });
  if (!pairs.length) return { ok: false, error: 'No valid words in this file', skipped };
  return { ok: true, list: { name, kind, pairs }, skipped };
}

// The message that goes with the file.
export function shareMessage(file, fileName) {
  return `Milim word list "${file.name}" (${file.words.length} words) is in the attached file ${fileName}. ` +
    'Open the game, choose 📂 Upload list and pick the file.';
}

// Where a browser that can't share files opens the message, so the downloaded file can be attached
// there by hand: 'whatsapp' or 'email'.
export function fallbackShareUrl(app, file, fileName) {
  const message = shareMessage(file, fileName);
  if (app === 'whatsapp') return `https://wa.me/?text=${encodeURIComponent(message)}`;
  return `mailto:?subject=${encodeURIComponent(`Milim word list: ${file.name}`)}&body=${encodeURIComponent(message)}`;
}
