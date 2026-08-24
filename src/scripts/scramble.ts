import { prefersReducedMotion } from './lib/dom';

const GLYPHS = '!<>-_\\/[]{}—=+*^?#________';

interface QueueItem {
  from: string;
  to: string;
  start: number;
  end: number;
  char?: string;
}

/**
 * Text-scramble effect: characters resolve left-to-right out of random glyphs.
 * Used for the hero role cycler and anywhere `data-scramble` text swaps.
 */
export class Scramble {
  private el: HTMLElement;
  private queue: QueueItem[] = [];
  private frame = 0;
  private rafId = 0;
  private resolveFn: (() => void) | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  setText(newText: string): Promise<void> {
    if (prefersReducedMotion()) {
      this.el.textContent = newText;
      return Promise.resolve();
    }
    const oldText = this.el.textContent ?? '';
    const length = Math.max(oldText.length, newText.length);
    this.queue = [];
    for (let i = 0; i < length; i++) {
      const from = oldText[i] ?? '';
      const to = newText[i] ?? '';
      const start = Math.floor(Math.random() * 24);
      const end = start + Math.floor(Math.random() * 24);
      this.queue.push({ from, to, start, end });
    }
    cancelAnimationFrame(this.rafId);
    this.frame = 0;
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.update();
    });
  }

  private update = () => {
    let output = '';
    let done = 0;
    for (const q of this.queue) {
      if (this.frame >= q.end) {
        done++;
        output += q.to;
      } else if (this.frame >= q.start) {
        if (!q.char || Math.random() < 0.28) {
          q.char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
        output += `<span class="scr">${q.char}</span>`;
      } else {
        output += q.from;
      }
    }
    this.el.innerHTML = output;
    if (done === this.queue.length) {
      this.resolveFn?.();
      this.resolveFn = null;
      return;
    }
    this.frame++;
    this.rafId = requestAnimationFrame(this.update);
  };

  cancel(): void {
    cancelAnimationFrame(this.rafId);
    this.resolveFn?.();
    this.resolveFn = null;
  }
}

/**
 * Vertical word rotator (the "i love creating ___" line): words are stacked
 * absolutely inside .create-rotator; this cycles which one is visible with a
 * slide-up/fade, house-style.
 */
export function cycleWords(rotator: HTMLElement, intervalMs = 2200): () => void {
  const words = [...rotator.children] as HTMLElement[];
  if (!words.length) return () => {};
  words.forEach((w, i) => {
    w.style.top = i === 0 ? '0' : '1.2em';
    w.style.opacity = i === 0 ? '1' : '0';
  });
  let idx = 0;
  const timer = window.setInterval(() => {
    const prev = words[idx];
    idx = (idx + 1) % words.length;
    const next = words[idx];
    prev.style.top = '-1.2em';
    prev.style.opacity = '0';
    next.style.top = '0';
    next.style.opacity = '1';
  }, prefersReducedMotion() ? intervalMs * 3 : intervalMs);
  return () => clearInterval(timer);
}

/** cycle an element's text through `phrases`, scrambling between each */
export function cycleScramble(el: HTMLElement, phrases: readonly string[], intervalMs = 2800): () => void {
  if (prefersReducedMotion()) {
    // gentle crossfade-less rotation, no scramble noise
    let i = 0;
    const t = window.setInterval(() => {
      i = (i + 1) % phrases.length;
      el.textContent = phrases[i];
    }, intervalMs * 2);
    return () => clearInterval(t);
  }
  const scrambler = new Scramble(el);
  let stopped = false;
  let timer = 0;
  const run = async () => {
    let i = 0;
    while (!stopped) {
      i = (i + 1) % phrases.length;
      await scrambler.setText(phrases[i]);
      await new Promise((r) => {
        timer = window.setTimeout(r, intervalMs);
      });
    }
  };
  run();
  return () => {
    stopped = true;
    clearTimeout(timer);
    scrambler.cancel();
  };
}
