import { $$, prefersReducedMotion } from './lib/dom';

let io: IntersectionObserver | null = null;

/** reveal-on-scroll for every [data-reveal]; re-run after each view transition */
export function initReveal(): void {
  const els = $$('[data-reveal]');
  if (!els.length) return;

  if (prefersReducedMotion()) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  io ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io?.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );

  els.forEach((el) => io!.observe(el));
}

/** pointer-follow glow on teaser cards (sets --mx/--my custom props) */
export function initCardGlow(): void {
  document.addEventListener(
    'pointermove',
    (e) => {
      const card = (e.target as Element | null)?.closest?.('.teaser');
      if (!(card instanceof HTMLElement)) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      card.style.setProperty('--my', `${e.clientY - rect.top}px`);
    },
    { passive: true }
  );
}
