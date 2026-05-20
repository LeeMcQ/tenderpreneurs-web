#!/usr/bin/env node
// .github/scripts/fetch-gtb.js
//
// Scrapes the weekly Government Tender Bulletin (GTB) published by the
// Government Printing Works.
//
// The GTB is the LEGAL source of record for all SA tenders above R1m and
// is published every Friday. It often catches notices that don't make it
// onto eTenders (cancellations, amendments, small municipality notices).
//
// Approach:
//   1. Fetch the GTB landing page at gpwonline.co.za/GAZETTES/Pages/Tender-Bulletin.aspx
//   2. Find the most recent PDF link (URL pattern: ..._TenderBulletin.pdf)
//   3. Download the PDF (cap at ~20MB to avoid runaway downloads)
//   4. Extract text with unpdf
//   5. Regex tender blocks — each typically has: BID NUMBER, SERVICE/SUPPLY,
//      CLOSING DATE, BIDDING DEPARTMENT, BRIEFING SESSION, CONTACT, etc.
//   6. Map to canonical RawTender shape and push.
//
// Caveats noted for follow-up sessions:
//   - The GTB is unstructured prose. Regex-based extraction will miss some
//     items. Target precision (correct parses) > recall (catching everything).
//   - Some tenders span multiple columns/pages; treat each "BID NUMBER" header
//     as a record boundary.
//   - File names are like "NN_DD-M_TenderBulletin.pdf" where NN = gazette number.
//     The number increments weekly so we can't predict it — must scrape the
//     landing page to find it.

import {
  politeFetch,
  clean,
  truncate,
  mapSector,
  mapProvince,
  parseDate,
  runIngest,
  safeMap,
  withTimeBudget,
  reportHealth,
} from './lib/common.js';
import { parse } from 'node-html-parser';

const SOURCE_ID = 'government-tender-bulletin';
const LANDING_URL = 'https://www.gpwonline.co.za/Gazettes/Pages/Tender-Bulletin.aspx';
const ALT_LANDING_URL = 'http://www.gpwonline.co.za/GAZETTES/Pages/Tender-Bulletin.aspx'; // http variant has been used historically
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB cap
const TIME_BUDGET_MS = 9 * 60_000;       // 9 min — PDF parsing is slow, leaves 1 min under the 10 min workflow cap

// -----------------------------------------------------------------------------
// Step 1: Discover the latest PDF URL
// -----------------------------------------------------------------------------

/**
 * Parse the GTB landing page and return the most recent TenderBulletin PDF URL.
 * The landing page lists links to recent gazettes; the newest is what we want.
 */
function findLatestPdfUrl(html) {
  const root = parse(html);
  const links = root.querySelectorAll('a');
  const pdfLinks = [];
  for (const a of links) {
    const href = a.getAttribute('href') ?? '';
    if (/TenderBulletin\.pdf$/i.test(href)) {
      const text = clean(a.text);
      pdfLinks.push({ href, text });
    }
  }

  if (pdfLinks.length === 0) return null;

  // The page is typically ordered newest first. Try to find a date in either
  // the link text or filename to confirm the order, but trust position by default.
  // Filenames follow pattern: <number>_<date>_TenderBulletin.pdf
  // e.g.  3023_15-5_TenderBulletin.pdf  (gazette 3023, 15 May)
  pdfLinks.sort((a, b) => {
    // Higher gazette number = more recent
    const numA = parseInt(a.href.match(/\/(\d+)_/)?.[1] ?? '0', 10);
    const numB = parseInt(b.href.match(/\/(\d+)_/)?.[1] ?? '0', 10);
    return numB - numA;
  });

  const best = pdfLinks[0];
  return best.href.startsWith('http') ? best.href : new URL(best.href, LANDING_URL).toString();
}

// -----------------------------------------------------------------------------
// Step 2: Extract tender records from the PDF text
// -----------------------------------------------------------------------------

/**
 * Parse the GTB PDF text into individual tender records.
 *
 * The bulletin's structure is roughly:
 *
 *   SUPPLIES: GENERAL
 *   BID NO: ABCD/EFGH                                  CLOSING DATE: 2026-06-15
 *   DESCRIPTION: Supply and delivery of ... at the Department of ...
 *   BRIEFING SESSION: 2026-05-30 10:00, Compulsory: Yes/No
 *   CONTACT: Mr X, x@dept.gov.za, 012 345 6789
 *
 *   BID NO: ...
 *
 * Each "BID NO:" line is a record start. Capture until the next "BID NO:" or
 * section header.
 *
 * TODO (next session): Refine regex against a real bulletin sample. The general
 * shape is consistent but exact label spellings vary by issuing department.
 */
