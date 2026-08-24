# JN — januth nimnal, portfolio

Hand-built personal portfolio: WebGL particle monogram, a **real in-browser shell**,
live GitHub pulse, easter eggs everywhere. Zero UI frameworks — Astro for static
pages, vanilla TypeScript for everything interactive.

## run it

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # static output in dist/
npm run preview   # serve the built site
npm run check     # astro + typescript diagnostics
```

## make it yours

Everything personal lives in **`src/config/site.ts`**:

| what | where |
|---|---|
| name, monogram, roles, email, socials | `src/config/site.ts` |
| go live with real GitHub repos | set `github.useMock: false` |
| landing-page teasers | `curated[]` in the same file |

## the shell

Press <kbd>`</kbd> anywhere (or hit the `>_` button). It's a genuine little shell:
quote-aware tokenizer → pipe-aware parser → virtual filesystem mirroring the site.

```
help              every verb (some hide)
ls -a · cd · cat  explore /projects/repos.json, .secret/…
open projects     navigates the site · open github → your profile
theme paper       reskin live (dark · paper · and two hidden ones…)
repos --lang ts   live repo table        cat skills.txt | grep web
neofetch          ???                    sudo hire-me    ???
```

Tab completes commands and paths. ↑ recalls history. Escape closes.

## structure

```
src/
├─ config/site.ts          ← single source of truth
├─ layouts/Base.astro      head/meta, header/footer, terminal mount
├─ pages/                  index · projects · about · 404 (mini-game)
├─ components/             Hero, SectionHeading, StatsStrip…
└─ scripts/
   ├─ app.ts               bootstrapper (astro:page-load wiring)
   ├─ hero/particles.ts    Three.js monogram (morphs, repulsion, bursts)
   ├─ shell/               tokenizer · parser · vfs · commands · ui
   ├─ github.ts            fetch → localStorage cache → mock fallback
   └─ scramble/cursor/eggs/reveal/game404/projects-page
```

## notes

- respects `prefers-reduced-motion` (static hero, no cursor trail) and degrades
  to a CSS fallback when WebGL is unavailable.
- themes are CSS custom-property swaps on `<html data-theme>`; add one in
  `src/styles/global.css` + register it in `scripts/app.ts`.
- **deploys to Vercel** (zero-config Astro):
  ```bash
  npx vercel login     # once
  npx vercel --prod    # every deploy after that
  ```
  flip `useMock: false` in `src/config/site.ts` before going public so the
  projects page shows your real repos.
- og:image not shipped yet; drop a 1200×630 PNG into `public/` and reference it in
  `Base.astro` when ready.

built from scratch. inspired by the spirit of elvismao.com — surpassed on purpose.
