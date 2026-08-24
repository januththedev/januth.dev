# JN — Personal Portfolio for Januth Nimnal

**Date:** 2026-08-24
**Status:** Approved (user approved via plan flow; build authorized)

## Goal

A personal portfolio for **Januth Nimnal** (monogram **JN**) inspired by the spirit of
elvismao.com (monogram identity, playful confidence, award-level motion) but rebuilt from
scratch to surpass it. The user is a full-stack-leaning creative developer/tinkerer who wants
the site itself to prove craft.

## Reference analysis (elvismao.com)

- "EM" static monogram → we escalate to a living GPU particle monogram.
- Lowercase staggered role fragments + rotating word → we keep the device, upgrade to text-scramble.
- Joke stat counters ("0+ PRs … That's a lot") → we write our own humor beat.
- Terminal-styled footer links with carets → ours become a *real* working shell.
- Things it lacks entirely: real terminal, live GitHub projects page, easter eggs, view-transition
  page morphs, custom cursor. These are our differentiators.

## Decisions (from user)

| Question | Decision |
|---|---|
| Identity | Januth Nimnal, monogram "JN" |
| Vibe | Sleek 3D / futuristic — deep-space dark, cyan→violet gradients, glass |
| Wow features | Interactive terminal + live GitHub pulse + particle-text hero + easter eggs everywhere |
| Stack | Astro + vanilla TS/JS (Three.js only runtime dep) |
| GitHub | `januththedev`; projects auto-pulled but NOT on landing page; pulse UI ships on mock data (`useMock: true`) until flipped |
| Terminal | Real mini-shell for the site: tokenizer/parser/virtual FS; commands control the page |

## Pages

1. `/` Landing — preloader (JN assembling, % counter) → particle-JN hero (mouse repulsion,
   click burst, scroll dispersal, morphs JN→sphere→torus knot) + name + scramble-cycled roles →
   curated selected-work teasers → humor stats strip → footer (prompt-style links, live clock,
   time-aware greeting).
2. `/projects` — repos pulled live from GitHub API (cached 1 h in localStorage; fallback chain:
   cache → mock). Language color dots, stars/forks, topics, tilt+glow cards, language filters,
   honest "demo data" badge when mock is active.
3. `/about` — bio, grouped skills, journey timeline, contact.
4. `/404` — canvas mini-game (catch falling particles) + terminal hint.

## Signature systems

### JN Shell
Tokenizer (quote-aware) → parser (args + `|` pipes for filter commands) → executor over a virtual
filesystem mirroring the site (`ls`, `cd`, `pwd`, `cat about.md`). Commands control the page:
`open`, `theme`, `repos`, `whoami`, `contact`. Plus `clear`, `history`, `echo`, `date`, `grep`,
`wc`, witty `sudo`. Hidden commands exist as easter eggs (`neofetch`, `matrix`, `konami`,
`rm -rf /`). Tab completion (commands + paths), ↑/↓ history persisted per session. Toggle via
backtick key / floating button on every page. State lives in module scope so it survives Astro
view transitions; DOM rebuilds idempotently on `astro:page-load`.

### Themes
CSS custom-property tokens swapped via `<html data-theme>`: `dark` (default), `paper`,
secret `matrix`, hidden `vaporwave`; Konami adds party-mode hue cycling. Chosen theme persisted;
tiny inline head script prevents FOUC.

### Easter eggs
Konami code → party mode; JN logo ×7 clicks → glitch burst; console ASCII banner hinting at the
shell; custom magnetic cursor (dot + lerped ring, mix-blend-difference) with escape hatch,
auto-disabled on touch/reduced-motion.

## Accessibility & performance

- `prefers-reduced-motion`: static gradient hero fallback, no cursor trail, no scramble loops.
- No WebGL → CSS fallback hero.
- Three.js lazy-imported only on pages that need it, after first paint; DPR capped; mobile
  particle count reduced.
- Semantic HTML, keyboard-navigable terminal and nav, focus management in overlay.

## Architecture

```
src/
├─ config/site.ts          single source of truth (name, roles, socials, github.useMock)
├─ styles/global.css       theme tokens + components
├─ layouts/Base.astro      head/meta/FOUC script, header, footer, ClientRouter
├─ pages/{index,projects,about,404}.astro
├─ components/*.astro      Hero, ProjectCard, StatsStrip, SectionHeading…
└─ scripts/
   ├─ app.ts               bootstrapper; astro:page-load wiring
   ├─ lib/dom.ts           helpers
   ├─ hero/particles.ts    Three.js scene
   ├─ scramble.ts reveal.ts cursor.ts eggs.ts github.ts
   └─ shell/{tokenizer,parser,vfs,commands,terminal-ui}.ts
```

Deps: `astro ^5`, `three`, `@fontsource/space-grotesk`, `@fontsource/jetbrains-mono`;
dev: `@astrojs/check`, `typescript`.

## Verification

`npm run build` clean · `astro check` clean · preview server returns 200 + expected content for
all four routes · manual checklist: shell commands, mock badge, konami, themes persist across
navigation, reduced-motion fallbacks, mobile layout.

## Out of scope (until asked)

Deployment (static output deploys anywhere), real contact details beyond what user provided,
blog/CMS.
