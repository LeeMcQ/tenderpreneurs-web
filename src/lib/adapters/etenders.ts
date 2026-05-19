// eTenders OCDS API adapter.
//
// Uses the official National Treasury OCDS REST API at:
//   https://ocds-api.etenders.gov.za
//
// This replaces the old HTML scraper that hit memory limits on Workers.
// The OCDS API returns structured JSON — no HTML parsing, no LLM needed
// for basic field extraction.
//
// The API serves data in Open Contracting Data Standard format.
// Docs: https://ocds-api.etenders.gov.za/swagger/
// License: Creative Commons BY 4.0
//
// Endpoint patterns (standard OCDS 1.1):
//   GET /api/ocds/releases?page=1&pageSize=50  — paginated releases
//   GET /api/ocds/release/{ocid}                — single release
//
// If the API structure differs from standard OCDS, the adapter will try
// multiple known endpoint patterns and fall back gracefully.

import { BaseAdapter, type RawTender } from "./base";
import type { Env } from "../db";

const API_BASE = "https://ocds-api.etenders.gov.za";

// Known endpoint patterns to try (different OCDS implementations vary)
const RELEASE_ENDPOINTS = [
  "/api/ocds/releases",
  "/api/Releases",
  "/api/releases",
  "/api/v1/releases",
  "/releases",
];

const PROVINCE_MAP: Record<string, string> = {
  "eastern cape": "eastern-cape",
  "free state": "free-state",
  "gauteng": "gauteng",
  "kwazulu-natal": "kwazulu-natal",
  "kwazulu natal": "kwazulu-natal",
  "kwa-zulu natal": "kwazulu-natal",
  "limpopo": "limpopo",
  "mpumalanga": "mpumalanga",
  "northern cape": "northern-cape",
  "north west": "north-west",
  "western cape": "western-cape",
  "national": "national",
};

function guessProvince(buyerName: string | undefined): string | undefined {
  if (!buyerName) return undefined;
  const lower = buyerName.toLowerCase();
  for (const [key, slug] of Object.entries(PROVINCE_MAP)) {
    if (lower.includes(key)) return slug;
  }
  // National departments and SOEs
  if (lower.includes("national") || lower.includes("treasury") ||
      lower.includes("sars") || lower.includes("eskom") ||
      lower.includes("transnet") || lower.includes("sanral")) {
    return "national";
  }
  return undefined;
}

function guessCategory(categories: string[] | undefined): "goods" | "services" | "construction" | "other" {
  if (!categories || categories.length === 0) return "other";
  const joined = categories.join(" ").toLowerCase();
  if (joined.includes("construct") || joined.includes("civil") || joined.includes("building")) return "construction";
  if (joined.includes("supply") || joined.includes("goods") || joined.includes("equipment")) return "goods";
  if (joined.includes("service") || joined.includes("consult")) return "services";
  return "other";
}

function extractDate(isoString: string | undefined | null): string | undefined {
  if (!isoString) return undefined;
  const match = isoString.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : undefined;
}

export class ETendersAdapter extends BaseAdapter {
  readonly sourceId = "etenders";
  readonly displayName = "eTenders OCDS API";
  readonly type = "national" as const;

  private async findWorkingEndpoint(env: Env): Promise<{ url: string; data: any } | null> {
    for (const path of RELEASE_ENDPOINTS) {
      const url = `${API_BASE}${path}?page=1&pageSize=20`;
      try {
        const res = await this.safeFetch(url);
        const text = await res.text();
        // Try to parse as JSON
        const data = JSON.parse(text);
        if (data && (Array.isArray(data) || data.releases || data.data || data.results || data.items)) {
          return { url: `${API_BASE}${path}`, data };
        }
      } catch {
        // Try next endpoint
        continue;
      }
    }
    return null;
  }

  private extractReleasesFromResponse(data: any): any[] {
    // Different OCDS APIs structure the response differently
    if (Array.isArray(data)) return data;
    if (data.releases && Array.isArray(data.releases)) return data.releases;
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.results && Array.isArray(data.results)) return data.results;
    if (data.items && Array.isArray(data.items)) return data.items;
    return [];
  }

  async fetchListings(env: Env): Promise<RawTender[]> {
    // Phase 1: Find the working endpoint
    const found = await this.findWorkingEndpoint(env);

    if (!found) {
      // Fallback: try the data portal CSV/JSON download pages
      throw new Error(
        "Could not find a working OCDS API endpoint at " + API_BASE +
        ". Tried: " + RELEASE_ENDPOINTS.join(", ") +
        ". The API may be temporarily down or the endpoint structure may have changed."
      );
    }

    const releases = this.extractReleasesFromResponse(found.data);
    const items: RawTender[] = [];

    // Phase 2: Fetch additional pages (up to 5 pages = ~100 tenders per run)
    const allReleases = [...releases];
    for (let page = 2; page <= 5; page++) {
      try {
        const res = await this.safeFetch(`${found.url}?page=${page}&pageSize=20`);
        const pageData = await res.json() as any;
        const pageReleases = this.extractReleasesFromResponse(pageData);
        if (pageReleases.length === 0) break;
        allReleases.push(...pageReleases);
      } catch {
        break; // Stop paginating on error
      }
    }

    // Phase 3: Convert OCDS releases to RawTender objects
    for (const release of allReleases) {
      try {
        const tender = this.releaseToRawTender(release);
        if (tender) items.push(tender);
      } catch {
        // Skip malformed releases
        continue;
      }
    }

    return items;
  }

  private releaseToRawTender(release: any): RawTender | null {
    // OCDS release structure:
    // release.ocid — unique contracting process ID
    // release.tender.title, release.tender.description
    // release.tender.tenderPeriod.endDate — closing date
    // release.buyer.name — procuring entity
    // release.tender.procurementMethodDetails, release.tender.mainProcurementCategory
    // release.tender.documents[] — bid documents

    const ocid = release.ocid || release.id;
    const tenderData = release.tender || {};
    const buyer = release.buyer || release.parties?.find((p: any) => p.roles?.includes("buyer")) || {};

    const title = tenderData.title || tenderData.description?.slice(0, 200);
    if (!ocid || !title) return null;

    const ref = tenderData.id || ocid;
    const description = tenderData.description || tenderData.title;
    const procuringEntity = buyer.name || buyer.id;
    const closingDate = extractDate(tenderData.tenderPeriod?.endDate);
    const publishedDate = extractDate(release.date || tenderData.tenderPeriod?.startDate);
    const categories = [tenderData.mainProcurementCategory, tenderData.procurementMethodDetails].filter(Boolean);

    // Documents
    const documents = (tenderData.documents || [])
      .filter((d: any) => d.url)
      .map((d: any) => ({
        filename: d.title || d.description || "document",
        url: d.url,
      }));

    // Contact info from parties
    const buyerParty = release.parties?.find((p: any) => p.roles?.includes("buyer"));
    const contact = buyerParty?.contactPoint || {};

    return {
      source_id: this.sourceId,
      source_ref: String(ref),
      source_url: `https://www.etenders.gov.za/Home/opportunities?id=1`,
      title: title.slice(0, 500),
      description: description?.slice(0, 2000),
      procuring_entity: procuringEntity,
      province: guessProvince(procuringEntity),
      category: guessCategory(categories),
      closing_date: closingDate,
      published_date: publishedDate,
      contact_name: contact.name,
      contact_email: contact.email,
      contact_phone: contact.telephone,
      documents: documents.length > 0 ? documents : undefined,
    };
  }
}
