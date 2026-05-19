// src/config/site.ts
// Single source of truth for CTAs, app URLs, and feature status flags.
// Import this anywhere instead of hardcoding URLs or "Live/Beta" labels.

export const APP_URL = "https://app.tenderpreneur.co.za";

export const CTA = {
  // Marketing → app conversion CTAs (signup funnel)
  signup: `${APP_URL}/register`,
  signupPro: `${APP_URL}/register?plan=pro`,
  signupEnterprise: "mailto:sales@tenderpreneur.co.za",

  // Product feature deep-links (live in app)
  scoring: `${APP_URL}/scoring`,
  assistant: `${APP_URL}/assistant`,
  tenderFeed: `${APP_URL}/tenders`,

  // Marketing pages (this site)
  pfmaGuide: "/pfma",
  features: "/features",
  pricing: "/pricing",
  blog: "/blog",
  about: "/about",
} as const;

// ─────────────────────────────────────────────────────────────
// Feature status — drives the "Live / Beta / Coming Soon" badge
// on Pricing, Features, and Tenders pages. Update one place,
// every page reflects it. Keep this honest — it's your legal
// shield against misleading-advertising claims.
// ─────────────────────────────────────────────────────────────

export type FeatureStatus = "live" | "beta" | "coming-soon";

export interface FeatureFlag {
  id: string;
  label: string;
  status: FeatureStatus;
  // Optional: when "coming-soon", show an estimated date
  eta?: string;
}

export const FEATURES: Record<string, FeatureFlag> = {
  pfmaKnowledgeBase: {
    id: "pfma-kb",
    label: "PFMA knowledge base (11 topics)",
    status: "live",
  },
  sbdFormLibrary: {
    id: "sbd-forms",
    label: "SBD form library",
    status: "live",
  },
  complianceChecklist: {
    id: "compliance-checklist",
    label: "Compliance checklist (CSD, Tax, B-BBEE)",
    status: "beta",
  },
  pfmaAssistant: {
    id: "pfma-assistant",
    label: "PFMA AI Assistant",
    status: "beta",
  },
  liveTenderFeed: {
    id: "tender-feed",
    label: "Live tender feed",
    status: "coming-soon",
    eta: "Q1 2026",
  },
  provinceFilters: {
    id: "province-filters",
    label: "Province & sector filters",
    status: "coming-soon",
    eta: "Q1 2026",
  },
  emailAlerts: {
    id: "email-alerts",
    label: "Save searches + email alerts",
    status: "coming-soon",
    eta: "Q1 2026",
  },
  winProbability: {
    id: "win-probability",
    label: "AI win-probability scoring",
    status: "coming-soon",
    eta: "Q2 2026",
  },
  bbbeeCalculator: {
    id: "bbbee-calc",
    label: "B-BBEE preference calculator",
    status: "coming-soon",
    eta: "Q2 2026",
  },
  documentDownloads: {
    id: "doc-downloads",
    label: "Tender document downloads",
    status: "coming-soon",
    eta: "Q2 2026",
  },
  unlimitedAssistant: {
    id: "unlimited-assistant",
    label: "Unlimited AI assistant queries",
    status: "beta",
  },
  teamSeats: {
    id: "team-seats",
    label: "Team seats (unlimited)",
    status: "coming-soon",
    eta: "Q2 2026",
  },
  apiAccess: {
    id: "api-access",
    label: "API access",
    status: "coming-soon",
    eta: "Q3 2026",
  },
};

// Honest counter — replace with a real DB query in Phase 2.
// Until then, keep the figure conservative and label it as "tracking", not "live".
export const TENDER_STATS = {
  tracking: 7841,        // Total tenders we have ingested historically
  isLive: false,         // Flip to true once /api/tenders returns real data
  lastUpdated: "2026-01-15",
};
