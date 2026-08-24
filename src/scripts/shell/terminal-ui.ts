import { escapeHtml } from '../lib/dom';
import { commands, commandNames, type ShellCtx } from './commands';
import { parse, suggest } from './parser';
import { buildFs, listDir, resolvePath, type VDir } from './vfs';

/**
 * JN shell UI: bottom drawer with scrollback + prompt.
 *
 * State (cwd, history, scrollback log) lives in module scope so it survives
 * Astro view transitions; the DOM is rebuilt idempotently on page-load.
 * Toggle with the backtick key, the header button or the floating FAB.
 */

interface LogLine {
  text: string;
  cls?: 'dim' | 'cmd' | 'err' | 'ok' | 'warn';
}

const state = {
  booted: false,
  fs: null as VDir | null,
  cwd: '/',
  hist: [] as string[],
  hIdx: -1,
  draft: '',
  log: [] as LogLine[],
  busy: false,
};

let els: {
  term: HTMLElement;
  body: HTMLDivElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  prompt: HTMLSpanElement;
} | null = null;

const HIST_KEY = 'jn:shHist';

function loadHistory(): void {
  if (state.hist.length) return;
  try {
    const raw = sessionStorage.getItem(HIST_KEY);
    if (raw) state.hist = JSON.parse(raw) as string[];
  } catch {}
}
function saveHistory(): void {
  try {
    sessionStorage.setItem(HIST_KEY, JSON.stringify(state.hist.slice(-60)));
  } catch {}
}

function renderPrompt(): void {
  if (!els) return;
  const short = state.cwd === '/' ? '~' : '~' + state.cwd;
  els.prompt.innerHTML = `<span style="color:var(--text)">jn</span>@<span style="color:var(--accent)">portfolio</span>:<span class="path">${escapeHtml(short)}</span>$`;
}

/** append to the DOM only (no state change) — used when rebuilding after a swap */
function domAppend({ text, cls }: LogLine): void {
  if (!els) return;
  const div = document.createElement('div');
  div.className = `line${cls ? ` ${cls}` : ''}`;
  div.textContent = text;
  els.body.appendChild(div);
  els.body.scrollTop = els.body.scrollHeight;
}

function appendLine(line: LogLine): void {
  state.log.push(line);
  if (state.log.length > 400) state.log.shift();
  domAppend(line);
}

function renderError(text: string): void {
  appendLine({ text: text.startsWith('\u0000ERR') ? text.slice(4) : text, cls: 'err' });
}

async function ensureBoot(): Promise<void> {
  if (state.booted && state.fs) return;
  state.booted = true;
  state.fs = await buildFs();
  appendLine({
    text:
      '\n  ██ JN SHELL — hand-rolled tokenizer → parser → virtual fs\n  type help to see every verb. some verbs hide.\n',
    cls: 'dim',
  });
}

function rebuildDom(): void {
  if (document.getElementById('jn-term') && els) return;

  document.getElementById('jn-term')?.remove();

  const term = document.createElement('section');
  term.id = 'jn-term';
  term.className = 'jn-term';
  term.setAttribute('role', 'dialog');
  term.setAttribute('aria-label', 'JN terminal');
  term.hidden = true;
  term.innerHTML = `
    <div class="term-head">
      <span class="term-dots"><i></i><i></i><i></i></span>
      <span class="term-title">januth@jn — jn-shell</span>
      <button class="term-close" aria-label="Close terminal">✕</button>
    </div>
    <div class="term-body" aria-live="polite"></div>
    <form class="term-form">
      <span class="term-prompt"></span>
      <input id="term-input" autocomplete="off" spellcheck="false"
        aria-label="terminal input" placeholder="type a command… (help)" />
      <span class="term-keyhint">tab completes · ↑ history · esc closes</span>
    </form>`;

  document.body.appendChild(term);

  els = {
    term,
    body: term.querySelector('.term-body') as HTMLDivElement,
    form: term.querySelector('.term-form') as HTMLFormElement,
    input: term.querySelector('#term-input') as HTMLInputElement,
    prompt: term.querySelector('.term-prompt') as HTMLSpanElement,
  };

  for (const line of state.log) domAppend(line);

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    void submit(els!.input.value);
  });

  els.input.addEventListener('keydown', onInputKeydown);
  term.querySelector('.term-close')?.addEventListener('click', close);
  term.addEventListener('click', () => els?.input.focus());

  renderPrompt();
}

/* ---------------- execution pipeline ---------------- */

function makeCtx(): ShellCtx {
  return {
    cwd: () => state.cwd,
    setCwd: (p) => {
      state.cwd = p;
      renderPrompt();
    },
    getFs: () => state.fs!,
    pipeIn: null,
    clear: () => {
      state.log = [];
      if (els) els.body.innerHTML = '';
    },
    history: () => state.hist,
  };
}

export async function execLine(line: string): Promise<void> {
  const parsed = parse(line);
  if (!parsed) {
    renderError('jn-shell: could not parse that. quotes balanced?');
    return;
  }

  const ctx = makeCtx();
  let carry: string | null = null;

  for (const seg of parsed) {
    const cmd = commands[seg.name];
    if (!cmd) {
      const sugg = suggest(seg.name, commandNames(true));
      renderError(
        `command not found: ${seg.name}` +
          (sugg ? ` — did you mean \`${sugg}\`?` : " — try `help`")
      );
      return;
    }
    ctx.pipeIn = carry;
    const out = await cmd.run(seg.args, ctx);
    carry = typeof out === 'string' ? out : null;
    if (typeof out === 'string') {
      for (const l of out.split('\n')) appendLine({ text: l });
    }
    if (carry === null && typeof out !== 'string' && seg !== parsed[parsed.length - 1]) {
      // side-effect command mid-pipeline has nothing to pass on
      carry = '';
    }
  }
}

