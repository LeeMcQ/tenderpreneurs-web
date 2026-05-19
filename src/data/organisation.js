/**
 * src/data/organisation.js
 *
 * Named exports used by StructuredData.astro (and rss.xml.js):
 *   - ORGANISATION  (JSON-LD Organisation schema data)
 *   - PRODUCT_OFFERS (JSON-LD Offer[] for pricing/plans)
 *
 * Keep export names EXACTLY as-is — StructuredData.astro imports them
 * by these specific names.
 */

export const ORGANISATION = {
  name: 'Tenderpreneurs',
  url: 'https://tenderpreneurs.co.za',
  email: 'hello@tenderpreneurs.co.za',
  description:
    'South African government tender aggregator — find, filter, and track tenders from all provinces and sectors.',
  logo: 'https://tenderpreneurs.co.za/logo.png',
  sameAs: [
    'https://twitter.com/tenderpreneurs',
  ],
  address: {
    '@type': 'PostalAddress',
    addressCountry: 'ZA',
  },
  foundingDate: '2025',
  areaServed: 'ZA',
};

/**
 * Pricing plans exposed as JSON-LD Offer items.
 * Update prices/names here when plans change — StructuredData picks them up automatically.
 */
export const PRODUCT_OFFERS = [
  {
    '@type': 'Offer',
    name: 'Free',
    description: 'Browse public tender listings with basic filters.',
    price: '0',
    priceCurrency: 'ZAR',
    availability: 'https://schema.org/InStock',
    url: 'https://tenderpreneurs.co.za/#pricing',
  },
  {
    '@type': 'Offer',
    name: 'Pro',
    description:
      'Unlimited tender alerts, AI-powered summaries, document downloads, and saved searches.',
    price: '299',
    priceCurrency: 'ZAR',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: '299',
      priceCurrency: 'ZAR',
      unitText: 'MONTH',
    },
    availability: 'https://schema.org/InStock',
    url: 'https://tenderpreneurs.co.za/#pricing',
  },
];

// Default export for rss.xml.js and any other files that do `import org from ...`
export default ORGANISATION;
