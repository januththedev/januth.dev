import { prefersReducedMotion } from '../lib/dom';
import type { AsciiStage } from './ascii-stage';

/**
 * The landing sequence.
 *
 *   intro (timed, ~6s, once per session, any input skips it)
 *     JN → characters erupt from behind it and fill the screen → drain to
 *     black → "Hello There!" → "I'm Januth Nimnal" → the hero, with an ASCII
 *     head assembling beside it
 *
 *   scroll (the #landing runway, ends exactly where #work begins)
 *     hero text lifts away → the head centres → the mask cracks and its
 *     shards fly past the camera → what was under it dissolves to black
 *
 * Phases are written to data-phase on #landing; CSS owns every text
 * transition. This file only owns time, scroll and the WebGL stage.
 */

type Phase = 'jn' | 'burst' | 'drain' | 'hello' | 'hello-out' | 'name' | 'hero';

// seconds from the moment the stage is ready
const T = {
  burstStart: 0.75,
  burstEnd: 2.05,
  drainEnd: 2.85,
  hello: 3.0,
  helloOut: 4.3,
  name: 4.75,
  hero: 6.2,
  assembleStart: 5.9,
  assembleEnd: 7.3,
};
// the intro plays on every full load of the home page; coming back to it
// through the site's own navigation goes straight to the hero
let firstLoad = true;
const STAGE_WAIT_MS = 1600; // the JN holds at most this long while three.js loads

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ramp = (a: number, b: number, x: number) => clamp01((x - a) / (b - a));
const smooth = (a: number, b: number, x: number) => {
  const t = ramp(a, b, x);
  return t * t * (3 - 2 * t);
};
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t;

