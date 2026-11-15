import { escapeHtml } from '../lib/dom';
import { site } from '../../config/site';
import { commands, commandNames, type ShellCtx } from './commands';
import { parse, suggest } from './parser';
import { buildFs, listDir, resolvePath, type VDir } from './vfs';
import { cleanOutput, completeRemote, connect, exec, remote, startHeartbeat, stopHeartbeat, type OscAction } from './remote';

/**
 * JN shell UI: bottom drawer with scrollback + prompt.
 *
 * Two engines behind one prompt:
 *   - linux:   a real Linux machine forked for this visitor (src/lib/shell),
 *              reached through /api/shell. Every command is real bash.
 *   - virtual: the hand-rolled tokenizer → parser → virtual fs, used when the
 *              machine is unavailable (static deploy, no credentials, busy).
 * A handful of site verbs (clear, exit, matrix…) always run locally.
 *
 * State lives in module scope so it survives Astro view transitions; the DOM
 * is rebuilt idempotently on page-load. Toggle with backtick, the header
 * button or the floating FAB.
 */

interface LogLine {
  text: string;
  cls?: 'dim' | 'cmd' | 'err' | 'ok' | 'warn';
}

const state = {
  booted: false,
  engine: 'virtual' as 'linux' | 'virtual',
  fs: null as VDir | null,
  cwd: '/',
  hist: [] as string[],
  hIdx: -1,
  draft: '',
  log: [] as LogLine[],
  busy: false,
  abort: null as AbortController | null,
};

/** site verbs that act on the browser — run locally even when Linux is online */
const LOCAL = new Set(['clear', 'exit', 'cursor', 'matrix', 'vaporwave', 'konami', 'repos', 'neofetch', 'contact', 'whoami']);

