// HTML overlay for choosing and editing word lists. Real <input>s are used (not canvas text) because the
// browser handles Hebrew typing, RTL and the IME properly. Each word goes in its own field, so there is
// no separator to get wrong.
import { DIRECTIONS } from '../quiz.js';
import { KIND_LABELS, KINDS, MIN_PAIRS, WordLibrary } from '../wordLists.js';
import { MAX_FILE_BYTES, fallbackShareUrl, listFileName, parseListFile, toListFile } from '../listFile.js';
import { language, t, toggleLanguage } from '../i18n.js';

let root = null;

// The two flags for the language button, as inline SVG (emoji flags don't show on Windows).
const FLAGS = {
  en: `<svg viewBox="0 0 57 38" width="42" height="28" aria-hidden="true"><rect width="57" height="38" fill="#b22234"/>${
    [1, 3, 5, 7, 9, 11].map((i) => `<rect y="${(i * 38) / 13}" width="57" height="${38 / 13}" fill="#fff"/>`).join('')
  }<rect width="24" height="${(7 * 38) / 13}" fill="#3c3b6e"/>${
    [0, 1, 2, 3, 4].flatMap((r) => [0, 1, 2, 3, 4].map((c) => `<circle cx="${2.6 + c * 4.7 + (r % 2) * 2.3}" cy="${2.4 + r * 4.1}" r="0.9" fill="#fff"/>`)).join('')
  }</svg>`,
  he: `<svg viewBox="0 0 55 40" width="42" height="30" aria-hidden="true"><rect width="55" height="40" fill="#fff"/><rect y="4" width="55" height="6" fill="#0038b8"/><rect y="30" width="55" height="6" fill="#0038b8"/><g fill="none" stroke="#0038b8" stroke-width="1.6"><path d="M27.5 12.5 L34 23.75 L21 23.75 Z"/><path d="M27.5 27.5 L21 16.25 L34 16.25 Z"/></g></svg>`,
};

// The checks in src/wordLists.js and src/listFile.js report in English; these are their messages in the
// chosen language. Anything not listed here is shown as it came.
const ERRORS = [
  [/^Type the (English|Hebrew|first|second) word$/, (m) => t(`errors.type.${m[1]}`)],
  [/^The (English|Hebrew|first|second) word needs (?:Hebrew|English) letters$/, (m) => t(`errors.letters.${m[1]}`)],
  [/^Keep it under (\d+) letters$/, (m) => t('errors.tooLong', { max: m[1] })],
  [/^The two words must be different$/, () => t('errors.same')],
  [/^"(.*)" is already in this list$/, (m) => t('errors.duplicate', { word: m[1] })],
  [/^No valid words in this file$/, () => t('errors.noValidWords')],
  [/^This list has no valid words to share$/, () => t('errors.nothingToShare')],
  [/^This is not a word list file$/, () => t('errors.notAFile')],
  [/^Not a word pair$/, () => t('errors.notAPair')],
];

export function localizeError(message) {
  for (const [pattern, translate] of ERRORS) {
    const m = pattern.exec(message ?? '');
    if (m) return translate(m);
  }
  return message ?? '';
}

// " (skipped 2: row 3 – Not a word pair; row 5 – …)" for the rows a file or share left out.
const skippedText = (skipped) =>
  skipped.length
    ? ` ${t('form.skipped', {
      n: skipped.length,
      rows: `${skipped.slice(0, 3).map((s) => t('form.skippedRow', { row: s.row, error: localizeError(s.error) })).join('; ')}${skipped.length > 3 ? '; …' : ''}`,
    })}`
    : '';

// Labels for a kind of list ('en-he' or 'he-he'), in the chosen language.
const kindLabels = (kind) => {
  const k = kind === KINDS.HE_HE ? 'heHe' : 'enHe';
  const get = (field) => t(`kinds.${k}.${field}`, { defaultValue: KIND_LABELS[kind]?.[field] });
  return { name: get('name'), first: get('first'), second: get('second'), firstHint: get('firstHint'), secondHint: get('secondHint'), forward: get('forward'), backward: get('backward') };
};

