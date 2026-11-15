import { $, safeStorage, showToast } from './lib/dom';
import { initCardGlow, initReveal } from './reveal';
import { initCursor, reapplyCursor } from './cursor';
import { initEggs } from './eggs';
import { initFxGlobal, initFxPage, updateScrollProgress } from './fx';
import { syncTerminalAfterSwap, initTerminalKeybinds } from './shell/terminal-ui';

/**
 * Global bootstrapper.
 *
 * One-time inits attach document-level listeners (they survive view
 * transitions). Per-page work runs once per page: on first load and after
 * every router swap — each piece guarded by whether its mount point exists.
 * Heavy modules (three.js, the 404 game, the projects feed) are dynamically
 * imported only on the pages that use them.
 */

const THEMES = ['dark', 'paper', 'matrix', 'vaporwave'] as const;

const savedTheme = (): string => {
  const t = safeStorage(() => localStorage.getItem('jn:theme'), null) ?? 'dark';
  return (THEMES as readonly string[]).includes(t) ? t : 'dark';
};

function applyTheme(name: string, announce = false): void {
  const theme = (THEMES as readonly string[]).includes(name) ? name : 'dark';
  document.documentElement.dataset.theme = theme;
  safeStorage(() => localStorage.setItem('jn:theme', theme), undefined);
  if (announce) showToast(`theme → ${theme}`);
}

let stopLanding: (() => void) | null = null;
let stopGame: (() => void) | null = null;

/* ---------------- per-page features ---------------- */

/** the landing intro + ASCII head + mask shatter (scripts/landing/) */
function setupLanding(): void {
  const root = $('#landing');
  if (!root) return;
  import('./landing/landing').then(({ initLanding }) => {
    // the visitor may already have navigated on
    if (!root.isConnected) return;
    stopLanding?.();
    stopLanding = initLanding(root);
  });
}

async function setupProjects(): Promise<void> {
  if (!$('#repo-grid')) return;
  const { initProjectsPage } = await import('./projects-page');
  await initProjectsPage();
}

function setupGame(): void {
  if (!$('#game-canvas')) return;
  import('./game404').then(({ initGame404 }) => {
    stopGame?.();
    stopGame = initGame404();
  });
}

/* ---------------- scroll ---------------- */

let scrollTicking = false;
function onScrollFrame(): void {
  scrollTicking = false;
  $('#site-header')?.classList.toggle('scrolled', scrollY > 40);
  updateScrollProgress();
}

function bindScroll(): void {
  addEventListener(
    'scroll',
    () => {
      if (!scrollTicking) {
        scrollTicking = true;
        requestAnimationFrame(onScrollFrame);
      }
    },
    { passive: true }
  );
}

/* ---------------- lifecycle ---------------- */

/** <html> attributes are wiped by every router swap — put ours back before paint */
function restoreRootState(): void {
  const root = document.documentElement;
  root.classList.add('js');
  root.dataset.theme = savedTheme();
  reapplyCursor();
  if (safeStorage(() => sessionStorage.getItem('jn:party'), null)) {
    document.body.classList.add('party');
  }
}

function onPageLoad(): void {
  restoreRootState();
  initReveal();
  initFxPage();
  setupLanding();
  void setupProjects();
  setupGame();
  updateClock();
  onScrollFrame();
}

function updateClock(): void {
  const clock = $('#foot-clock');
  const greet = $('#foot-greeting');
  const yearEl = $('#foot-year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  if (!clock && !greet) return;
  const tick = () => {
    const now = new Date();
    if (clock) clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const h = now.getHours();
    if (greet) {
      greet.textContent =
        h < 5 ? 'night owl hours' : h < 12 ? 'good morning' : h < 18 ? 'good afternoon' : 'good evening';
    }
  };
  tick();
  const timer = window.setInterval(() => {
    if (!clock || !document.body.contains(clock)) {
      clearInterval(timer);
      return;
    }
    tick();
  }, 30_000);
}

/* ---------------- one-time global init ---------------- */

let globalInitDone = false;
function globalInit(): void {
  if (globalInitDone) return;
  globalInitDone = true;

  applyTheme(savedTheme());

  document.addEventListener('jn:set-theme', (e) => {
    applyTheme((e as CustomEvent<string>).detail, true);
  });
  // `intro` in the shell replays the landing sequence
  document.addEventListener('jn:replay-intro', () => {
    safeStorage(() => sessionStorage.removeItem('jn:intro-seen'), undefined);
    if (location.pathname === '/') location.reload();
    else location.href = '/';
  });

  initCursor();
  initEggs();
  initCardGlow();
  initFxGlobal();
  initTerminalKeybinds();
  bindScroll();

  // Per-page init runs exactly once per page. `pageReady` is true while the
  // current page has been initialised and is cleared right before each swap,
  // so the router's own astro:page-load on first load is ignored when we have
  // already run (it fires on window `load`, which can be seconds later).
  let pageReady = false;
  const runPage = () => {
    if (pageReady) return;
    pageReady = true;
    onPageLoad();
  };

  document.addEventListener('astro:before-swap', () => {
    pageReady = false;
    stopLanding?.();
    stopGame?.();
    stopLanding = stopGame = null;
  });
  document.addEventListener('astro:after-swap', () => {
    restoreRootState();
    syncTerminalAfterSwap();
  });
  document.addEventListener('astro:page-load', runPage);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runPage, { once: true });
  } else {
    runPage();
  }
}

globalInit();