let els: {
  term: HTMLElement;
  body: HTMLDivElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  prompt: HTMLSpanElement;
  title: HTMLSpanElement;
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

/** /home/<user>/x → ~/x, for display */
const tilde = (p: string) => p.replace(/^\/home\/[^/]+(?=\/|$)/, '~').replace(/^\/root(?=\/|$)/, '~') || '~';

function shortCwd(): string {
  if (state.engine === 'linux') return tilde(remote.cwd);
  return state.cwd === '/' ? '~' : '~' + state.cwd;
}

function renderPrompt(): void {
  if (!els) return;
  const host = state.engine === 'linux' ? 'jn-linux' : 'portfolio';
  els.prompt.innerHTML = `<span style="color:var(--text)">visitor</span>@<span style="color:var(--accent)">${host}</span>:<span class="path">${escapeHtml(shortCwd())}</span>$`;
  els.title.textContent =
    state.engine === 'linux' ? `visitor@jn-linux — bash (real linux)` : remote.status === 'connecting' ? 'booting linux…' : 'januth@jn — jn-shell';
}

/** append to the DOM only (no state change) — used when rebuilding after a swap */
function domAppend({ text, cls }: LogLine): HTMLDivElement | null {
  if (!els) return null;
  const div = document.createElement('div');
  div.className = `line${cls ? ` ${cls}` : ''}`;
  div.textContent = text;
  els.body.appendChild(div);
  els.body.scrollTop = els.body.scrollHeight;
  return div;
}

function appendLine(line: LogLine): void {
  state.log.push(line);
  if (state.log.length > 600) state.log.shift();
  domAppend(line);
}

function appendBlock(text: string, cls?: LogLine['cls']): void {
  const trimmed = text.replace(/\n+$/, '');
  if (!trimmed) return;
  for (const l of trimmed.split('\n')) appendLine({ text: l, cls });
}

function renderError(text: string): void {
  appendLine({ text: text.startsWith('\u0000ERR') ? text.slice(4) : text, cls: 'err' });
}

/** memoised: opening the drawer and submitting a command share one boot */
let bootP: Promise<void> | null = null;
function ensureBoot(): Promise<void> {
  return (bootP ??= (async () => {
    state.booted = true;
    state.fs = buildFs(); // the fallback is always ready
    appendLine({ text: '\n  ██ JN SHELL', cls: 'dim' });
    appendLine({ text: '  booting your own Linux machine…', cls: 'dim' });
    renderPrompt();
    const online = await connect();
    if (online) {
      state.engine = 'linux';
      appendLine({ text: `  ✓ ${remote.system || 'linux'}`, cls: 'ok' });
      appendLine({
        text: '  a real machine, forked for you. break it — nobody else will notice.\n  start with: cat README.md   ·   ls projects   ·   januth\n',
        cls: 'dim',
      });
      startHeartbeat();
    } else {
      state.engine = 'virtual';
      appendLine({ text: `  ✗ ${remote.reason}`, cls: 'warn' });
      appendLine({
        text: '  falling back to jn-shell — hand-rolled tokenizer → parser → virtual fs.\n  type help to see every verb. some verbs hide.\n',
        cls: 'dim',
      });
    }
    renderPrompt();
  })());
}

function rebuildDom(): void {
  if (document.getElementById('jn-term') && els) return;

  document.getElementById('jn-term')?.remove();

  const term = document.createElement('section');
  term.id = 'jn-term';
  term.className = 'jn-term';
  term.setAttribute('role', 'dialog');
  term.setAttribute('aria-modal', 'false');
  term.setAttribute('aria-label', 'JN terminal');
  term.hidden = true;
  term.innerHTML = `
    <div class="term-head">
      <span class="term-dots"><i></i><i></i><i></i></span>
      <span class="term-title"></span>
      <button type="button" class="term-close" aria-label="Close terminal">✕</button>
    </div>
    <div class="term-body" role="log" aria-live="polite" tabindex="0" aria-label="terminal output"></div>
    <form class="term-form">
      <span class="term-prompt"></span>
      <input id="term-input" autocomplete="off" spellcheck="false" autocapitalize="off"
        aria-label="terminal input" placeholder="type a command… (help)" />
      <span class="term-keyhint">tab completes · ↑ history · ctrl+c stops · esc closes</span>
    </form>`;

  document.body.appendChild(term);

  els = {
    term,
    body: term.querySelector('.term-body') as HTMLDivElement,
    form: term.querySelector('.term-form') as HTMLFormElement,
    input: term.querySelector('#term-input') as HTMLInputElement,
    prompt: term.querySelector('.term-prompt') as HTMLSpanElement,
    title: term.querySelector('.term-title') as HTMLSpanElement,
  };

  for (const line of state.log) domAppend(line);

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    void submit(els!.input.value);
  });

  els.input.addEventListener('keydown', onInputKeydown);
  term.querySelector('.term-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTerm();
  });
  // clicking the drawer focuses the prompt — unless the visitor is selecting text
  term.addEventListener('click', () => {
    if (!getSelection()?.toString()) els?.input.focus();
  });

  renderPrompt();
}

/* ---------------- virtual engine ---------------- */

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
    renderError(
      /\|\s*$|^\s*\||\|\s*\|/.test(line)
        ? 'jn-shell: syntax error near `|` — a pipe needs a command on both sides'
        : 'jn-shell: could not parse that. quotes balanced?'
    );
    return;
  }

  const ctx = makeCtx();
  let carry: string | null = null;

  for (const seg of parsed) {
    const cmd = Object.hasOwn(commands, seg.name) ? commands[seg.name] : undefined;
    if (!cmd) {
      const sugg = suggest(seg.name, commandNames(true));
      renderError(`command not found: ${seg.name}` + (sugg ? ` — did you mean \`${sugg}\`?` : ' — try `help`'));
      return;
    }
    ctx.pipeIn = carry;
    const out = await cmd.run(seg.args, ctx);
    if (typeof out === 'string' && out.startsWith('\u0000ERR')) {
      renderError(out); // a failed stage aborts the pipeline, like a real shell
      return;
    }
    const isLast = seg === parsed[parsed.length - 1];
    // only the last stage prints; earlier stages feed the next one's stdin
    if (isLast && typeof out === 'string') {
      for (const l of out.split('\n')) appendLine({ text: l });
    }
    carry = typeof out === 'string' ? out : '';
  }
}

