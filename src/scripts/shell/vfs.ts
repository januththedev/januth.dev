import { site } from '../../config/site';
import { getRepos, type Repo } from '../github';

/**
 * Virtual filesystem that mirrors the site's content — the JN shell operates
 * on this. Directories whose names start with '.' (and the '.secret' dir)
 * are hidden from plain `ls` and need `ls -a`.
 */

export interface VDir {
  type: 'dir';
  hidden?: boolean;
  children: Record<string, VNode>;
}
export interface VFile {
  type: 'file';
  hidden?: boolean;
  content: string;
}
export type VNode = VDir | VFile;

const dir = (children: Record<string, VNode>, hidden = false): VDir => ({ type: 'dir', children, hidden });
const file = (content: string, hidden = false): VFile => ({ type: 'file', content, hidden });

function reposToText(repos: Repo[]): string {
  return repos
    .map((r) => `${r.name}\n  ${r.description}\n  ${r.language ?? 'code'} · ★${r.stargazers_count} · ${r.html_url}`)
    .join('\n\n');
}

function reposToJson(repos: Repo[]): string {
  return JSON.stringify(repos, null, 2);
}

const featuredText = (): string =>
  site.featured
    .map((p) => `${p.name}\n  ${p.oneLiner}\n  ${p.stack.join(' · ')}\n  ${p.liveUrl ?? p.repoUrl}`)
    .join('\n\n');

/**
 * Builds the tree synchronously so `help`, `ls` and `cat` never wait on the
 * network; the two repo files are filled in when GitHub answers.
 */
export function buildFs(): VDir {
  const unreachable = `couldn't reach github right now. see ${site.socials[0].url}`;
  const repoTxt = file('(fetching from github… try again in a second)');
  const repoJsonFile = file('[]');
  getRepos()
    .then(({ repos, source }) => {
      if (!repos.length) {
        repoTxt.content = source === 'error' ? unreachable : 'no public repos yet.';
        return;
      }
      repoTxt.content = reposToText(repos);
      repoJsonFile.content = reposToJson(repos);
    })
    .catch(() => {
      repoTxt.content = unreachable;
    });

  return dir({
    'README.md': file(
      `# ${site.name}\n\nwelcome to the jn filesystem.\neverything you can read here is also on the site —\nthis is just the same place with fewer pixels.\n\ntry: ls -a · cat about.md · open projects · theme paper`
    ),
    'about.md': file(
      `${site.name} — ${site.role}, ${site.location}.\n\ni build AI products, developer tools and interactive web\nexperiences — most of them under the Orin name.\n\ni think software should feel alive: this site has a real\nshell in it, and a game hidden behind its 404.\n\nfull story: open about      work: cat projects/featured.txt`
    ),
    'skills.txt': file(
      site.skills
        .map((s) => `${s.group.padEnd(16)}${s.items.join(' · ').toLowerCase()}`)
        .join('\n')
    ),
    'contact.txt': file(
      [`email: ${site.email}`, ...site.socials.map((s) => `${s.label}: ${s.url}`)].join('\n')
    ),
    projects: dir({
      'featured.txt': file(featuredText()),
      'repos.txt': repoTxt,
      'repos.json': repoJsonFile,
    }),
    themes: dir({
      'dark.theme': file('the house style. near-black, one accent: terminal green. (default)'),
      'paper.theme': file('light, editorial, ink on cream. try: theme paper'),
      'matrix.theme': file('hidden. some doors only open from the inside.'),
    }),
    '.secret': dir(
      {
        'flag.txt': file('you actually looked. konami works everywhere. ↑↑↓↓←→←→BA'),
        'hint.txt': file('the shell knows more verbs than help admits. neofetch? matrix?'),
      },
      true
    ),
  });
}

/** normalize a path against cwd; returns absolute path or null when malformed */
export function resolvePath(cwd: string, input?: string): string | null {
  const raw = input && input.length ? input : '.';
  const base = raw.startsWith('/') ? [] : cwd.split('/').filter(Boolean);
  const parts = raw.startsWith('/') ? raw.slice(1).split('/') : raw.split('/');
  const stack = [...base];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else if (part === '~') {
      stack.length = 0;
    } else stack.push(part);
  }
  return '/' + stack.join('/');
}

export function getNode(root: VDir, path: string): VNode | null {
  if (path === '/' || path === '') return root;
  let node: VNode = root;
  for (const part of path.split('/').filter(Boolean)) {
    if (node.type !== 'dir') return null;
    // own-property check: `cat constructor` must not walk Object.prototype
    if (!Object.hasOwn(node.children, part)) return null;
    const next: VNode = node.children[part];
    node = next;
  }
  return node;
}

/** list entries for completion: all direct children of a directory path */
export function listDir(root: VDir, path: string): { name: string; isDir: boolean }[] {
  const node = getNode(root, path);
  if (!node || node.type !== 'dir') return [];
  return Object.entries(node.children).map(([name, child]) => ({
    name,
    isDir: child.type === 'dir',
  }));
}
