import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://tenderpreneurs.co.za',
  integrations: [
    sitemap({
      serialize(item) {
        // Parse the pathname from the full URL
        const { pathname } = new URL(item.url);

        // Homepage
        if (pathname === '/') {
          return { ...item, priority: 1.0, changefreq: 'weekly' };
        }
        // Tenders – adjust the prefix if your tender routes differ (/tenders, /tender, etc.)
        if (pathname.startsWith('/tenders/') || pathname.startsWith('/tender/')) {
          return { ...item, priority: 0.8