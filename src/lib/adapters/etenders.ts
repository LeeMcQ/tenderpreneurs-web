// eTenders Publication Portal adapter — etenders.gov.za
//
// The portal exposes a JSON-ish search endpoint behind a SOAP/REST hybrid.
// We use the public HTML listing for resilience (the JSON endpoint changes
// shape periodically; HTML stays stable).
//
// Approach: GET the listings page, parse with htmlparser2 + cheerio-style
// selectors. No LLM in this path — eTenders HTML is structured enough for
// deterministic extraction.
//
// Known field positions (as of 2026-05):
//   .tenderListItem > .tender-ref         → source_ref
//   .tenderListItem > .tender-title > a   → title + href (source_url)
//   .tenderListItem > .tender-organ       → procuring_entity
//   .tenderListItem > .tender-province    → province (display name)
//   .tenderListItem > .tender-category    → category text
//   .tenderListItem > .tender-closing     → "Closing: 2026-06-15 11:00"

import { BaseAdapter, type RawTender } from "./base";
import type { Env } from "../db";
import { parse as parseHtml } from "node-html-parser";

const BASE = "https://www.etenders.gov.za";
const LISTINGS_URL = `${BASE}/Home/TenderOpportunities/?status=Open`;

const PROVINCE_SLUGS: Record<string, string> = {
  "eastern cape": "eastern-cape",
  "free state": "free-state",
  "gauteng": "gauteng",
  "kwazulu-natal": "kwazulu-natal",
  "kwa-zulu natal": "kwazulu-natal",
  "kwazulu natal": "kwazulu-natal",
  "limpopo": "limpopo",
  "mpumalanga": "mpumalanga",
  "northern cape": "northern-cape",
  "north west": "north-west",
  "western cape": "western-cape",
};

function slugifyProvince(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const key = input.toLowerCase().trim();
  return PROVINCE_SLUGS[key];
}

function classifyCategory(text: string | undefined): RawTender["category"] {
  if (!text) return "other";
  const t = text.toLowerCase();
  if (t.includes("construct") || t.includes("civil") || t.includes("building")) return "construction";
  if (t.includes("goods") || t.includes("supply")) return "goods";
  if (t.includes("service") || t.includes("consult")) return "services";
  return "other";
}

function parseClosingDate(raw: string | undefined): { date?: string; time?: string } {
  if (!raw) return {};
  // Examples: "2026-06-15 11:00", "15 June 2026, 11:00 AM", "Closing: 2026/06/15"
  const cleaned = raw.replace(/^closing[:\s]*/i, "").trim();
  // Try ISO-ish first
  const iso = cleaned.match(/(\d{4})[-/](\d{2})[-/](\d{2})(?:[\sT]+(\d{2}):(\d{2}))?/);
  if (iso) {
    const date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    const time = iso[4] && iso[5] ? `${iso[4]}:${iso[5]}` : undefined;
    return { date, time };
  }
  // Try long-form: "15 June 2026"
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const long = cleaned.toLowerCase().match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
  if (long) {
    const m = months.indexOf(long[2]);
    if (m >= 0) {
      const date = `${long[3]}-${String(m + 1).padStart(2, "0")}-${String(parseInt(long[1])).padStart(2, "0")}`;
      const time = long[4] && long[5] ? `${long[4].padStart(2, "0")}:${long[5]}` : undefined;
      return { date, time };
    }
  }
  return {};
}

export class ETendersAdapter extends BaseAdapter {
  readonly sourceId = "etenders";
  readonly displayName = "eTenders Publication Portal";
  readonly type = "national" as const;

  async fetchListings(_env: Env): Promise<RawTender[]> {
    const res = await this.safeFetch(LISTINGS_URL);
    const html = await res.text();
    const root = parseHtml(html);

    const items: RawTender[] = [];
    const cards = root.querySelectorAll(".tenderListItem, .tender-card, article.tender");

    for (const card of cards) {
      const ref = card.querySelector(".tender-ref, .reference")?.text?.trim();
      const titleEl = card.querySelector(".tender-title a, h3 a, .title a");
      const title = titleEl?.text?.trim();
      const href = titleEl?.getAttribute("href");
      if (!ref || !title) continue;

      const organ = card.querySelector(".tender-organ, .department, .organ-of-state")?.text?.trim();
      const provinceText = card.querySelector(".tender-province, .province")?.text?.trim();
      const categoryText = card.querySelector(".tender-category, .category")?.text?.trim();
      const closing = card.querySelector(".tender-closing, .closing-date, .closing")?.text?.trim();
      const description = card.querySelector(".tender-description, .description, p")?.text?.trim();

      const { date: closing_date, time: closing_time } = parseClosingDate(closing);
      const url = href?.startsWith("http") ? href : `${BASE}${href || ""}`;

      items.push({
        source_id: this.sourceId,
        source_ref: ref,
        source_url: url,
        title,
        description,
        procuring_entity: organ,
        province: slugifyProvince(provinceText),
        category: classifyCategory(categoryText),
        closing_date,
        closing_time,
      });
    }

    return items;
  }

  // Detail enrichment: pull the full tender description, contact info,
  // and document links from the individual tender page.
  async fetchDetail(_env: Env, tender: RawTender): Promise<Partial<RawTender>> {
    if (!tender.source_url) return {};
    const res = await this.safeFetch(tender.source_url);
    const html = await res.text();
    const root = parseHtml(html);

    const description = root.querySelector(".tender-description, #description")?.text?.trim();
    const briefing = root.querySelector(".briefing-info, .briefing")?.text?.trim();
    const contact = root.querySelector(".contact-info, .contact")?.text || "";

    // Documents list: <a class="document-link" href="...">filename.pdf</a>
    const documents: { filename: string; url: string }[] = [];
    for (const a of root.querySelectorAll(".document-link, a[href$='.pdf'], a[href$='.zip']")) {
      const href = a.getAttribute("href");
      if (!href) continue;
      documents.push({
        filename: a.text?.trim() || href.split("/").pop() || "document",
        url: href.startsWith("http") ? href : `${BASE}${href}`,
      });
    }

    // Best-effort contact extraction (e.g. "Mr Khumalo (011) 555-1234 khumalo@..")
    const emailMatch = contact.match(/[\w.+-]+@[\w.-]+\.[\w]+/);
    const phoneMatch = contact.match(/(\+?27|0)\s?\d{2}\s?\d{3}\s?\d{4}/);
    const nameMatch = contact.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);

    return {
      description: description || tender.description,
      briefing_date: briefing ? parseClosingDate(briefing).date : undefined,
      briefing_compulsory: briefing ? /compulsory/i.test(briefing) : undefined,
      briefing_location: briefing,
      contact_email: emailMatch?.[0],
      contact_phone: phoneMatch?.[0],
      contact_name: nameMatch?.[1],
      documents,
      raw_html: html.length > 50_000 ? html.slice(0, 50_000) : html,
    };
  }
}
