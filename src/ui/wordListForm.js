// HTML overlay for choosing and editing word lists. Real <input>s are used (not canvas text) because the
// browser handles Hebrew typing, RTL and the IME properly. Each word goes in its own field, so there is
// no separator to get wrong.
import { DIRECTIONS } from '../quiz.js';
import { KIND_LABELS, KINDS, MIN_PAIRS, WordLibrary } from '../wordLists.js';
import { MAX_FILE_BYTES, fallbackShareUrl, listFileName, parseListFile, toListFile } from '../listFile.js';

let root = null;

// " (skipped 2: row 3 – Not a word pair; row 5 – …)" for the rows a file or share left out.
const skippedText = (skipped) =>
  skipped.length
    ? ` (skipped ${skipped.length}: ${skipped.slice(0, 3).map((s) => `row ${s.row} – ${s.error}`).join('; ')}${skipped.length > 3 ? '; …' : ''})`
    : '';

export function showWordListForm({ initialDirection = DIRECTIONS.MIXED, onStart, library = WordLibrary.load() } = {}) {
  hideWordListForm();

  root = document.createElement('form');
  root.id = 'word-form';
  root.className = 'word-form';
  root.noValidate = true;
  root.innerHTML = `
    <div class="word-panel">
      <h1>Balloon Archer <span>English ↔ עברית</span></h1>
      <div class="list-bar">
        <label>Word list <select id="list-select"></select></label>
        <button type="button" id="list-new" class="word-secondary">+ New list</button>
        <button type="button" id="word-upload" class="word-secondary">📂 Upload list</button>
        <button type="button" id="word-share" class="word-secondary">📤 Share list</button>
        <input type="file" id="word-file" hidden accept=".json,.txt,application/json,text/plain" />
      </div>
      <div id="word-upload-status" class="word-summary" role="status"></div>
      <div id="word-share-panel" class="share-panel" hidden>
        <span>Send this list:</span>
        <button type="button" id="share-whatsapp" class="share-link">WhatsApp</button>
        <button type="button" id="share-email" class="share-link">Email</button>
        <button type="button" id="share-download" class="word-secondary">⬇ Download file</button>
        <button type="button" id="share-close" class="word-secondary" aria-label="Close sharing">✕</button>
      </div>
      <div class="list-head">
        <input id="list-name" aria-label="List name" maxlength="40" autocomplete="off" />
        <select id="list-kind" aria-label="Kind of list">
          ${Object.values(KINDS).map((k) => `<option value="${k}">${KIND_LABELS[k].name}</option>`).join('')}
        </select>
        <button type="button" id="list-lock" class="word-secondary" aria-pressed="false"></button>
        <button type="button" id="list-delete" class="word-danger">Delete list</button>
      </div>
      <div class="word-table-wrap">
        <table id="word-table">
          <thead><tr><th id="head-first"></th><th id="head-second" dir="rtl"></th><th><span class="sr-only">Remove</span></th></tr></thead>
          <tbody></tbody>
        </table>
        <p id="word-empty" class="word-help">No words yet — add the first pair below.</p>
      </div>
      <div id="word-add" class="word-add">
        <input id="add-en" autocomplete="off" spellcheck="false" />
        <input id="add-he" dir="rtl" lang="he" autocomplete="off" spellcheck="false" />
        <button type="button" id="add-pair" class="word-secondary">Add</button>
      </div>
      <div id="word-error" class="word-bad" aria-live="polite"></div>
      <div id="word-summary" class="word-summary" aria-live="polite"></div>
      <div class="word-controls">
        <label>Direction
          <select id="word-direction">
            <option value="${DIRECTIONS.MIXED}">Mixed (both ways)</option>
            <option value="${DIRECTIONS.EN_HE}"></option>
            <option value="${DIRECTIONS.HE_EN}"></option>
          </select>
        </label>
        <button type="submit" id="word-start">To the map ➜</button>
      </div>
      <p class="word-help">Next, choose a game on the map. Ctrl+Enter goes there too.</p>
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
    del.textContent = 'Delete list';
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
      ? `${list.pairs.length} pairs${list.locked ? ' · locked, unlock to edit' : ''}`
      : `${list.pairs.length} pair${list.pairs.length === 1 ? '' : 's'} — add at least ${MIN_PAIRS} to play`;
    summary.appendChild(status);
    start.disabled = !enough;
  };

  const render = () => {
    const list = library.selected;
    renderSummary();
    name.value = list.name;
    name.readOnly = list.locked;
    const labels = KIND_LABELS[list.kind];
    const firstHebrew = list.kind === KINDS.HE_HE;
    kind.value = list.kind;
    kind.disabled = list.locked || list.pairs.length > 0;
    kind.title = kind.disabled && !list.locked ? 'Only an empty list can change its kind' : '';
    $('#head-first').textContent = labels.first;
    $('#head-first').dir = firstHebrew ? 'rtl' : 'ltr';
    $('#head-second').textContent = labels.second;
    addEn.placeholder = labels.firstHint;
    addEn.dir = firstHebrew ? 'rtl' : 'ltr';
    addEn.lang = firstHebrew ? 'he' : 'en';
    addEn.setAttribute('aria-label', `New ${firstHebrew ? 'first' : 'English'} word`);
    addHe.placeholder = labels.secondHint;
    addHe.setAttribute('aria-label', `New ${firstHebrew ? 'second' : 'Hebrew'} word`);
    direction.options[1].textContent = labels.forward;
    direction.options[2].textContent = labels.backward;
    lock.textContent = list.locked ? '🔒 Locked' : '🔓 Unlocked';
    lock.title = list.locked ? 'Unlock to edit this list' : 'Lock to protect this list from changes';
    lock.setAttribute('aria-pressed', String(list.locked));
    disarmDelete();
    del.disabled = list.locked || library.lists.length === 1;
    root.classList.toggle('locked', list.locked);

    tbody.replaceChildren(
      ...list.pairs.map((pair, index) => {
        const row = document.createElement('tr');
        row.dataset.index = index;
        const en = pairInput(pair.en, 'en', `${firstHebrew ? 'First' : 'English'} word ${index + 1}`, list.locked, firstHebrew);
        const he = pairInput(pair.he, 'he', `${firstHebrew ? 'Second' : 'Hebrew'} word ${index + 1}`, list.locked, true);
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
          remove.setAttribute('aria-label', `Remove ${pair.en}`);
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
      showError(check.error, check.field === 'en' ? addEn : addHe);
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
    library.create('New list');
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
      say('Choose a .json or .txt word list file', false);
      return;
    }
    if (chosen.size > MAX_FILE_BYTES) {
      say('The file is too big (1 MB at most)', false);
      return;
    }
    let text;
    try {
      text = await chosen.text();
    } catch {
      say(`Couldn't read ${chosen.name}`, false);
      return;
    }
    const parsed = parseListFile(text, chosen.name.replace(/\.(json|txt)$/i, ''));
    const result = parsed.ok ? library.importList(parsed.list) : parsed;
    if (!result.ok) {
      say(`${result.error}${skippedText(parsed.skipped)}`, false);
      return;
    }
    sharePanel.hidden = true;
    showError(null);
    render();
    say(`Added ${result.added} words from ${chosen.name}${skippedText(parsed.skipped)}`, true);
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
      say(`${result.error}${skippedText(result.skipped)}`, false);
      return;
    }
    const { file: listFile, skipped } = result;
    const json = JSON.stringify(listFile, null, 2);
    const fileName = listFileName(listFile.name);
    const sharing = skipped.length ? `Sharing ${listFile.words.length} words${skippedText(skipped)}. ` : '';
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
        say(`${sharing}Choose ${app === 'whatsapp' ? 'WhatsApp' : 'Mail'} in the share menu to send ${deviceFile.name}.`, true);
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
      say(`${sharing}${fileName} was downloaded: attach it ${app === 'whatsapp' ? 'in the WhatsApp chat' : 'to the email'}.`, true);
    };
    $('#share-whatsapp').onclick = () => send('whatsapp');
    $('#share-email').onclick = () => send('email');
    $('#share-download').onclick = () => {
      download();
      say(`${sharing}Downloaded ${fileName}.`, true);
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
      del.textContent = 'Click again to delete';
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
    showError(check.ok ? null : `${check.error} — change undone`);
    const saved = library.selected.pairs[index];
    en.value = saved.en;
    he.value = saved.he;
    row.querySelector('.pair-remove')?.setAttribute('aria-label', `Remove ${saved.en}`);
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

  render();
  start.focus();
  return root;
}

export function hideWordListForm() {
  root?.remove();
  root = null;
}
