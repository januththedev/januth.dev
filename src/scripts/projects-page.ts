import { $, escapeHtml } from './lib/dom';
import { getRepos, LANG_COLORS, type Repo } from './github';

/**
 * Projects page: renders the live GitHub pulse — filter chips + repo cards
 * with a subtle 3D tilt. Data source (live/cache/mock) comes from getRepos().
 */

function langColor(lang: string | null): string {
  return (lang && LANG_COLORS[lang]) || '#22d3ee';
}

function repoCard(r: Repo): string {
  const lang = r.language ?? 'code';
  return `
    <a class="card repo-card" href="${escapeHtml(r.html_url)}" target="_blank" rel="noopener noreferrer" data-cursor>
      <h3>${escapeHtml(r.name)}<span class="ext">↗</span></h3>
      <p class="r-desc">${escapeHtml(r.description) || '<em>no description — mysterious.</em>'}</p>
      <div class="r-meta">
        <span><i class="r-lang-dot" style="--dot:${langColor(r.language)}"></i>${escapeHtml(lang)}</span>
        <span>★ ${r.stargazers_count}</span>
        <span>⑂ ${r.forks_count}</span>
      </div>
      ${r.topics.length ? `<div class="r-topics">${r.topics.map((t) => `<span class="r-topic">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </a>`;
}

function tilt(card: HTMLElement, e: PointerEvent): void {
  const rect = card.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width - 0.5;
  const py = (e.clientY - rect.top) / rect.height - 0.5;
  card.style.transform = `rotateY(${px * 9}deg) rotateX(${-py * 8}deg) translateY(-3px)`;
}

export async function initProjectsPage(): Promise<void> {
  const grid = $('#repo-grid');
  if (!grid) return;

  const filtersEl = $('#repo-filters');
  const badgeSlot = $('#data-badge-slot');

  const { repos, source } = await getRepos();

  if (badgeSlot && source === 'mock') {
    badgeSlot.innerHTML = `
      <span class="data-badge">◐ demo data — flip <strong>useMock</strong> to false in
      <em>src/config/site.ts</em> to go live</span>`;
  }

  let activeLang = 'all';

  const render = () => {
    const shown =
      activeLang === 'all' ? repos : repos.filter((r) => (r.language ?? 'code') === activeLang);
    grid.innerHTML = shown.map(repoCard).join('') ||
      `<p class="section-sub">nothing here in ${escapeHtml(activeLang)} yet.</p>`;

    for (const card of grid.querySelectorAll<HTMLElement>('.repo-card')) {
      card.addEventListener('pointermove', (e) => tilt(card, e));
      card.addEventListener('pointerleave', () => {
        card.style.transform = '';
      });
    }
  };

  if (filtersEl) {
    const langs = [...new Set(repos.map((r) => r.language ?? 'code'))].sort((a, b) =>
      repos.filter((r) => (r.language ?? 'code') === b).length -
      repos.filter((r) => (r.language ?? 'code') === a).length
    );
    const chips = ['all', ...langs];
    filtersEl.innerHTML = chips
      .map(
        (c, i) =>
          `<button class="chip${i === 0 ? ' active' : ''}" data-lang="${escapeHtml(c)}">${escapeHtml(c)}</button>`
      )
      .join('');
    filtersEl.addEventListener('click', (e) => {
      const btn = (e.target as Element | null)?.closest?.('.chip');
      if (!(btn instanceof HTMLElement)) return;
      activeLang = btn.dataset.lang ?? 'all';
      for (const chip of filtersEl.querySelectorAll('.chip')) chip.classList.remove('active');
      btn.classList.add('active');
      render();
    });
  }

  render();
}
