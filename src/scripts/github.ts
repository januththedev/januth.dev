import { site } from '../config/site';

export interface Repo {
  name: string;
  description: string;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  topics: string[];
}

export type DataSource = 'live' | 'cache' | 'mock';

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
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Shell: '#89e051',
  Lua: '#000080',
  Vue: '#41b883',
  Astro: '#ff5a03',
};

const CACHE_KEY = `jn:repos:v1:${site.github.username}`;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Demo dataset used while `site.github.useMock` is true (or when the network
 * and cache both fail). Shaped exactly like the real API response so the flip
 * to live data changes nothing downstream.
 *
 * Modeled on the repo mix of a working dev portfolio (flagship OSS tool,
 * blog, graders/bots, hardware toy, utilities) — swap these entries for your
 * own real repos by flipping useMock, or edit them here until then.
 */
const MOCK_REPOS: Repo[] = [
  {
    name: 'jnfont',
    description:
      'Free web-font subsetting service — ship beautiful custom type without shipping megabytes.',
    html_url: 'https://github.com/januththedev/jnfont',
    language: 'JavaScript',
    stargazers_count: 187,
    forks_count: 21,
    topics: ['fonts', 'performance', 'web'],
  },
  {
    name: 'autograde',
    description:
      'Coding-assignment submission + automated grading pipeline for classrooms. Teachers sleep, robots grade.',
    html_url: 'https://github.com/januththedev/autograde',
    language: 'TypeScript',
    stargazers_count: 34,
    forks_count: 6,
    topics: ['education', 'ci', 'developer-tools'],
  },
  {
    name: 'particle-lab',
    description:
      'Playground of GPU particle systems — attractors, springs and things that explode politely.',
    html_url: 'https://github.com/januththedev/particle-lab',
    language: 'JavaScript',
    stargazers_count: 64,
    forks_count: 5,
    topics: ['webgl', 'threejs', 'particles'],
  },
  {
    name: 'grammar-gremlin',
    description:
      'Group-chat bot that enforces typos, proper nouns and capitalization before your teammates notice.',
    html_url: 'https://github.com/januththedev/grammar-gremlin',
    language: 'TypeScript',
    stargazers_count: 28,
    forks_count: 3,
    topics: ['telegram-bot', 'nlp', 'fun'],
  },
  {
    name: 'jn-blog',
    description:
      'My corner of the internet for tech write-ups, design breakdowns and postmortems of my own mistakes.',
    html_url: 'https://github.com/januththedev/jn-blog',
    language: 'Astro',
    stargazers_count: 19,
    forks_count: 2,
    topics: ['blog', 'astro', 'website'],
  },
  {
    name: 'midnight-renderer',
    description:
      'Software rasterizer built to finally understand what GPUs do for a living.',
    html_url: 'https://github.com/januththedev/midnight-renderer',
    language: 'Rust',
    stargazers_count: 52,
    forks_count: 8,
    topics: ['rust', 'graphics', 'rendering'],
  },
  {
    name: 'esp32-synth',
    description:
      'Course final project turned obsession — a playable digital instrument on an ESP32 and spare parts.',
    html_url: 'https://github.com/januththedev/esp32-synth',
    language: 'C++',
    stargazers_count: 11,
    forks_count: 1,
    topics: ['esp32', 'audio', 'hardware'],
  },
  {
    name: 'win-taming-guide',
    description:
      'Fresh-Windows-to-power-setup in one sitting: scripts, tweaks and the registry keys worth touching.',
    html_url: 'https://github.com/januththedev/win-taming-guide',
    language: 'PowerShell',
    stargazers_count: 15,
    forks_count: 4,
    topics: ['dotfiles', 'windows', 'setup'],
  },
  {
    name: 'where-is-my-bus',
    description:
      'Live transit availability analyzer for my city’s buses, because timetables are fiction.',
    html_url: 'https://github.com/januththedev/where-is-my-bus',
    language: 'TypeScript',
    stargazers_count: 9,
    forks_count: 1,
    topics: ['scraping', 'maps', 'civic-tech'],
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
    return Array.isArray(parsed?.repos) ? parsed : null;
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
  topics?: string[];
  pushed_at: string;
}

function mapRepo(r: GhRepo): Repo {
  return {
    name: r.name,
    description: r.description ?? '',
    html_url: r.html_url,
    language: r.language,
    stargazers_count: r.stargazers_count,
    forks_count: r.forks_count,
    topics: (r.topics ?? []).slice(0, 4),
  };
}

export async function getRepos(): Promise<{ repos: Repo[]; source: DataSource }> {
  const { username, useMock } = site.github;

  if (useMock) return { repos: MOCK_REPOS, source: 'mock' };

  const cached = readCache();
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { repos: cached.repos, source: 'cache' };
  }

  try {
    const res = await fetch(
      `https://api.github.com/users/${username}/repos?sort=pushed&per_page=100`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const json = (await res.json()) as GhRepo[];
    const repos = json
      .filter((r) => !r.fork)
      .sort((a, b) => b.stargazers_count - a.stargazers_count || +new Date(b.pushed_at) - +new Date(a.pushed_at))
      .slice(0, 9)
      .map(mapRepo);
    if (!repos.length) throw new Error('no public repos');
    writeCache(repos);
    return { repos, source: 'live' };
  } catch {
    // network failed — serve stale cache if we have any, else demo data
    if (cached) return { repos: cached.repos, source: 'cache' };
    return { repos: MOCK_REPOS, source: 'mock' };
  }
}