export function showWordListForm({ initialDirection = DIRECTIONS.MIXED, onStart, library = WordLibrary.load() } = {}) {
  hideWordListForm();

  root = document.createElement('form');
  root.id = 'word-form';
  root.className = 'word-form';
  root.noValidate = true;
  const rtl = language() === 'he';
  root.innerHTML = `
    <div class="word-panel">
      <button type="button" id="lang-toggle" class="lang-toggle" lang="${rtl ? 'en' : 'he'}" aria-label="${t('lang.switch')}" title="${t('lang.switch')}">${FLAGS[language()]}</button>
      <h1>${t('app.title')} <span>English ↔ עברית</span></h1>
      <div class="list-bar">
        <label>${t('form.wordList')} <select id="list-select"></select></label>
        <button type="button" id="list-new" class="word-secondary">+ ${t('form.newList')}</button>
        <button type="button" id="word-upload" class="word-secondary">📂 ${t('form.upload')}</button>
        <button type="button" id="word-share" class="word-secondary">📤 ${t('form.share')}</button>
        <input type="file" id="word-file" hidden accept=".json,.txt,application/json,text/plain" />
      </div>
      <div id="word-upload-status" class="word-summary" role="status"></div>
      <div id="word-share-panel" class="share-panel" hidden>
        <span>${t('form.sendList')}</span>
        <button type="button" id="share-whatsapp" class="share-link">WhatsApp</button>
        <button type="button" id="share-email" class="share-link">${t('form.email')}</button>
        <button type="button" id="share-download" class="word-secondary">⬇ ${t('form.download')}</button>
        <button type="button" id="share-close" class="word-secondary" aria-label="${t('form.closeShare')}">✕</button>
      </div>
      <div class="list-head">
        <input id="list-name" aria-label="${t('form.listName')}" maxlength="40" autocomplete="off" />
        <select id="list-kind" aria-label="${t('form.listKind')}">
          ${Object.values(KINDS).map((k) => `<option value="${k}">${kindLabels(k).name}</option>`).join('')}
        </select>
        <button type="button" id="list-lock" class="word-secondary" aria-pressed="false"></button>
        <button type="button" id="list-delete" class="word-danger">${t('form.deleteList')}</button>
      </div>
      <div class="word-table-wrap">
        <table id="word-table">
          <thead><tr><th id="head-first"></th><th id="head-second" dir="rtl"></th><th><span class="sr-only">${t('form.remove')}</span></th></tr></thead>
          <tbody></tbody>
        </table>
        <p id="word-empty" class="word-help">${t('form.empty')}</p>
      </div>
      <div id="word-add" class="word-add">
        <input id="add-en" autocomplete="off" spellcheck="false" />
        <input id="add-he" dir="rtl" lang="he" autocomplete="off" spellcheck="false" />
        <button type="button" id="add-pair" class="word-secondary">${t('form.add')}</button>
      </div>
      <div id="word-error" class="word-bad" aria-live="polite"></div>
      <div id="word-summary" class="word-summary" aria-live="polite"></div>
      <div class="word-controls">
        <label>${t('form.direction')}
          <select id="word-direction">
            <option value="${DIRECTIONS.MIXED}">${t('form.mixed')}</option>
            <option value="${DIRECTIONS.EN_HE}"></option>
            <option value="${DIRECTIONS.HE_EN}"></option>
          </select>
        </label>
        <button type="submit" id="word-start">${t('form.toMap')} ${rtl ? '⬅' : '➜'}</button>
      </div>
      <p class="word-help">${t('form.help')}</p>
    </div>`;
  document.body.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const select = $('#list-select');
  const name = $('#list-name');
  const kind = $('#list-kind');
  const lock = $('#list-lock');
  const del = $('#list-delete');
  const tbody = $('#word-table tbody');
  const empty = $('#word-empty');
  const addRow = $('#word-add');
  const addEn = $('#add-en');
  const addHe = $('#add-he');
  const error = $('#word-error');
  const summary = $('#word-summary');
  const direction = $('#word-direction');
  const start = $('#word-start');
  const file = $('#word-file');
  const uploadStatus = $('#word-upload-status');
  const sharePanel = $('#word-share-panel');
  if ([...direction.options].some((o) => o.value === initialDirection)) direction.value = initialDirection;

  let deleteArmed = null; // timer while "Delete list" waits for its confirming second click

  const showError = (message, field) => {
    error.textContent = message ?? '';
    [addEn, addHe].forEach((f) => f.removeAttribute('aria-invalid'));
    if (field) field.setAttribute('aria-invalid', 'true');
  };

  const say = (message, ok) => {
    uploadStatus.textContent = message;
    uploadStatus.className = `word-summary ${ok ? 'word-ok' : 'word-bad'}`;
  };

  const disarmDelete = () => {
    clearTimeout(deleteArmed);
    deleteArmed = null;
    del.textContent = t('form.deleteList');
    del.classList.remove('armed');
  };

  // `side` is the pair key ('en' or 'he'); in a Hebrew–Hebrew list both sides are typed in Hebrew.
  const pairInput = (value, side, label, locked, hebrew) => {
    const input = document.createElement('input');
    input.value = value;
    input.lang = hebrew ? 'he' : 'en';
    input.dir = hebrew ? 'rtl' : 'ltr';
    input.className = `pair-${side}`;
    input.setAttribute('aria-label', label);
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.readOnly = locked;
    return input;
  };

  // The list picker and the pair count; cheap, and leaves the table (and focus in it) alone.
  const renderSummary = () => {
    const list = library.selected;
    select.replaceChildren(
      ...library.lists.map((l) => new Option(`${l.locked ? '🔒 ' : ''}${l.name} (${l.pairs.length})`, l.id, false, l.id === list.id)),
    );
    const enough = list.pairs.length >= MIN_PAIRS;
    summary.replaceChildren();
    const status = document.createElement('div');
    status.className = enough ? 'word-ok' : 'word-bad';
    status.textContent = enough
      ? `${t('form.pairs', { n: list.pairs.length })}${list.locked ? ` · ${t('form.lockedNote')}` : ''}`
      : t('form.notEnough', { n: list.pairs.length, min: MIN_PAIRS });
    summary.appendChild(status);
    start.disabled = !enough;
  };

  const render = () => {
    const list = library.selected;
    renderSummary();
    name.value = list.name;
    name.readOnly = list.locked;
    const labels = kindLabels(list.kind);
    const firstHebrew = list.kind === KINDS.HE_HE;
    kind.value = list.kind;
    kind.disabled = list.locked || list.pairs.length > 0;
    kind.title = kind.disabled && !list.locked ? t('form.kindLocked') : '';
    $('#head-first').textContent = labels.first;
    $('#head-first').dir = firstHebrew ? 'rtl' : 'ltr';
    $('#head-second').textContent = labels.second;
    addEn.placeholder = labels.firstHint;
    addEn.dir = firstHebrew ? 'rtl' : 'ltr';
    addEn.lang = firstHebrew ? 'he' : 'en';
    addEn.setAttribute('aria-label', t(firstHebrew ? 'form.newFirst' : 'form.newEnglish'));
    addHe.placeholder = labels.secondHint;
    addHe.setAttribute('aria-label', t(firstHebrew ? 'form.newSecond' : 'form.newHebrew'));
    direction.options[1].textContent = labels.forward;
    direction.options[2].textContent = labels.backward;
    lock.textContent = list.locked ? `🔒 ${t('form.locked')}` : `🔓 ${t('form.unlocked')}`;
    lock.title = t(list.locked ? 'form.unlockTip' : 'form.lockTip');
    lock.setAttribute('aria-pressed', String(list.locked));
    disarmDelete();
    del.disabled = list.locked || library.lists.length === 1;
    root.classList.toggle('locked', list.locked);

    tbody.replaceChildren(
      ...list.pairs.map((pair, index) => {
        const row = document.createElement('tr');
        row.dataset.index = index;
        const en = pairInput(pair.en, 'en', t(firstHebrew ? 'form.firstWord' : 'form.englishWord', { n: index + 1 }), list.locked, firstHebrew);
        const he = pairInput(pair.he, 'he', t(firstHebrew ? 'form.secondWord' : 'form.hebrewWord', { n: index + 1 }), list.locked, true);
        const cells = [en, he].map((input) => {
          const td = document.createElement('td');
          td.appendChild(input);
          return td;
        });
        const actions = document.createElement('td');
        if (!list.locked) {
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'pair-remove';
          remove.textContent = '✕';
          remove.setAttribute('aria-label', t('form.removeWord', { word: pair.en }));
          actions.appendChild(remove);
        }
        row.append(...cells, actions);
        return row;
      }),
    );
    empty.hidden = list.pairs.length > 0;
    addRow.hidden = list.locked;
  };

  const addPair = () => {
    const check = library.addPair(library.selectedId, addEn.value, addHe.value);
    if (!check.ok) {
      showError(localizeError(check.error), check.field === 'en' ? addEn : addHe);
      (check.field === 'en' ? addEn : addHe).focus();
      return;
    }
    showError(null);
    addEn.value = '';
    addHe.value = '';
    render();
    tbody.lastElementChild?.scrollIntoView({ block: 'nearest' });
    addEn.focus();
  };

  select.addEventListener('change', () => {
    library.select(select.value);
    showError(null);
    render();
  });
  $('#list-new').addEventListener('click', () => {
    library.create(t('form.newListName'));
    showError(null);
    render();
    name.focus();
    name.select();
  });
  // A word list file (JSON, see src/listFile.js) becomes a new list. Bad rows are skipped and listed;
  // only a file with no good rows is refused.
  $('#word-upload').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = ''; // so the same file can be chosen again
    if (!chosen) return;
    // Lists are shared as .txt (see listFileName); .json files, from before that, are read the same way.
    if (!/\.(json|txt)$/i.test(chosen.name)) {
      say(t('form.chooseFile'), false);
      return;
    }
    if (chosen.size > MAX_FILE_BYTES) {
      say(t('form.tooBig'), false);
      return;
    }
    let text;
    try {
      text = await chosen.text();
    } catch {
      say(t('form.cantRead', { file: chosen.name }), false);
      return;
    }
    const parsed = parseListFile(text, chosen.name.replace(/\.(json|txt)$/i, ''));
    const result = parsed.ok ? library.importList(parsed.list) : parsed;
    if (!result.ok) {
      say(`${localizeError(result.error)}${skippedText(parsed.skipped)}`, false);
      return;
    }
    sharePanel.hidden = true;
    showError(null);
    render();
    say(`${t('form.added', { n: result.added, file: chosen.name })}${skippedText(parsed.skipped)}`, true);
  });

  // Share the selected list as its JSON file. WhatsApp and Email open the device's share sheet with the
  // file attached (phones, and most desktop browsers); a web page can't attach a file to a WhatsApp or
  // mailto link, so where the browser can't share files the file is downloaded and WhatsApp or the mail
  // app opens with a message, for the file to be attached by hand.
  $('#word-share').addEventListener('click', () => {
    const list = library.selected;
    const result = toListFile(list);
    if (!result.ok) {
      sharePanel.hidden = true;
      say(`${localizeError(result.error)}${skippedText(result.skipped)}`, false);
      return;
    }
    const { file: listFile, skipped } = result;
    const json = JSON.stringify(listFile, null, 2);
    const fileName = listFileName(listFile.name);
    const sharing = skipped.length ? `${t('form.sharing', { n: listFile.words.length })}${skippedText(skipped)}. ` : '';
    const download = () => {
      const url = URL.createObjectURL(new Blob([json], { type: 'text/plain' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    // The file for the share menu, or null when the device can't share files.
    const shareableFile = () => {
      try {
        const candidate = new File([json], fileName, { type: 'text/plain' });
        return navigator.canShare?.({ files: [candidate] }) ? candidate : null;
      } catch {
        return null; // no File constructor
      }
    };
    const send = async (app) => {
      const deviceFile = shareableFile();
      if (deviceFile) {
        say(`${sharing}${t(app === 'whatsapp' ? 'form.shareMenuWhatsapp' : 'form.shareMenuMail', { file: deviceFile.name })}`, true);
        try {
          // The file alone: given text as well, WhatsApp on Android sends only the text and drops the file.
          await navigator.share({ files: [deviceFile] });
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return; // closed the share menu
        }
      }
      download();
      window.open(fallbackShareUrl(app, listFile, fileName), '_blank', 'noopener');
      say(`${sharing}${t(app === 'whatsapp' ? 'form.attachWhatsapp' : 'form.attachMail', { file: fileName })}`, true);
    };
    $('#share-whatsapp').onclick = () => send('whatsapp');
    $('#share-email').onclick = () => send('email');
    $('#share-download').onclick = () => {
      download();
      say(`${sharing}${t('form.downloaded', { file: fileName })}`, true);
    };
    sharePanel.hidden = false;
    say(sharing ? sharing.trim() : '', true);
  });
  $('#share-close').addEventListener('click', () => {
    sharePanel.hidden = true;
  });
  // Choosing another list closes the panel, which was for the list it was opened on.
  select.addEventListener('change', () => {
    sharePanel.hidden = true;
  });

  kind.addEventListener('change', () => {
    library.setKind(library.selectedId, kind.value);
    showError(null);
    render();
  });
  name.addEventListener('change', () => {
    if (library.selected.locked) return;
    library.rename(library.selectedId, name.value);
    render();
  });
  lock.addEventListener('click', () => {
    library.setLocked(library.selectedId, !library.selected.locked);
    showError(null);
    render();
  });
  del.addEventListener('click', () => {
    if (!deleteArmed) {
      del.textContent = t('form.confirmDelete');
      del.classList.add('armed');
      deleteArmed = setTimeout(disarmDelete, 3000);
      return;
    }
    library.remove(library.selectedId);
    showError(null);
    render();
  });

  $('#add-pair').addEventListener('click', addPair);
  addEn.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    if (addHe.value.trim()) addPair();
    else addHe.focus();
  });
  addHe.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    addPair();
  });

  // Editing a word in the table: saved when the field loses focus; an invalid edit is undone.
  tbody.addEventListener('change', (e) => {
    const row = e.target.closest('tr');
    if (!row || library.selected.locked) return;
    const index = Number(row.dataset.index);
    const en = row.querySelector('.pair-en');
    const he = row.querySelector('.pair-he');
    const check = library.updatePair(library.selectedId, index, en.value, he.value);
    showError(check.ok ? null : t('form.undone', { error: localizeError(check.error) }));
    const saved = library.selected.pairs[index];
    en.value = saved.en;
    he.value = saved.he;
    row.querySelector('.pair-remove')?.setAttribute('aria-label', t('form.removeWord', { word: saved.en }));
    renderSummary();
  });
  tbody.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && e.target.matches('input')) {
      e.preventDefault();
      e.target.blur();
    }
  });
  tbody.addEventListener('click', (e) => {
    const remove = e.target.closest('.pair-remove');
    if (!remove) return;
    library.removePair(library.selectedId, Number(remove.closest('tr').dataset.index));
    showError(null);
    render();
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      root.requestSubmit();
    } else if (e.key === 'Enter' && e.target === name) {
      e.preventDefault();
      name.blur();
    }
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const { id, name: listName, kind: listKind } = library.selected;
    const pairs = library.selected.pairs.map((p) => ({ ...p }));
    if (pairs.length < MIN_PAIRS) return;
    const dir = direction.value;
    hideWordListForm();
    onStart?.(pairs, dir, { id, name: listName, kind: listKind });
  });

  // The flag switches the language: the form is built again in it, keeping the words being typed.
  $('#lang-toggle').addEventListener('click', () => {
    const typed = [addEn.value, addHe.value];
    const dir = direction.value;
    toggleLanguage();
    const form = showWordListForm({ initialDirection: dir, onStart, library });
    [form.querySelector('#add-en').value, form.querySelector('#add-he').value] = typed;
    form.querySelector('#lang-toggle').focus();
  });

  render();
  start.focus();
  return root;
}

export function hideWordListForm() {
  root?.remove();
  root = null;
}
