// National Treasury Tender Bulletin adapter — corrected for 2026 URLs.
//
// The tender bulletin is now accessible via the National Treasury's OCPO
// site. The old gov.za/documents/tender-bulletin URL 404s.
//
// New approach: use the data.etenders.gov.za portal to find downloadable
// data files, OR fall back to the OCPO site for the weekly PDF bulletin.

import { BaseAdapter, type RawTender } from "./base";
import type { Env } from "../db";
import { parse as parseHtml } from "node-html-parser";

// Try multiple known URLs for the tender bulletin
const BULLETIN_URLS = [
  "https://data.etenders.gov.za/Home/ReleasesFiles",
  "http://ocpo.treasury.gov.za/Suppliers_Area/Pages/Scheduled-Bids.aspx",
  "https://www.treasury.gov.za/divisions/ocpo/ostb/currenttenders.aspx",
];

export class TreasuryBulletinAdapter extends BaseAdapter {
  readonly sourceId = "treasury-bulletin";
  readonly displayName = "National Treasury Data Portal";
  readonly type = "bulletin" as const;

  async fetchListings(_env: Env): Promise<RawTender[]> {
    // Strategy: try to fetch the data portal's releases files page.
    // If it has downloadable JSON/CSV, parse those.
    // Otherwise, fall back gracefully with zero items (the eTenders OCDS
    // API already covers most of what the bulletin carries).

    for (const url of BULLETIN_URLS) {
      try {
        const res = await this.safeFetch(url);
        const html = await res.text();

        // Look for download links (JSON or CSV files)
        const root = parseHtml(html);
        const links = root.querySelectorAll("a[href]")
          .map(a => a.getAttribute("href"))
          .filter((href): href is string =>
            !!href && (href.endsWith(".json") || href.endsWith(".csv") || href.includes("download"))
          );

        if (links.length > 0) {
          // Found downloadable data files — take the most recent one
          const latestLink = links[0];
          const dataUrl = latestLink.startsWith("http") ? latestLink : new URL(latestLink, url).toString();

          try {
            const dataRes = await this.safeFetch(dataUrl);
            const text = await dataRes.text();

            // Try JSON parse
            try {
              const data = JSON.parse(text);
              return this.parseOCDSData(data);
            } catch {
              // Not JSON — might be CSV, skip for now
              return [];
            }
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }

    // No data source worked — return empty (non-fatal; eTenders API covers this)
    return [];
  }

  private parseOCDSData(data: any): RawTender[] {
    const releases = Array.isArray(data) ? data :
                     data.releases || data.data || data.results || [];

    const items: RawTender[] = [];
    for (const release of releases.slice(0, 50)) { // Cap at 50 per run
      try {
        const tender = release.tender || {};
        const buyer = release.buyer || {};
        const title = tender.title || tender.description;
        const ref = tender.id || release.ocid;

        if (!title || !ref) continue;

        items.push({
          source_id: this.sourceId,
          source_ref: String(ref),
          source_url: "https://data.etenders.gov.za/Home/ReleasesFiles",
          title: title.slice(0, 500),
          description: (tender.description || title).slice(0, 2000),
          procuring_entity: buyer.name,
          closing_date: tender.tenderPeriod?.endDate?.slice(0, 10),
          published_date: release.date?.slice(0, 10),
        });
      } catch {
        continue;
      }
    }

    return items;
  }
}
