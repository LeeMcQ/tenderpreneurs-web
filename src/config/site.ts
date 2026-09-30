// src/config/site.ts
// Single source of truth for CTAs, app URLs, and feature status flags.
// Import this anywhere instead of hardcoding URLs or "Live/Beta" labels.

export const APP_URL = "";  // app.* subdomain removed — everything lives on this domain

export const CTA = {
  // Marketing → app conversion CTAs (signup funnel)
  signup: `/auth/login`,
  signupPro: `/auth/login?plan=pro_monthly`,
  signupEnterprise: "mailto:sales@tenderpreneurs.co.za",

  // Product feature deep-links (live in app)
  scoring: `/tenders`,
  assistant: `/tenders`,
  tenderFeed: `/tenders`,

  // Marketing pages (this site)
  pfmaGuide: "/pfma",
  features: "/features",
  pricing: "/pricing",
  blog: "/blog",
  about: "/about",
} as const;

export type FeatureStatus = "live" | "beta" | "coming-soon";

export interface FeatureFlag {
  id: string;
  label: string;
  status: FeatureStatus;
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
    status: "live",
  },
  provinceFilters: {
    id: "province-filters",
    label: "Province & sector filters",
    status: "live",
  },
  goNoGo: {
    id: "go-nogo",
    label: "Go / no-go checklist",
    status: "live",
  },
  plainExtract: {
    id: "plain-extract",
    label: "Plain-English extract",
    status: "live",
  },
  emailAlerts: {
    id: "email-alerts",
    label: "Save searches + email alerts",
    status: "beta",
  },
  briefingCalendar: {
    id: "briefing-calendar",
    label: "Briefing calendar",
    status: "live",
  },
  coverageBoard: {
    id: "coverage-board",
    label: "Honest source coverage",
    status: "live",
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

export const TENDER_STATS = {
  tracking: 7841,
  isLive: false,
  lastUpdated: "2026-01-15",
  refreshHours: 6,
};
