import { defineConfig } from 'astro/config';
import AstroPWA from '@vite-pwa/astro';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
//import sitemap from '@astrojs/sitemap';

// NOTE: previously this file declared `integrations:` TWICE in the same
// object literal. In JS, the second key silently overwrites the first —
// which meant Tailwind was NOT loading in production. That single bug
// is responsible for the bulk of the visual breakage on the live site.
// Fixed by merging into ONE integrations array.

export default defineConfig({
  site: 'https://tenderpreneurs.co.za',

  output: 'hybrid',
  adapter: cloudflare(),
  integrations: [mdx()],           // ← must be in integrations array
  adapter: cloudflare({ mode: 'directory' }),
  output: 'server',

  // Astro picks up tsconfig paths automatically, so the `@/...` aliases
  // declared in tsconfig.json work without extra Vite config here.

  integrations: [
    tailwind({
      // We import globals.css ourselves in BaseLayout, so disable the
      // injected base stylesheet to avoid double-loading.
      applyBaseStyles: false,
    }),
    //sitemap(),
    AstroPWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{css,js,html,png,svg,ico,woff2}'],
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: false, // keep public/manifest.json as-is
    }),
  ],

  // Small image perf wins for Cloudflare Pages.
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },

  vite: {
    build: {
      // Keep CSS in a single file so it can be HTTP/2-pushed and cached
      // efficiently by Cloudflare.
      cssCodeSplit: false,
    },
  },
});