function parseGtbText(text) {
  if (!text || text.length < 1000) return [];

  // Normalise line breaks and squish whitespace
  const normalised = text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ');

  // Split into per-tender blocks. Each block starts with "BID NUMBER" or "BID NO"
  // (case-insensitive). The official bulletin uses both forms.
  const blocks = normalised.split(/(?=\bBID\s+(?:NO|NUMBER)\b)/i);

  const out = [];
  for (const block of blocks) {
    if (block.length < 50) continue; // skip header noise

    // Extract bid reference number
    const bidMatch = block.match(/BID\s+(?:NO|NUMBER)\s*[:\-]?\s*([A-Z0-9][\w\/\-\.]{2,40})/i);
    if (!bidMatch) continue;
    const externalId = bidMatch[1].trim();

    // Extract description — anything after "DESCRIPTION:" up to next labelled field,
    // or fall back to the text after the bid number on the same line.
    let description = '';
    const descMatch = block.match(/DESCRIPTION\s*[:\-]?\s*([\s\S]+?)(?=\n[A-Z\s]{3,}[:\-]|\n\n|$)/i);
    if (descMatch) {
      description = clean(descMatch[1]).slice(0, 500);
    } else {
      // Fall back: take the next non-empty line after the bid number
      const lines = block.split('\n').map((l) => clean(l)).filter(Boolean);
      description = (lines[1] ?? '').slice(0, 500);
    }
    if (!description || description.length < 10) continue;

    // Extract closing date
    const closingMatch = block.match(/CLOSING\s+DATE\s*[:\-]?\s*([0-9A-Za-z\/\-\s,]{6,30})/i);
    const closingDate = closingMatch ? parseDate(closingMatch[1]) : null;

    // Extract buyer (issuing department)
    const buyerMatch = block.match(/(?:BIDDING\s+DEPARTMENT|DEPARTMENT|ENTITY|MUNICIPALITY)\s*[:\-]?\s*([^\n]{3,120})/i);
    const buyer = buyerMatch ? clean(buyerMatch[1]) : 'Government of South Africa';

    // Province — look for any of the canonical provinces in the block
    const province = mapProvince(block);

    // Briefing
    const briefMatch = block.match(/BRIEFING\s+SESSION\s*[:\-]?\s*([^\n]{6,80})/i);
    const briefingDate = briefMatch ? parseDate(briefMatch[1]) : null;
    const briefingCompulsory = /compulsory/i.test(briefMatch?.[1] ?? '');

    // Contact details
    const emailMatch = block.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    const phoneMatch = block.match(/\b0[0-9]{1,2}[\s-]?\d{3}[\s-]?\d{4}\b/);

    out.push({
      externalId,
      title: truncate(description, 300),
      description: truncate(description, 500),
      buyer: truncate(buyer, 200),
      province,
      sector: mapSector(`${description} ${buyer}`),
      status: 'active',
      closingDate,
      openingDate: null,
      value: null,
      currency: 'ZAR',
      documentUrls: [],
      sourceUrl: LANDING_URL,
      briefingDate,
      briefingCompulsory,
      contactName: null,
      contactEmail: emailMatch?.[0] ?? null,
      contactPhone: phoneMatch?.[0] ?? null,
    });
  }

  return out;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const started = Date.now();
  console.log(`[${SOURCE_ID}] looking up latest tender bulletin PDF...`);

  const zeroResult = { totalNew: 0, totalUpdated: 0, totalErrors: 0, batchesPushed: 0, totalScraped: 0 };
  let result = zeroResult;

  try {
    result = await withTimeBudget(SOURCE_ID, TIME_BUDGET_MS, async () => {
      let res = await politeFetch(LANDING_URL);
      if (!res) {
        console.warn(`[${SOURCE_ID}] primary landing failed, trying http fallback`);
        res = await politeFetch(ALT_LANDING_URL);
      }
      if (!res) {
        console.error(`[${SOURCE_ID}] both landing URLs failed`);
        return zeroResult;
      }

      const html = await res.text();
      const pdfUrl = findLatestPdfUrl(html);
      if (!pdfUrl) {
        console.error(`[${SOURCE_ID}] no TenderBulletin.pdf link found on landing page`);
        return zeroResult;
      }

      console.log(`[${SOURCE_ID}] latest PDF: ${pdfUrl}`);

      let pdfBytes;
      try {
        const pdfRes = await politeFetch(pdfUrl, {
          accept: 'application/pdf,*/*',
          timeout: 120_000,
        });
        if (!pdfRes) {
          console.error(`[${SOURCE_ID}] failed to download PDF`);
          return zeroResult;
        }
        const contentLength = parseInt(pdfRes.headers.get('content-length') ?? '0', 10);
        if (contentLength > MAX_PDF_BYTES) {
          console.error(`[${SOURCE_ID}] PDF too large: ${contentLength} bytes (cap ${MAX_PDF_BYTES})`);
          return zeroResult;
        }
        pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
      } catch (err) {
        console.error(`[${SOURCE_ID}] PDF download error: ${err.message}`);
        return zeroResult;
      }

      // Extract text with unpdf (dynamic import so this file doesn't fail to load
      // when unpdf isn't installed yet in development)
      let text;
      try {
        const { extractText } = await import('unpdf');
        const extracted = await extractText(pdfBytes, { mergePages: true });
        text = Array.isArray(extracted.text) ? extracted.text.join('\n') : extracted.text;
      } catch (err) {
        console.error(`[${SOURCE_ID}] unpdf extraction failed: ${err.message}`);
        return { ...zeroResult, totalErrors: 1 };
      }

      console.log(`[${SOURCE_ID}] extracted ${text.length} chars from PDF`);

      // parseGtbText is regex-heavy and may throw on weird input. Don't let it
      // kill the whole run — wrap and continue with whatever it produced.
      let tenders = [];
      try {
        tenders = parseGtbText(text);
      } catch (err) {
        console.error(`[${SOURCE_ID}] parseGtbText failed: ${err.message}`);
        return { ...zeroResult, totalErrors: 1 };
      }

      console.log(`[${SOURCE_ID}] parsed ${tenders.length} tender records`);

      if (tenders.length === 0) {
        console.log(`[${SOURCE_ID}] no tenders parsed — regex may need tuning against current bulletin format`);
        return zeroResult;
      }

      return await runIngest(SOURCE_ID, tenders);
    });
  } catch (err) {
    console.error(`[${SOURCE_ID}] uncaught error: ${err.message}`);
    result = { ...result, totalErrors: result.totalErrors + 1 };
  }

  const durationMs = Date.now() - started;
  await reportHealth(SOURCE_ID, result, { durationMs });

  if (result.totalErrors > 0 && result.batchesPushed === 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`[${SOURCE_ID}] fatal error escaped main():`, err);
  process.exit(1);
});
