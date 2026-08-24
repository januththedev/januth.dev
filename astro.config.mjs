// @ts-check
import { defineConfig } from 'astro/config';

// Static output — deploys as-is to Cloudflare Pages, Vercel, Netlify or GitHub Pages.
export default defineConfig({
  site: 'https://januththedev.github.io',
  devToolbar: { enabled: false },
});
