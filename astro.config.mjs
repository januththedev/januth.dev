// @ts-check
import { defineConfig } from 'astro/config';

// Static output — deploys as-is to Cloudflare Pages, Vercel, Netlify or GitHub Pages.
export default defineConfig({
  site: 'https://januth.dev',
  devToolbar: { enabled: false },
});
