/**
 * src/data/organisation.js
 *
 * Site-wide organisation metadata used by the RSS feed, JSON-LD, and
 * Open Graph tags. Keeping it in one place means you only update it here.
 */

export const organisation = {
  name: 'Tenderpreneurs',
  url: 'https://tenderpreneurs.co.za',
  /** Used as the RSS feed's <managingEditor> and contact address */
  email: 'hello@tenderpreneurs.co.za',
  /** Short tagline used in RSS <description> and OG meta */
  description:
    'South African government tender aggregator — find, filter, and track tenders from all provinces and sectors.',
  /** Used in JSON-LD Organisation schema */
  logo: 'https://tenderpreneurs.co.za/logo.png',
  /** Social / canonical links */
  social: {
    twitter: 'https://twitter.com/tenderpreneurs',
  },
};

export default organisation;
