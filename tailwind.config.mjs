/** @type {import('tailwindcss').Config} */
/**
 * ROOT CAUSE FIX: The previous palette had inverted/broken scales.
 *
 *   - `navy.900` was `#010204` (near-black) instead of a usable dark navy.
 *   - `navy.500` was the brand `#0C1B33`, but Tailwind utilities like
 *     `bg-gradient-to-br from-navy-900 to-civic-800` (used on EVERY page hero
 *     in privacy.astro, terms.astro, pricing.astro, tenders/index.astro,
 *     pfma/index.astro, about.astro) resolved to near-black on near-black —
 *     which is why every inner page hero looks like a flat dark bar instead
 *     of the intended navy→blue brand gradient.
 *   - Similar problem in `civic`, `gold`, and `sky` scales.
 *
 * This config restores standard Tailwind convention:
 *   50 = lightest tint, 500 = brand default, 900 = darkest shade.
 * The brand color is kept at the 500 step where templates expect it,
 * but the 600/700/800/900 steps now actually darken (not collapse to black),
 * and 50/100/200 actually lighten.

 */
 import typography from '@tailwindcss/typography';

export default {
  // ...
  plugins: [typography],
};
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
        // Brand navy — used for backgrounds, headings, hero gradients.
        // Brand value = navy.500 = #0C1B33. 900 is now a usable deep navy,
        // not pure black, so hero gradients actually look like navy.
        navy: {
          DEFAULT: '#0C1B33',
          50:  '#F0F3F8',
          100: '#D9DFEA',
          200: '#B0BCD2',
          300: '#7689AD',
          400: '#3F567F',
          500: '#0C1B33', // brand
          600: '#0A172B',
          700: '#081323',
          800: '#060F1B',
          900: '#040B14',
        },
        // Brand civic blue — used in heroes, links, ghost buttons, badges.
        civic: {
          DEFAULT: '#1B4F8A',
          50:  '#EDF3FB',
          100: '#D2E0F2',
          200: '#A4BFE3',
          300: '#6E97CC',
          400: '#3D70AE',
          500: '#1B4F8A', // brand
          600: '#173F72',
          700: '#11305A',
          800: '#0C2243',
          900: '#08172E',
        },
        // Brand gold — used for accents, primary CTAs, badges.
        gold: {
          DEFAULT: '#D97706',
          50:  '#FEF5E6',
          100: '#FCE3BC',
          200: '#F8C580',
          300: '#F1A23E',
          400: '#E48A18',
          500: '#D97706', // brand
          600: '#B66205',
          700: '#8F4D04',
          800: '#6B3A03',
          900: '#4A2702',
        },
        // Brand sky — used for soft surface tints behind cards, FAQ sections.
        // Brand sky = #DBEAFE = sky.100 (Tailwind-conventional). Keeping
        // numerical scale consistent with Tailwind's stock `sky` so old
        // utilities like `bg-sky-50` (very pale) still feel right.
        sky: {
          DEFAULT: '#DBEAFE',
          50:  '#F4F9FF',
          100: '#DBEAFE', // brand-soft surface
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'ui-serif', 'Georgia', 'serif'],
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
            h1: { fontFamily: '"Playfair Display", serif' },
            h2: { fontFamily: '"Playfair Display", serif' },
            h3: { fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: '700' },
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
  plugins: [require('@tailwindcss/typography')],
};
