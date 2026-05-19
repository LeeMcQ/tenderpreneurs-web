// astro.config.mjs
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';

// @astrojs/sitemap is intentionally removed.
// It crashes with "Cannot read properties of undefined (reading 'reduce')"
// in @astrojs/sitemap@3.7.2 when used with output:'server' + Cloudflare adapter
// because it receives undefined instead of a pages array at build:done.
// We generate /sitemap.xml manually via src/pages/sitemap.xml.ts instead.

const SITE_URL = process.env.PUBLIC_SITE_URL || 'https://tenderpreneurs.co.za';

export default defineConfig({
  site: SITE_URL,
  output: 'server',

  adapter: cloudflare({
    mode: 'directory',
    platformProxy: { enabled: true },
  }),

  integrations: [
    mdx(),
    tailwind(),
  ],

  vite: {
    ssr: {
      external: ['node-cron', '@sentry/node'],
    },
    optimizeDeps: {
      exclude: ['node-cron', '@sentry/node'],
    },
    build: {
      chunkSizeWarningLimit: 1000,
    },
  },

  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
});
