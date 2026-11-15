import { $ } from './lib/dom';
import { site } from '../config/site';
import { getRepos, type Repo } from './github';
import { chipsHtml, escapeHtml, languageChips, repoCard, timeAgo } from './repo-card';

/**
 * Projects page. The Astro build already rendered real cards into the HTML;
 * this refreshes them from the live API (so the page never goes stale between
 * deploys), wires the language filter and adds the 3D tilt. If the API is
 * unreachable the build-time cards simply stay.
 */

function tilt(card: HTMLElement, e: PointerEvent): void {
  if (e.pointerType !== 'mouse') return;
  const rect = card.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width - 0.5;
  const py = (e.clientY - rect.top) / rect.height - 0.5;
  card.style.transform = `rotateY(${px * 7}deg) rotateX(${-py * 6}deg) translateY(-3px)`;
}

export async function initProjectsPage(): Promise<void> {
  const grid = $('#repo-grid');
  if (!grid) return;
  const filtersEl = $('#repo-filters');
  const status = $('#repo-status');

  let repos: Repo[] | null = null;
  let activeLang = 'all';

  const applyFilter = () => {
    let shown = 0;
    for (const card of grid.querySelectorAll<HTMLElement>('.repo-card')) {
      const hit = activeLang === 'all' || card.dataset.lang === activeLang;
      card.hidden = !hit;
      if (hit) shown++;
    }
    if (status) {
      status.textContent = `showing ${shown} ${shown === 1 ? 'repo' : 'repos'}${
        activeLang === 'all' ? '' : ` in ${activeLang.toLowerCase()}`
      }`;
    }
  };

  const paint = () => {
    if (!repos) return;
    grid.innerHTML = repos.map(repoCard).join('');
    if (filtersEl) filtersEl.innerHTML = chipsHtml(languageChips(repos), activeLang);
    applyFilter();
  };

  // listeners live on this page's own elements, so a view-transition swap
  // (which replaces them) can never leave duplicates behind
  if (!grid.dataset.wired) {
    grid.dataset.wired = '1';
    grid.addEventListener('pointermove', (e) => {
      const card = (e.target as Element | null)?.closest?.('.repo-card');
      if (card instanceof HTMLElement) tilt(card, e);
    });
    grid.addEventListener('pointerout', (e) => {
      const card = (e.target as Element | null)?.closest?.('.repo-card');
      if (card instanceof HTMLElement && !card.contains(e.relatedTarget as Node | null)) {
        card.style.transform = '';
      }
    });
    filtersEl?.addEventListener('click', (e) => {
      const btn = (e.target as Element | null)?.closest?.('.chip');
      if (!(btn instanceof HTMLElement)) return;
      activeLang = btn.dataset.lang ?? 'all';
      for (const chip of filtersEl.querySelectorAll('.chip')) {
        const on = chip === btn;
        chip.classList.toggle('active', on);
        chip.setAttribute('aria-pressed', String(on));
      }
      applyFilter();
    });
  }

  // keep "3 days ago" honest for the build-time cards too
  for (const el of grid.querySelectorAll<HTMLElement>('[data-pushed]')) {
    el.textContent = timeAgo(el.dataset.pushed ?? null);
  }

  const hadBuildCards = !!grid.querySelector('.repo-card');
  const { repos: fresh, source } = await getRepos();
  if (!document.body.contains(grid)) return; // navigated away mid-fetch

  if (fresh.length) {
    repos = fresh;
    paint();
  } else if (!hadBuildCards) {
    const gh = `https://github.com/${site.github.username}`;
    grid.innerHTML = `
      <p class="repo-empty">
        ${source === 'error' ? "couldn't reach GitHub just now." : 'no public repos yet.'}
        everything lives at
        <a href="${escapeHtml(gh)}" target="_blank" rel="noopener noreferrer">${escapeHtml(gh.replace('https://', ''))}</a>.
      </p>`;
    if (filtersEl) filtersEl.innerHTML = '';
  }

  if (source === 'mock') {
    const slot = $('#data-badge-slot');
    if (slot) slot.innerHTML = `<span class="data-badge">◐ demo data (useMock is on)</span>`;
  }
}
