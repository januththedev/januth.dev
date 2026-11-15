// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// Static pages everywhere; the one server route (/api/shell — the real Linux
// terminal) becomes a Vercel function. On a static-only host the terminal
// falls back to its built-in virtual shell.
export default defineConfig({
  site: 'https://januth.dev',
  trailingSlash: 'always',
  output: 'static',
  adapter: vercel(),
  integrations: [sitemap({ filter: (page) => !page.includes('/api/') })],
  vite: {
    // local tooling (screenshots, scratch files) lives in .claude — never watch it
    server: { watch: { ignored: ['**/.claude/**'] } },
  },
  devToolbar: { enabled: false },
});
