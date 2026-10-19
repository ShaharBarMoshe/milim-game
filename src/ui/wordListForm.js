// HTML overlay for entering the word list. A real <textarea> is used (not canvas text) because the
// browser handles Hebrew typing, RTL and the IME properly.
import { DIRECTIONS } from '../quiz.js';
import { parseWordList, saveWordList, serializeWordList, SAMPLE_PAIRS } from '../vocab.js';

const MIN_PAIRS = 2;

let root = null;

export function showWordListForm({ initialText = '', initialDirection = DIRECTIONS.EN_HE, onStart } = {}) {
  hideWordListForm();

  root = document.createElement('form');
  root.id = 'word-form';
  root.className = 'word-form';
  root.noValidate = true;
  root.innerHTML = `
    <div class="word-panel">
      <h1>Balloon Archer <span>English ↔ עברית</span></h1>
      <p class="word-help">
        One pair per line: <code>english - עברית</code>
        (also <code>,</code> <code>:</code> <code>=</code> or a tab). Lines starting with <code>#</code> are ignored.
      </p>
      <textarea id="word-input" dir="auto" spellcheck="false" autocomplete="off" rows="12"
        aria-label="Word list" placeholder="dog - כלב"></textarea>
      <div id="word-summary" class="word-summary" aria-live="polite"></div>
      <div class="word-controls">
        <label>Direction
          <select id="word-direction">
            <option value="${DIRECTIONS.EN_HE}">English → Hebrew</option>
            <option value="${DIRECTIONS.HE_EN}">Hebrew → English</option>
            <option value="${DIRECTIONS.MIXED}">Mixed</option>
          </select>
        </label>
        <button type="button" id="word-sample" class="word-secondary">Sample list</button>
        <button type="submit" id="word-start">Start</button>
      </div>
      <p class="word-help">Click the balloon with the right translation. Ctrl+Enter starts.</p>
    </div>`;
  document.body.appendChild(root);

  const input = root.querySelector('#word-input');
  const summary = root.querySelector('#word-summary');
  const direction = root.querySelector('#word-direction');
  const start = root.querySelector('#word-start');
  input.value = initialText;
  if ([...direction.options].some((o) => o.value === initialDirection)) direction.value = initialDirection;

  let parsed = parseWordList(input.value);
  const refresh = () => {
    parsed = parseWordList(input.value);
    const { pairs, errors } = parsed;
    summary.replaceChildren();
    const ok = document.createElement('div');
    ok.className = pairs.length >= MIN_PAIRS ? 'word-ok' : 'word-bad';
    ok.textContent =
      pairs.length >= MIN_PAIRS
        ? `${pairs.length} valid pairs`
        : `${pairs.length} valid pair${pairs.length === 1 ? '' : 's'} — enter at least ${MIN_PAIRS}`;
    summary.appendChild(ok);
    if (errors.length) {
      const bad = document.createElement('div');
      bad.className = 'word-bad';
      bad.dir = 'auto';
      const shown = errors.slice(0, 8).map((e) => e.line).join(', ');
      bad.textContent = `Can't read line${errors.length > 1 ? 's' : ''} ${shown}${errors.length > 8 ? '…' : ''}`;
      summary.appendChild(bad);
    }
    start.disabled = pairs.length < MIN_PAIRS;
  };

  input.addEventListener('input', () => {
    refresh();
    saveWordList(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      root.requestSubmit();
    }
  });
  root.querySelector('#word-sample').addEventListener('click', () => {
    input.value = serializeWordList(SAMPLE_PAIRS);
    input.dispatchEvent(new Event('input'));
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    refresh();
    if (parsed.pairs.length < MIN_PAIRS) return;
    saveWordList(input.value);
    const pairs = parsed.pairs;
    const dir = direction.value;
    hideWordListForm();
    onStart?.(pairs, dir);
  });

  refresh();
  input.focus();
  return root;
}

export function hideWordListForm() {
  root?.remove();
  root = null;
}