async function submit(raw: string): Promise<void> {
  if (state.busy) return;
  const line = raw.trim();
  if (!els) return;

  appendLine({
    text: `${state.cwd === '/' ? '~' : '~' + state.cwd} $ ${line}`,
    cls: 'cmd',
  });
  els.input.value = '';

  if (!line) return;
  if (state.hist[state.hist.length - 1] !== line) {
    state.hist.push(line);
    saveHistory();
  }
  state.hIdx = -1;
  state.draft = '';

  await ensureBoot();
  state.busy = true;
  try {
    await execLine(line);
  } catch (e) {
    renderError(`shell hiccup: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    state.busy = false;
    els?.body.scrollTo({ top: els.body.scrollHeight });
  }
}

/* ---------------- key handling & completion ---------------- */

function complete(): void {
  if (!els || !state.fs) return;
  const value = els.input.value;
  const parts = value.split(/\s+/);
  const completingFirst = parts.length <= 1;
  const fragment = parts[parts.length - 1] ?? '';

  let options: string[];
  if (completingFirst) {
    options = commandNames(false);
  } else {
    const dirPart = fragment.includes('/') ? fragment.slice(0, fragment.lastIndexOf('/')) : '';
    const base = fragment.includes('/') ? fragment.slice(fragment.lastIndexOf('/') + 1) : fragment;
    const absDir = resolvePath(state.cwd, dirPart || '.');
    const entries = listDir(state.fs!, absDir ?? '/');
    options = entries.map((e) => (dirPart ? `${dirPart}/` : '') + e.name + (e.isDir ? '/' : ''));
    parts[parts.length - 1] = base;
    void parts;
  }

  const matches = options.filter((o) => o.startsWith(fragment));
  if (!matches.length) return;

  if (matches.length === 1) {
    parts[completingFirst ? 0 : parts.length - 1] = matches[0];
    els.input.value = parts.join(' ') + (matches[0].endsWith('/') ? '' : ' ');
  } else {
    // common prefix extension
    let prefix = matches[0];
    for (const m of matches) {
      while (!m.startsWith(prefix)) prefix = prefix.slice(0, -1);
    }
    if (prefix.length > fragment.length) {
      parts[completingFirst ? 0 : parts.length - 1] = prefix;
      els.input.value = parts.join(' ');
    } else {
      appendLine({ text: matches.join('   '), cls: 'dim' });
    }
  }
}

function onInputKeydown(e: KeyboardEvent): void {
  if (!els) return;

  if (e.key === 'Tab') {
    e.preventDefault();
    complete();
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!state.hist.length) return;
    if (state.hIdx === -1) {
      state.draft = els.input.value;
      state.hIdx = state.hist.length;
    }
    state.hIdx = Math.max(0, state.hIdx - 1);
    els.input.value = state.hist[state.hIdx] ?? '';
    requestAnimationFrame(() => els?.input.setSelectionRange(999, 999));
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (state.hIdx === -1) return;
    state.hIdx++;
    if (state.hIdx >= state.hist.length) {
      state.hIdx = -1;
      els.input.value = state.draft;
    } else {
      els.input.value = state.hist[state.hIdx] ?? '';
    }
    return;
  }

  // ctrl+l clears, classic
  if (e.key === 'l' && e.ctrlKey) {
    e.preventDefault();
    makeCtx().clear();
  }
}

/* ---------------- open/close/toggle ---------------- */

export function openTerm(): void {
  rebuildDom();
  if (!els) return;
  els.term.hidden = false;
  requestAnimationFrame(() => {
    els?.term.classList.add('open');
    els?.input.focus();
  });
  void ensureBoot();
}

export function closeTerm(): void {
  if (!els) return;
  els.term.classList.remove('open');
  window.setTimeout(() => {
    if (els && !els.term.classList.contains('open')) els.term.hidden = true;
  }, 400);
  (document.activeElement as HTMLElement | null)?.blur?.();
}

export function toggleTerm(): void {
  if (!els || els.term.hidden || !els.term.classList.contains('open')) openTerm();
  else closeTerm();
}

/** called on every astro:page-load — rebuild DOM if the swap destroyed it */
export function syncTerminalAfterSwap(): void {
  if (state.booted || state.log.length) rebuildDom();
  // keep the closed state after navigation
  if (els) {
    els.term.classList.remove('open');
    els.term.hidden = true;
  }
}

export function initTerminalKeybinds(): void {
  loadHistory();

  document.addEventListener('click', (e) => {
    const trigger = (e.target as Element | null)?.closest?.('[data-term-open]');
    if (trigger) {
      e.preventDefault();
      toggleTerm();
    }
  });

  document.addEventListener('keydown', (e) => {
    const inField =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target as HTMLElement | null)?.isContentEditable;

    if (e.key === '`' && !inField) {
      e.preventDefault();
      toggleTerm();
      return;
    }
    if (e.key === 'Escape') {
      const termEl = document.getElementById('jn-term');
      if (termEl && !termEl.hidden && termEl.classList.contains('open')) {
        closeTerm();
      }
    }
  });

  document.addEventListener('jn:close-term', closeTerm);
}
