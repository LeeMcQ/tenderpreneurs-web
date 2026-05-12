import { defineConfig } from 'astro/config';
import AstroPWA from '@vite-pwa/astro'
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';
// import sitemap from '@astrojs/sitemap';   // ← disabled for now

export default defineConfig({
  site: 'https://tenderpreneurs.co.za',

  output: 'hybrid',
  adapter: cloudflare(),

  integrations: [
    tailwind(),
    // sitemap(),   // ← commented out
  ],
  integrations: [
    AstroPWA({
      registerType: 'autoUpdate',
      // Use a custom service worker (inject manifest + strategies)
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{css,js,html,png,svg,ico,woff2}']
      },
      // PWA manifest options are read from public/manifest.json automatically
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: false, // keep manifest.json in public/ as-is
      workbox: {
        // workbox options are handled inside injectManifest mode
      }
    })
  ]
});