/** counts a stat to its value; the joke stat counts DOWN on purpose */
function countUp(el: HTMLElement): void {
  const to = el.dataset.countTo ?? '';
  const fromRaw = el.dataset.countFrom ?? '';
  if (!fromRaw || !/\d/.test(to)) return;
  const toNum = parseInt(to.replace(/\D/g, ''), 10);
  const fromNum = parseInt(fromRaw, 10);
  const prefix = /^\D+/.exec(to)?.[0] ?? '';
  const suffix = /\D+$/.exec(to)?.[0] ?? '';
  const start = performance.now();
  const tick = (now: number) => {
    if (!el.isConnected) return;
    const k = Math.min(1, (now - start) / 1300);
    el.textContent = `${prefix}${Math.round(fromNum + (toNum - fromNum) * easeOut(k))}${suffix}`;
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function initLanding(root: HTMLElement): () => void {
  const canvas = root.querySelector<HTMLCanvasElement>('#ascii-canvas');
  const html = document.documentElement;
  const reduced = prefersReducedMotion();
  const seen = !firstLoad;
  firstLoad = false;

  let disposed = false;
  let stage: AsciiStage | null = null;
  let raf = 0;
  let clockStart = -1; // performance.now() when the intro clock started
  let offset = 0; // seconds added by a skip
  let introDone = false;
  let phase: Phase | '' = '';
  let visible = true;

  html.classList.remove('intro-pending');

  // scroll beats: each [data-beat="from to"] gets its local progress as --t
  const beats = [...root.querySelectorAll<HTMLElement>('[data-beat]')].map((el) => {
    const [from, to] = (el.dataset.beat ?? '0 0').split(/\s+/).map(Number);
    return { el, from, to, played: false };
  });
  const updateBeats = (p: number) => {
    for (const b of beats) {
      const t = clamp01((p - b.from) / (b.to - b.from));
      const on = p > b.from && p < b.to;
      b.el.style.setProperty('--t', t.toFixed(4));
      b.el.classList.toggle('on', on);
      if (on && !b.played) {
        b.played = true;
        b.el.querySelectorAll<HTMLElement>('[data-count-from]').forEach(countUp);
      }
    }
  };

  const setPhase = (p: Phase) => {
    if (p === phase) return;
    phase = p;
    root.dataset.phase = p;
  };

  // ---------- reduced motion: no intro, no WebGL — the hero, still ----------
  if (reduced) {
    html.classList.remove('intro-lock', 'intro-pending');
    setPhase('hero');
    return () => {};
  }

  const playIntro = !seen;
  setPhase(playIntro ? 'jn' : 'hero');
  if (playIntro) {
    html.classList.add('intro-lock');
    scrollTo(0, 0);
  }

  const finishIntro = () => {
    if (introDone) return;
    introDone = true;
    html.classList.remove('intro-lock');
    removeSkipListeners();
  };

  // any deliberate input fast-forwards to the hero
  const skip = (e?: Event) => {
    if (introDone || phase === 'hero') return;
    if (e instanceof KeyboardEvent && (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Tab')) return;
    if (clockStart < 0) clockStart = performance.now();
    const elapsed = (performance.now() - clockStart) / 1000 + offset;
    offset += Math.max(0, T.hero - 0.35 - elapsed);
  };
  const skipBtn = root.querySelector<HTMLButtonElement>('#intro-skip');
  const skipEvents = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
  const removeSkipListeners = () => {
    for (const ev of skipEvents) removeEventListener(ev, skip);
  };
  if (playIntro) {
    for (const ev of skipEvents) addEventListener(ev, skip, { passive: true });
    skipBtn?.addEventListener('click', () => skip());
  }

  // ---------- the frame loop ----------
  const frame = (now: number) => {
    raf = 0;
    if (disposed) return;

    // intro clock
    let e = T.assembleEnd + 1; // "long after the intro" when it isn't playing
    if (playIntro && !introDone) {
      if (clockStart < 0) e = 0;
      else e = (now - clockStart) / 1000 + offset;
      setPhase(
        e < T.burstStart ? 'jn'
        : e < T.burstEnd ? 'burst'
        : e < T.hello ? 'drain'
        : e < T.helloOut ? 'hello'
        : e < T.name ? 'hello-out'
        : e < T.hero ? 'name'
        : 'hero'
      );
      if (e >= T.assembleEnd) finishIntro();
    } else {
      setPhase('hero');
    }

    // scroll progress through the runway (0 at the top, 1 as #work arrives)
    const rect = root.getBoundingClientRect();
    const runway = Math.max(1, root.offsetHeight - innerHeight);
    const p = clamp01(-rect.top / runway);
    root.style.setProperty('--p', p.toFixed(4));
    updateBeats(p);

    if (stage) {
      const s = stage.state;
      if (playIntro && !introDone) {
        s.burst = easeOut(ramp(T.burstStart, T.burstEnd, e));
        s.drain = easeIn(ramp(T.burstEnd - 0.05, T.drainEnd, e));
      } else {
        s.burst = 1;
        s.drain = 1;
      }
      // returning visitors get a short assemble instead of the full intro
      s.assemble = playIntro ? ramp(T.assembleStart, T.assembleEnd, e) : Math.min(1, s.assemble + 0.025);
      // beside the beats first; centre stage for the break
      // the break plays behind the text beats and finishes on "that's a lot."
      s.crack = smooth(0.07, 0.2, p);
      s.explode = smooth(0.2, 0.6, p);
      s.centre = smooth(0.55, 0.66, p);
      s.fly = smooth(0.66, 0.86, p);
      s.blast = ramp(0.67, 0.85, p);
      s.out = smooth(0.86, 0.95, p);
      const narrow = innerWidth / innerHeight < 1.15;
      // on phones the head sits behind the text: dim while text is up, full for the finale
      s.dim = narrow ? 0.4 + 0.6 * s.centre : 1;
      stage.render(now);
    }

    const animating = !introDone && playIntro;
    if ((visible && !document.hidden) || animating) raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    if (!raf && !disposed) raf = requestAnimationFrame(frame);
  };

  // ---------- boot the stage (three.js is a separate chunk) ----------
  const startClock = () => {
    if (clockStart < 0) clockStart = performance.now();
  };
  const waitTimer = window.setTimeout(startClock, STAGE_WAIT_MS);
  if (canvas) {
    // the glyph atlas is drawn once, so the mono font must be ready first
    const fontReady = (document.fonts?.load('700 48px "JetBrains Mono"') ?? Promise.resolve()).catch(() => {});
    Promise.all([import('./ascii-stage'), fontReady])
      .then(([{ createAsciiStage }]) => {
        if (disposed) return;
        stage = createAsciiStage(canvas);
        if (!stage) root.classList.add('no-webgl');
        startClock();
        wake();
      })
      .catch(() => {
        root.classList.add('no-webgl');
        startClock();
      });
  } else {
    startClock();
  }
  wake();

  // ---------- environment ----------
  const onPointer = (ev: PointerEvent) => {
    stage?.setPointer((ev.clientX / innerWidth) * 2 - 1, (ev.clientY / innerHeight) * 2 - 1);
  };
  let resizeTimer = 0;
  let lastW = innerWidth;
  let lastH = innerHeight;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      // mobile URL bars resize constantly while scrolling — ignore small height-only changes
      if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 140) return;
      lastW = innerWidth;
      lastH = innerHeight;
      stage?.resize();
      wake();
    }, 150);
  };
  const io = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) wake();
  });
  io.observe(root);
  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('resize', onResize);
  addEventListener('scroll', wake, { passive: true });
  document.addEventListener('visibilitychange', wake);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    clearTimeout(waitTimer);
    clearTimeout(resizeTimer);
    io.disconnect();
    removeSkipListeners();
    removeEventListener('pointermove', onPointer);
    removeEventListener('resize', onResize);
    removeEventListener('scroll', wake);
    document.removeEventListener('visibilitychange', wake);
    html.classList.remove('intro-lock');
    stage?.dispose();
    stage = null;
  };
}
