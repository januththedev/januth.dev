import { $, prefersReducedMotion, showToast } from './lib/dom';
import { cycleScramble } from './scramble';
import { initCardGlow, initReveal } from './reveal';
import { initCursor } from './cursor';
import { initEggs } from './eggs';
import { syncTerminalAfterSwap, initTerminalKeybinds } from './shell/terminal-ui';

/**
 * Global bootstrapper.
 *
 * One-time inits attach document-level listeners (they survive view
 * transitions). Per-page work happens on astro:page-load: reveal animations,
 * hero particles, projects feed, the 404 game — each guarded by whether its
 * mount point exists on the current page. Heavy modules are dynamically
 * imported only when needed.
 */

const THEMES = ['dark', 'paper', 'matrix', 'vaporwave'] as const;

function applyTheme(name: string, announce = false): void {
  const theme = (THEMES as readonly string[]).includes(name) ? name : 'dark';
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('jn:theme', theme);
  } catch {}
  if (announce) showToast(`theme → ${theme}`);
}

let stopHero: (() => void) | null = null;
let stopGame: (() => void) | null = null;
let stopRoles: (() => void) | null = null;

/* ---------------- preloader ---------------- */

function runPreloader(): void {
  const pre = $('#preloader');
  if (!pre) return;

  let seen = false;
  try {
    seen = !!sessionStorage.getItem('jn:pre-seen');
    sessionStorage.setItem('jn:pre-seen', '1');
  } catch {}

  const finish = () => {
    pre.classList.add('done');
    window.setTimeout(() => pre.remove(), 700);
  };

  if (seen || prefersReducedMotion()) {
    finish();
    return;
  }

  const count = $('#pre-count');
  const start = performance.now();
  const DURATION = 950;
  const tick = (now: number) => {
    if (!document.body.contains(pre)) return; // navigated away mid-preload
    const p = Math.min(1, (now - start) / DURATION);
    if (count) count.textContent = `${Math.round(p * 100)}%`;
    if (p < 1) requestAnimationFrame(tick);
    else finish();
  };
  requestAnimationFrame(tick);
}

/* ---------------- per-page wiring ---------------- */

async function setupHero(): Promise<void> {
  const canvas = $<HTMLCanvasElement>('#hero-canvas');
  if (!canvas) return;

  if (prefersReducedMotion()) {
    canvas.closest('.hero')?.classList.add('reduced-motion-hero');
    return;
  }

  const { initHeroParticles } = await import('./hero/particles');
  stopHero?.();
  const dispose = await initHeroParticles(canvas);
  if (dispose) {
    stopHero = dispose;
  } else {
    // WebGL unavailable → graceful CSS fallback
    canvas.closest('.hero')?.classList.add('no-webgl');
  }
}

function setupRoles(): void {
  const el = $('#role-scramble');
  if (!el) return;
  import('../config/site').then(({ site }) => {
    stopRoles?.();
    stopRoles = cycleScramble(el, site.roles);
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

/* ---------------- lifecycle ---------------- */

function onPageLoad(): void {
  // theme can be lost when the router swaps <html> attributes
  try {
    const t = localStorage.getItem('jn:theme');
    if (t) document.documentElement.dataset.theme = t;
    if (sessionStorage.getItem('jn:party')) document.body.classList.add('party');
  } catch {}

  initReveal();
  runPreloader();
  void setupHero();
  setupRoles();
  void setupProjects();
  setupGame();

  // footer clock + greeting
  updateClock();
}

function updateClock(): void {
  const clock = $('#foot-clock');
  const greet = $('#foot-greeting');
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
    if (!document.body.contains(clock!)) {
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

  applyTheme(localStorage.getItem('jn:theme') ?? 'dark');

  document.addEventListener('jn:set-theme', (e) => {
    applyTheme((e as CustomEvent<string>).detail, true);
  });

  initCursor();
  initEggs();
  initCardGlow();
  initTerminalKeybinds();

  document.addEventListener('astro:before-swap', () => {
    stopHero?.();
    stopGame?.();
    stopHero = stopGame = null;
    stopRoles?.();
    stopRoles = null;
  });

  // astro:page-load also fires on the very first load when the ClientRouter is
  // active; the timestamp guard makes the manual fallback call harmless.
  let lastLoadMs = -1000;
  const guardedPageLoad = () => {
    const now = Date.now();
    if (now - lastLoadMs < 150) return;
    lastLoadMs = now;
    onPageLoad();
  };

  document.addEventListener('astro:after-swap', syncTerminalAfterSwap);
  document.addEventListener('astro:page-load', guardedPageLoad);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', guardedPageLoad, { once: true });
  } else {
    guardedPageLoad();
  }
}

globalInit();
