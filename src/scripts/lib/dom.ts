/**
 * Small DOM + environment helpers shared by all scripts.
 */

export function $<T extends Element = HTMLElement>(
  sel: string,
  root: ParentNode = document
): T | null {
  return root.querySelector<T>(sel);
}

export function $$<T extends Element = HTMLElement>(
  sel: string,
  root: ParentNode = document
): T[] {
  return [...root.querySelectorAll<T>(sel)];
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export const rand = (min: number, max: number): number => min + Math.random() * (max - min);

export const prefersReducedMotion = (): boolean =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isCoarsePointer = (): boolean => matchMedia('(pointer: coarse)').matches;

export { escapeHtml } from '../repo-card';

/** run `fn` now if storage is reachable; storage can throw in locked-down browsers */
export function safeStorage<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

let toastTimer = 0;

export function showToast(message: string): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

/**
 * Navigate through a synthetic link click so Astro's view-transition router
 * intercepts it — programmatic navigation keeps the SPA feel.
 */
export function softNavigate(href: string): void {
  if (location.pathname === href) return;
  const a = document.createElement('a');
  a.href = href;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
