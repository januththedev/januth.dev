import { LANG_COLORS, type Repo } from './github';

/**
 * Repo card markup, shared by the Astro build (server-rendered into the page)
 * and the browser (live refresh + language filter). Pure string in, string
 * out — no DOM — so both sides produce identical HTML.
 */

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const langColor = (lang: string | null): string => (lang && LANG_COLORS[lang]) || 'var(--accent)';

/** "3 days ago" style, coarse on purpose; `now` is injectable for the build */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const days = Math.floor((now - +new Date(iso)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} yr ago`;
}

/** the name humans read: "orin-router-service" → "orin router service" */
export const prettyName = (name: string): string => name.replace(/[-_]+/g, ' ').toLowerCase();

export function repoCard(r: Repo): string {
  const name = escapeHtml(prettyName(r.name));
  const meta = [
    r.language
      ? `<span><i class="r-lang-dot" style="--dot:${langColor(r.language)}"></i>${escapeHtml(r.language)}</span>`
      : '',
    r.stargazers_count > 0 ? `<span>★ ${r.stargazers_count}</span>` : '',
    r.forks_count > 0 ? `<span>⑂ ${r.forks_count}</span>` : '',
    r.pushed_at
      ? `<span class="r-when" data-pushed="${escapeHtml(r.pushed_at)}">${timeAgo(r.pushed_at)}</span>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const newTab = 'target="_blank" rel="noopener noreferrer"';
  const links = [
    r.homepage
      ? `<a class="r-link live" href="${escapeHtml(r.homepage)}" ${newTab}>live<span aria-hidden="true"> ↗</span><span class="sr-only"> site for ${name} (opens in a new tab)</span></a>`
      : '',
    `<a class="r-link" href="${escapeHtml(r.html_url)}" ${newTab}>code<span aria-hidden="true"> ↗</span><span class="sr-only"> for ${name} on GitHub (opens in a new tab)</span></a>`,
  ].join('');

  return `
    <article class="card repo-card" data-lang="${escapeHtml(r.language ?? 'other')}" data-cursor>
      <h3>${name}</h3>
      ${r.description ? `<p class="r-desc">${escapeHtml(r.description)}</p>` : ''}
      ${r.topics.length ? `<div class="r-topics">${r.topics.map((t) => `<span class="r-topic">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="r-meta">${meta}</div>
      <div class="r-links">${links}</div>
    </article>`;
}

/** language chips, most-used first */
export function languageChips(repos: Repo[]): string[] {
  const counts = new Map<string, number>();
  for (const r of repos) {
    const l = r.language ?? 'other';
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return ['all', ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l)];
}

export function chipsHtml(chips: string[], active = 'all'): string {
  return chips
    .map(
      (c) =>
        `<button type="button" class="chip${c === active ? ' active' : ''}" data-lang="${escapeHtml(c)}" aria-pressed="${c === active}">${escapeHtml(c.toLowerCase())}</button>`
    )
    .join('');
}
