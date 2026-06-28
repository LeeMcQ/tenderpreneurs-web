/** @type {import('tailwindcss').Config} */
/**
 * Single source of truth for Tailwind tokens, aligned with src/styles/global.css.
 * - One `export default` (the previous file had a duplicate default export).
 * - ESM plugin import (no `require` in .mjs).
 * - Fonts match what BaseLayout actually loads: Inter + JetBrains Mono.
 * - `gold` unified to the brand #F5A623 (was #D97706).
 */
import typography from '@tailwindcss/typography';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'media',
  theme: {
    extend: {
      boxShadow: {
        'card-hover':
          '0 20px 25px -5px rgb(12 27 51 / 0.15), 0 8px 10px -6px rgb(12 27 51 / 0.15)',
      },
      colors: {
        navy: {
          DEFAULT: '#0C1B33',
          50: '#F0F3F8', 100: '#D9DFEA', 200: '#B0BCD2', 300: '#7689AD', 400: '#3F567F',
          500: '#0C1B33', 600: '#0A172B', 700: '#081323', 800: '#060F1B', 900: '#040B14',
        },
        civic: {
          DEFAULT: '#1B4F8A',
          50: '#EDF3FB', 100: '#D2E0F2', 200: '#A4BFE3', 300: '#6E97CC', 400: '#3D70AE',
          500: '#1B4F8A', 600: '#173F72', 700: '#11305A', 800: '#0C2243', 900: '#08172E',
        },
        // Brand gold unified to #F5A623 (matches --clr-gold in global.css)
        gold: {
          DEFAULT: '#F5A623',
          50: '#FEF6E7', 100: '#FCE7BE', 200: '#FAD08A', 300: '#F8BC57', 400: '#F6AE36',
          500: '#F5A623', 600: '#D4860A', 700: '#A66708', 800: '#7A4C06', 900: '#4F3104',
        },
        teal: { DEFAULT: '#10C9A8' },
        sky: {
          DEFAULT: '#DBEAFE',
          50: '#F4F9FF', 100: '#DBEAFE', 200: '#BFDBFE', 300: '#93C5FD', 400: '#60A5FA',
          500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8', 800: '#1E40AF', 900: '#1E3A8A',
        },
      },
      fontFamily: {
        // Match the fonts BaseLayout loads (Inter + JetBrains Mono).
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            '--tw-prose-body': theme('colors.navy.500'),
            '--tw-prose-headings': theme('colors.navy.500'),
            '--tw-prose-links': theme('colors.civic.500'),
            '--tw-prose-bold': theme('colors.navy.500'),
            '--tw-prose-code': theme('colors.civic.500'),
            maxWidth: 'none',
          },
        },
        invert: {
          css: {
            '--tw-prose-body': theme('colors.sky.100'),
            '--tw-prose-headings': '#ffffff',
            '--tw-prose-links': theme('colors.gold.DEFAULT'),
          },
        },
      }),
    },
  },
  plugins: [typography],
};