/* ---------------- linux engine ---------------- */

/** the machine's custom commands ask the browser to do things via OSC escapes */
function perform({ action, arg }: OscAction): void {
  switch (action) {
    case 'theme':
      document.dispatchEvent(new CustomEvent('jn:set-theme', { detail: arg }));
      break;
    case 'open':
      void commands.open.run([arg], makeCtx());
      break;
    case 'mail':
      location.href = `mailto:${site.email}?subject=let%27s%20build%20something`;
      break;
    case 'intro':
      document.dispatchEvent(new CustomEvent('jn:replay-intro'));
      break;
  }
}

const LINUX_HELP = `this is a real Linux machine (bash), forked just for you.
everything you know works: ls, cd, cat, grep, pipes, curl, git, python3, node…

added on top by this website:
  januth               the business card
  hire-me              open an email to me
  theme <name>         reskin the site (dark, paper — two more hide)
  open <page|url>      navigate: home, projects, about, github
  intro                replay the landing intro
  clear · exit         clear the screen · close the terminal

limits: one command at a time (no vim/top/REPLs), 20s per command,
outbound network only to package registries and github.`;

async function runRemote(line: string): Promise<void> {
  const pending = domAppend({ text: '…', cls: 'dim' });
  const ctrl = new AbortController();
  state.abort = ctrl;
  try {
    const r = await exec(line, ctrl.signal);
    pending?.remove();
    const out = cleanOutput(r.stdout);
    const err = cleanOutput(r.stderr);
    appendBlock(out.text);
    appendBlock(err.text, r.exitCode === 0 ? 'dim' : 'err');
    for (const a of [...out.actions, ...err.actions]) perform(a);
    renderPrompt();
  } catch (e) {
    pending?.remove();
    if ((e as Error).name === 'AbortError') {
      appendLine({ text: '^C', cls: 'dim' });
      return;
    }
    const msg = (e as Error).message || 'the machine stopped answering';
    renderError(`linux: ${msg}`);
    if (remote.status !== 'online') {
      // the machine is gone for good — keep the visitor productive
      state.engine = 'virtual';
      stopHeartbeat();
      appendLine({ text: 'switched to jn-shell (virtual). type help.', cls: 'warn' });
      renderPrompt();
    }
  } finally {
    state.abort = null;
  }
}

/* ---------------- submit ---------------- */

