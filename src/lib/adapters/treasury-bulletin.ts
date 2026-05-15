// National Treasury Tender Bulletin adapter.
//
// The Tender Bulletin is published as a weekly PDF on gov.za. We:
//  1. Scrape the listings page to find the latest PDF URL
//  2. Download the PDF and extract text via pdf-parse
//  3. Run a regex pass over the text to extract individual tender entries
//
// PDF text extraction is noisy. We bias toward recall (extract everything
// that looks like a tender entry) and let the LLM extraction step
// (extract/deepseek.ts) clean it up downstream.

import { BaseAdapter, type RawTender } from "./base";
import type { Env } from "../db";
import { parse as parseHtml } from "node-html-parser";

// PDF text extraction: dynamic import of `unpdf` (Worker-compatible).
// If the package isn't installed, the adapter no-ops gracefully so the
// rest of the pipeline keeps working.
async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  try {
    const mod: any = await import("unpdf");
    const { extractText, getDocumentProxy } = mod;
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  } catch (err: any) {
    throw new Error(`PDF extraction failed (is 'unpdf' installed?): ${err?.message || err}`);
  }
}

const LISTINGS_URL = "https://www.gov.za/documents/tender-bulletin";

// Treasury Bulletin entries follow a rough pattern:
//   <BID NUMBER>  <TITLE OR DEPT>  ...  CLOSING DATE: <DATE>
// We chunk on the bid-number pattern and treat each chunk as one tender.
const BID_RE = /^([A-Z]{2,8}[\s\-/]*\d{1,5}[\s\-/]*\d{0,4})/m;

export class TreasuryBulletinAdapter extends BaseAdapter {
  readonly sourceId = "treasury-bulletin";
  readonly displayName = "National Treasury Tender Bulletin";
  readonly type = "bulletin" as const;

  async fetchListings(_env: Env): Promise<RawTender[]> {
    const indexRes = await this.safeFetch(LISTINGS_URL);
    const indexHtml = await indexRes.text();
    const root = parseHtml(indexHtml);

    // Find the most recent .pdf link on the page
    const pdfLink = root
      .querySelectorAll("a[href$='.pdf']")
      .map((a) => a.getAttribute("href"))
      .find((h) => h && /tender.?bulletin/i.test(h));

    if (!pdfLink) {
      throw new Error("No tender-bulletin PDF link found on gov.za listings page");
    }
    const pdfUrl = pdfLink.startsWith("http") ? pdfLink : `https://www.gov.za${pdfLink}`;

    const pdfRes = await this.safeFetch(pdfUrl);
    const buffer = await pdfRes.arrayBuffer();
    const text = await extractPdfText(buffer);

    // Chunk on the bid-number pattern. Each chunk is one tender entry.
    const lines = text.split(/\n+/);
    const chunks: string[] = [];
    let cur: string[] = [];
    for (const line of lines) {
      if (BID_RE.test(line) && cur.length) {
        chunks.push(cur.join("\n"));
        cur = [line];
      } else {
        cur.push(line);
      }
    }
    if (cur.length) chunks.push(cur.join("\n"));

    const items: RawTender[] = [];
    for (const chunk of chunks) {
      const refMatch = chunk.match(BID_RE);
      if (!refMatch) continue;
      const ref = refMatch[1].trim();

      // Title: first meaningful line after the ref
      const titleLine = chunk
        .split(/\n/)
        .map((l) => l.trim())
        .filter((l) => l && !BID_RE.test(l))[0];
      if (!titleLine) continue;

      // Closing date
      const closingMatch = chunk.match(/closing\s*(?:date)?[:\s]+(\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}\s+\w+\s+\d{4})/i);
      const department = chunk.match(/department\s+of\s+[\w\s,&]+/i)?.[0];

      items.push({
        source_id: this.sourceId,
        source_ref: ref,
        source_url: pdfUrl,
        title: titleLine.slice(0, 300),
        description: chunk.slice(0, 1500),
        procuring_entity: department,
        closing_date: closingMatch?.[1]?.replace(/\//g, "-"),
        raw_html: chunk,
      });
    }

    return items;
  }
}
