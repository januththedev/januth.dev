import { site } from '../config/site';

export interface Repo {
  name: string;
  description: string;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  topics: string[];
  /** deployed site, when the repo declares one */
  homepage: string | null;
  /** ISO date of the last push */
  pushed_at: string | null;
}

/** where a repo list came from; 'error' means "GitHub unreachable, nothing cached" */
export type DataSource = 'live' | 'cache' | 'mock' | 'error';

export interface RepoStats {
  /** public, non-fork, non-archived repos */
  repos: number;
  /** of those, how many declare a deployed homepage */
  live: number;
  languages: number;
}

/** GitHub language colors (subset — anything unknown falls back to the accent) */
export const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Rust: '#dea584',
  Go: '#00ADD8',
  Java: '#b07219',
  Kotlin: '#A97BFF',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Shell: '#89e051',
  Lua: '#000080',
  Vue: '#41b883',
  Astro: '#ff5a03',
};

const CACHE_KEY = `jn:repos:v2:${site.github.username}`;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Demo data for local development ONLY. Returned solely when
 * `site.github.useMock` is true — it is never a fallback for real visitors:
 * a failed fetch yields an honest empty/error state instead of invented work.
 */
const MOCK_REPOS: Repo[] = [
  {
    name: 'demo-repo-one',
    description: 'Placeholder repo shown only while useMock is on.',
    html_url: `https://github.com/${site.github.username}`,
    language: 'TypeScript',
    stargazers_count: 0,
    forks_count: 0,
    topics: ['demo'],
    homepage: null,
    pushed_at: null,
  },
  {
    name: 'demo-repo-two',
    description: 'Another placeholder, in a second language so the filter has something to do.',
    html_url: `https://github.com/${site.github.username}`,
    language: 'Python',
    stargazers_count: 0,
    forks_count: 0,
    topics: ['demo'],
    homepage: null,
    pushed_at: null,
  },
];

interface CacheShape {
  ts: number;
  repos: Repo[];
}

function readCache(): CacheShape | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    return Array.isArray(parsed?.repos) && parsed.repos.every((r) => Array.isArray(r?.topics))
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function writeCache(repos: Repo[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), repos } satisfies CacheShape));
  } catch {
    /* storage full/blocked — non-fatal */
  }
}

interface GhRepo {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
  archived?: boolean;
  homepage?: string | null;
  topics?: string[];
  pushed_at: string;
}

const isUrl = (s: string | null | undefined): s is string => !!s && /^https?:\/\//i.test(s);

function mapRepo(r: GhRepo): Repo {
  return {
    name: r.name,
    description: r.description ?? '',
    html_url: r.html_url,
    language: r.language,
    stargazers_count: r.stargazers_count,
    forks_count: r.forks_count,
    topics: (r.topics ?? []).slice(0, 4),
    homepage: isUrl(r.homepage) ? r.homepage : null,
    pushed_at: r.pushed_at ?? null,
  };
}

/**
 * One request to the public API. Used by the browser AND by the Astro build
 * (pages fetch at build time so real cards are in the HTML for crawlers, link
 * previews and no-JS visitors). Throws on any failure.
 */
export async function fetchRepos(
  username: string,
  limit = 12
): Promise<{ repos: Repo[]; stats: RepoStats }> {
  const res = await fetch(
    `https://api.github.com/users/${username}/repos?sort=pushed&per_page=100`,
    { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const own = ((await res.json()) as GhRepo[]).filter((r) => !r.fork && !r.archived);
  // stars first, then repos that explain themselves, then most recently pushed
  const repos = own
    .sort(
      (a, b) =>
        b.stargazers_count - a.stargazers_count ||
        Number(!!b.description) - Number(!!a.description) ||
        +new Date(b.pushed_at) - +new Date(a.pushed_at)
    )
    .slice(0, limit)
    .map(mapRepo);
  return {
    repos,
    stats: {
      repos: own.length,
      live: own.filter((r) => isUrl(r.homepage)).length,
      languages: new Set(own.map((r) => r.language).filter(Boolean)).size,
    },
  };
}

/** browser entry point: cache → network → stale cache → honest error */
export async function getRepos(): Promise<{ repos: Repo[]; source: DataSource }> {
  const { username, useMock } = site.github;

  if (useMock) return { repos: MOCK_REPOS, source: 'mock' };

  const cached = readCache();
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { repos: cached.repos, source: 'cache' };
  }

  try {
    const { repos } = await fetchRepos(username);
    if (repos.length) writeCache(repos);
    return { repos, source: 'live' };
  } catch {
    // network failed or rate-limited: stale cache if we have one, otherwise
    // say so. never invent repos for a real visitor.
    if (cached) return { repos: cached.repos, source: 'cache' };
    return { repos: [], source: 'error' };
  }
}
