// src/data/pfma-demo.ts
// Pre-written Q&A pairs for the PFMA Assistant demo widget on /pfma.
// These are NOT live AI responses — they're hand-curated to show what
// the real assistant produces, with the same citation format.
//
// To add or edit demo questions:
// 1. Add to the DEMO_QA array below.
// 2. Keep answers concise (3-5 short paragraphs max).
// 3. Cite real legislation. Don't invent section numbers.
// 4. If a citation references a section, double-check it against the
//    actual Act on https://www.gov.za/documents.

export interface DemoCitation {
  source: string;   // "PFMA Section 38(1)(a)"
  url?: string;     // optional link to the gov.za source
}

export interface DemoQA {
  question: string;
  // Each "paragraph" in the answer renders as a separate <p>.
  answer: string[];
  citations: DemoCitation[];
}

export const DEMO_QA: DemoQA[] = [
  {
    question: "What's the difference between PFMA and MFMA?",
    answer: [
      "The PFMA (Public Finance Management Act, 1999) governs national and provincial government departments, public entities, and constitutional institutions. If you're bidding to a national department like DPSA or a provincial department like the Western Cape Department of Health, PFMA applies.",
      "The MFMA (Municipal Finance Management Act, 2003) governs the 257 municipalities and municipal entities. If you're bidding to the City of Cape Town or Stellenbosch Municipality, MFMA rules apply.",
      "The practical difference for bidders: each Act has its own supply chain management (SCM) regulations and its own SBD form variants. The procurement principles are similar but the procedural details differ — for example, MFMA tenders require Council approval above certain thresholds, which PFMA tenders don't.",
    ],
    citations: [
      { source: "PFMA Act 1 of 1999", url: "https://www.gov.za/documents/public-finance-management-act" },
      { source: "MFMA Act 56 of 2003", url: "https://www.gov.za/documents/local-government-municipal-finance-management-act" },
    ],
  },
  {
    question: "How does the 80/20 preference point system work?",
    answer: [
      "Under the 2022 PPPFA Regulations, tenders below R50 million use the 80/20 system: 80 points for price and 20 points for specific goals (which usually means B-BBEE level).",
      "The lowest acceptable bid gets the full 80 price points. Other bids lose points proportionally based on how much higher their price is. The 20 preference points are awarded according to the bidder's B-BBEE level — Level 1 typically gets all 20, Level 2 gets 18, and so on down to Level 8.",
      "Tenders above R50 million use the 90/10 split: 90 points for price, 10 for preference. Above this threshold, price competitiveness matters far more than B-BBEE level.",
    ],
    citations: [
      { source: "PPPFA Regulations 2022, Reg 5 & 6" },
      { source: "Preferential Procurement Policy Framework Act 5 of 2000" },
    ],
  },
  {
    question: "Do I need a tax clearance certificate to bid?",
    answer: [
      "Yes, but the process changed in 2016. SARS no longer issues paper Tax Clearance Certificates. Instead, you provide a Tax Compliance Status (TCS) PIN, which lets the procuring department verify your status directly with SARS in real time.",
      "Get your TCS PIN by logging into SARS eFiling, going to 'Tax Status', and requesting a PIN for 'Tender'. The PIN is valid for 12 months and can be re-issued if your status changes.",
      "If your TCS shows 'Non-Compliant', your bid will typically be disqualified at the compliance check stage — even before the technical evaluation. Fix outstanding returns or payments before requesting the PIN.",
    ],
    citations: [
      { source: "Tax Administration Act 28 of 2011" },
      { source: "National Treasury SCM Instruction Note 3 of 2021/22" },
    ],
  },
  {
    question: "What is the Central Supplier Database (CSD)?",
    answer: [
      "The Central Supplier Database is a single, government-wide register of all suppliers wanting to do business with the state. Since April 2016, every supplier must be CSD-registered before being awarded any government contract.",
      "Registration is free at csd.treasury.gov.za. You'll need your CIPC registration, banking details, SARS tax number, B-BBEE certificate (or sworn affidavit for EMEs and QSEs), and proof of physical address.",
      "Once registered, you receive a unique supplier number. The CSD pulls your tax compliance status and B-BBEE level automatically — keep both current, because lapsed information can disqualify you mid-bid.",
    ],
    citations: [
      { source: "National Treasury SCM Instruction Note 4A of 2016/17" },
      { source: "PFMA Section 76" },
    ],
  },
  {
    question: "What's the difference between an EME, QSE, and Generic enterprise?",
    answer: [
      "These three categories are defined by annual turnover under the B-BBEE Codes. An EME (Exempted Micro Enterprise) has turnover under R10 million per year and qualifies for an automatic B-BBEE Level 4 — no audit required, just a sworn affidavit.",
      "A QSE (Qualifying Small Enterprise) has turnover between R10 million and R50 million. QSEs use a simplified scorecard and can also use an affidavit instead of a full B-BBEE certificate, provided they're at least 51% Black-owned.",
      "A Generic Enterprise has turnover above R50 million. Generics must be audited by a SANAS-accredited B-BBEE verification agency and use the full B-BBEE scorecard across five elements (Ownership, Management Control, Skills Development, ESD, Socio-Economic Development).",
    ],
    citations: [
      { source: "B-BBEE Codes of Good Practice, Statement 000" },
      { source: "Broad-Based Black Economic Empowerment Act 53 of 2003" },
    ],
  },
];
