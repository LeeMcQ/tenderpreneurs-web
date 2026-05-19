// src/data/organisation.ts
// Organisation facts used by JSON-LD schema across the site.
// Keep this aligned with the Companies and Intellectual Property Commission (CIPC)
// registration and your PAIA Manual.

export const ORGANISATION = {
  name: "Tenderpreneur",
  legalName: "Tenderpreneur (Pty) Ltd",
  url: "https://tenderpreneur.co.za",
  logo: "https://tenderpreneur.co.za/logo.png",
  email: "hello@tenderpreneur.co.za",
  salesEmail: "sales@tenderpreneur.co.za",
  privacyEmail: "privacy@tenderpreneur.co.za",
  // Update these once you have them:
  vatNumber: "",        // e.g. "4123456789"
  registrationNumber: "", // e.g. "2024/123456/07"
  sameAs: [
    // Add only profiles that genuinely exist:
    // "https://www.linkedin.com/company/tenderpreneur",
    // "https://twitter.com/tenderpreneur",
  ],
  foundingDate: "2024",
  areaServed: "ZA",
  // Google requires either contactType "customer service" or "sales"
  contactPoint: {
    contactType: "customer service",
    email: "hello@tenderpreneur.co.za",
    areaServed: "ZA",
    availableLanguage: ["English", "Afrikaans"],
  },
} as const;

// The pricing tiers, exposed as Offers in SoftwareApplication schema.
// Keep in sync with src/config/site.ts / pricing.astro.
export const PRODUCT_OFFERS = [
  { name: "Free", price: "0", priceCurrency: "ZAR" },
  { name: "Professional", price: "299", priceCurrency: "ZAR" },
  // Enterprise has no public price → omitted from schema (Google guidelines).
];
