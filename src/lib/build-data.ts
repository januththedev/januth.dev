import { site } from '../config/site';
import { fetchRepos, type Repo, type RepoStats } from '../scripts/github';

/**
 * GitHub data fetched ONCE per build and shared by every page, so real repos
 * and real numbers are in the static HTML (crawlers, link previews, no-JS).
 * The browser refreshes them later; if the build has no network the pages
 * fall back to skeletons / the last known numbers below.
 */

/** last known good numbers — only used when the build-time fetch fails */
const FALLBACK_STATS: RepoStats = { repos: 29, live: 16, languages: 7 };

interface BuildData {
  repos: Repo[];
  stats: RepoStats;
  /** false when the fetch failed and `stats` are the fallback */
  fresh: boolean;
  builtAt: number;
}

let memo: Promise<BuildData> | null = null;

export function getBuildData(): Promise<BuildData> {
  return (memo ??= (async () => {
    const builtAt = Date.now();
    if (site.github.useMock) return { repos: [], stats: FALLBACK_STATS, fresh: false, builtAt };
    try {
      const { repos, stats } = await fetchRepos(site.github.username);
      return { repos, stats, fresh: true, builtAt };
    } catch (e) {
      console.warn(`[build-data] GitHub fetch failed (${(e as Error).message}); using fallbacks`);
      return { repos: [], stats: FALLBACK_STATS, fresh: false, builtAt };
    }
  })());
}

/** whole years since the GitHub account was created (dec 2021) */
export function yearsOnGithub(now = Date.now()): number {
  return Math.max(1, Math.floor((now - Date.UTC(2021, 11, 17)) / (365.25 * 86_400_000)));
}