async function submit(raw: string): Promise<void> {
  if (state.busy) return;
  const line = raw.trim();
  if (!els) return;

  appendLine({ text: `${shortCwd()} $ ${line}`, cls: 'cmd' });
  els.input.value = '';

  if (!line) return;
  if (state.hist[state.hist.length - 1] !== line) {
    state.hist.push(line);
    saveHistory();
  }
  state.hIdx = -1;
  state.draft = '';

  state.busy = true;
  els.form.classList.add('busy');
  try {
    await ensureBoot();
    const first = line.split(/\s+/)[0];
    const simple = !/[|;&<>`$(]/.test(line);
    if (state.engine === 'linux' && first === 'help' && simple) appendBlock(LINUX_HELP);
    else if (state.engine === 'linux' && !(LOCAL.has(first) && simple)) await runRemote(line);
    else await execLine(line);
  } catch (e) {
    renderError(`shell hiccup: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    state.busy = false;
    els?.form.classList.remove('busy');
    els?.body.scrollTo({ top: els.body.scrollHeight });
    els?.input.focus();
  }
}

/* ---------------- key handling & completion ---------------- */

function applyCompletion(parts: string[], fragment: string, matches: string[]): void {
  if (!els || !matches.length) return;
  if (matches.length === 1) {
    parts[parts.length - 1] = matches[0];
    els.input.value = parts.join(' ') + (matches[0].endsWith('/') ? '' : ' ');
    return;
  }
  let prefix = matches[0];
  for (const m of matches) while (!m.startsWith(prefix)) prefix = prefix.slice(0, -1);
  if (prefix.length > fragment.length) {
    parts[parts.length - 1] = prefix;
    els.input.value = parts.join(' ');
  } else {
    appendLine({ text: matches.join('   '), cls: 'dim' });
  }
}

async function complete(): Promise<void> {
  if (!els) return;
  const value = els.input.value;
  const parts = value.split(/\s+/);
  // the word right after a pipe is a command too
  const completingFirst = parts.length <= 1 || parts[parts.length - 2] === '|';
  const fragment = parts[parts.length - 1] ?? '';

  if (state.engine === 'linux') {
    if (state.busy) return; // one request at a time to the machine
    const options = await completeRemote(fragment, completingFirst);
    if (els.input.value !== value || state.busy) return; // the visitor kept typing
    const local = completingFirst ? [...LOCAL, 'help'] : [];
    applyCompletion(parts, fragment, [...new Set([...options, ...local])].filter((o) => o.startsWith(fragment)).sort());
    return;
  }

  if (!state.fs) return;
  let options: string[];
  if (completingFirst) {
    options = commandNames(false);
  } else {
    const slash = fragment.lastIndexOf('/');
    const dirPart = slash >= 0 ? fragment.slice(0, slash + 1) : ''; // keeps the trailing slash, so "/" works
    const base = slash >= 0 ? fragment.slice(slash + 1) : fragment;
    const absDir = resolvePath(state.cwd, dirPart || '.');
    const entries = listDir(state.fs, absDir ?? '/')
      // dotfiles only complete once you have typed the dot, like ls without -a
      .filter((e) => base.startsWith('.') || !e.name.startsWith('.'));
    options = entries.map((e) => dirPart + e.name + (e.isDir ? '/' : ''));
  }
  applyCompletion(parts, fragment, options.filter((o) => o.startsWith(fragment)));
}

function onInputKeydown(e: KeyboardEvent): void {
  if (!els) return;

  if (e.key === 'Tab') {
    e.preventDefault();
    void complete();
    return;
  }

  // ctrl+c: stop the running command, or abandon the current line
  // (with text selected, ctrl+c stays a copy)
  if (e.key === 'c' && e.ctrlKey && !e.metaKey) {
    if (state.abort) {
      e.preventDefault();
      state.abort.abort();
      return;
    }
    if (els.input.selectionStart === els.input.selectionEnd) {
      e.preventDefault();
      appendLine({ text: `${shortCwd()} $ ${els.input.value}^C`, cls: 'cmd' });
      els.input.value = '';
      return;
    }
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

/** whatever had focus before the drawer opened gets it back on close */
let returnFocus: HTMLElement | null = null;

export function openTerm(): void {
  rebuildDom();
  if (!els) return;
  const prev = document.activeElement;
  returnFocus = prev instanceof HTMLElement && !els.term.contains(prev) ? prev : null;
  els.term.hidden = false;
  requestAnimationFrame(() => {
    els?.term.classList.add('open');
    els?.input.focus();
  });
  void ensureBoot();
  if (state.engine === 'linux') startHeartbeat();
}

export function closeTerm(): void {
  if (!els) return;
  els.term.classList.remove('open');
  window.setTimeout(() => {
    if (els && !els.term.classList.contains('open')) els.term.hidden = true;
  }, 400);
  if (returnFocus && document.body.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
  else (document.activeElement as HTMLElement | null)?.blur?.();
  returnFocus = null;
  // a closed terminal stops keeping the machine awake; it sleeps after its timeout
  stopHeartbeat();
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

    // bare backtick only: never fight browser/OS shortcuts or key-repeat
    if (e.key === '`' && !inField && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
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
