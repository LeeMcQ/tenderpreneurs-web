#!/usr/bin/env node
// .github/scripts/_template-scraper.js
//
// ============================================================================
// TEMPLATE — copy this file when adding a new source.
// ============================================================================
//
// 1. Copy this file to .github/scripts/fetch-<source-slug>.js
// 2. Update SOURCE_ID, LISTING_URL, BUYER_NAME, PROVINCE_SLUG below
// 3. Implement parseListing() to match the target site's HTML / PDF / API
// 4. Add an entry in .github/workflows/cron.yml
// 5. Add a row in the D1 `sources` table (see TENDER_SCRAPING_HANDOFF.md §4)
//
// ----------------------------------------------------------------------------
// Patterns by source type:
//
// HTML listing (e.g. city-cape-town, ekurhuleni)
//   → import { parse } from 'node-html-parser'
//   → fetch the URL, parse rows, map to canonical
//
// PDF bulletin (e.g. eskom, government-tender-bulletin)
//   → import { extractText } from 'unpdf'
//   → fetch PDF as ArrayBuffer, extract text, regex tender blocks
//
// Excel/CSV bulletin
//   → import * as XLSX from 'xlsx'
//   → fetch, parse sheets, map rows
//
// Javascript-rendered (avoid unless absolutely necessary)
//   → use @playwright/test
//   → caps Actions minutes badly; talk to Leo before going this route
//
// JSON API (preferred — always check the Network tab first)
//   → straight fetch + JSON.parse
//   → already what fetch-etenders.js does for OCDS
// ============================================================================

import { parse } from 'node-html-parser';
import {
  mapSector,
  mapProvince,
  parseDate,
  politeFetch,
  clean,
  truncate,
  sleep,
  runIngest,
  safeMap,
  withTimeBudget,
  reportHealth,
} from './lib/common.js';

// -----------------------------------------------------------------------------
// CHANGE THESE
// -----------------------------------------------------------------------------

const SOURCE_ID = 'TODO-source-slug';       // must match D1 sources.id
const LISTING_URL = 'https://TODO/tenders'; // entry point for the scrape
const BUYER_NAME = 'TODO Buyer Name';       // used when source doesn't provide one
const PROVINCE_SLUG = 'national';           // hardcode if source is province-specific, else derive per-tender
const PAGE_DELAY_MS = 2000;                 // polite delay between page fetches
const TIME_BUDGET_MS = 4 * 60_000;          // 4 min — leaves headroom under the 5 min workflow timeout

// -----------------------------------------------------------------------------
// Parsing — implement this to match the target site
// -----------------------------------------------------------------------------

/**
 * Parse the listing HTML/PDF and return raw rows with whatever fields are
 * available. Don't worry about canonicalisation here — just extract.
 *
 * Each returned row should at minimum have:
 *   - externalId (the tender reference number on the source)
 *   - title (description text)
 * Other useful fields if available: closing, posted, buyer, location, sector hints,
 * detail URL, document URLs.
 */
function parseListing(html) {
  const root = parse(html);
  const out = [];

  // TODO: replace these selectors with whatever matches the target site.
  // Use the browser's "Inspect Element" → "Copy selector" as a starting point,
  // then simplify (avoid auto-generated IDs that may change).
  const rows = root.querySelectorAll('.tender-row');

  for (const row of rows) {
    const externalId = clean(row.querySelector('.ref-number')?.text);
    const title = clean(row.querySelector('.title')?.text);
    const closingText = clean(row.querySelector('.closing-date')?.text);
    const postedText = clean(row.querySelector('.posted-date')?.text);
    const detailHref = row.querySelector('a.details')?.getAttribute('href');

    if (!externalId || !title) continue; // skip incomplete rows

    out.push({
      externalId,
      title,
      closingText,
      postedText,
      detailHref,
    });
  }

  return out;
}

// -----------------------------------------------------------------------------
// Optional: fetch detail page for extra fields (description, documents, contact)
// -----------------------------------------------------------------------------

/**
 * Fetch a per-tender detail page and extract anything not on the listing.
 * Only implement this if the listing page lacks essential fields and the
 * source allows public access to detail pages without authentication.
 *
 * Always sleep PAGE_DELAY_MS between calls to avoid hammering the server.
 */
async function fetchDetail(url) {
  await sleep(PAGE_DELAY_MS);
  const res = await politeFetch(url);
  if (!res) return {};
  const html = await res.text();
  const root = parse(html);

  return {
    description: clean(root.querySelector('.tender-description')?.text),
    documentUrls: root.querySelectorAll('a.document')
      .map((a) => a.getAttribute('href'))
      .filter(Boolean)
      .slice(0, 10),
    contactEmail: clean(root.querySelector('.contact-email')?.text) || null,
    contactPhone: clean(root.querySelector('.contact-phone')?.text) || null,
    briefingDate: parseDate(clean(root.querySelector('.briefing-date')?.text)),
    briefingCompulsory: /compulsory/i.test(root.querySelector('.briefing')?.text ?? ''),
  };
}

// -----------------------------------------------------------------------------
// Canonical mapping
// -----------------------------------------------------------------------------

function toCanonical(row, detail = {}) {
  const sectorInput = `${row.title} ${detail.description ?? ''}`;
  return {
    externalId: row.externalId,
    title: truncate(row.title, 300),
    description: truncate(detail.description ?? '', 500),
    buyer: BUYER_NAME,
    province: PROVINCE_SLUG, // or mapProvince(row.location) if source provides it
    sector: mapSector(sectorInput),
    status: 'active',
    closingDate: parseDate(row.closingText),
    openingDate: parseDate(row.postedText),
    value: null,
    currency: 'ZAR',
    documentUrls: detail.documentUrls ?? [],
    sourceUrl: row.detailHref ?? LISTING_URL,
    briefingDate: detail.briefingDate ?? null,
    briefingCompulsory: detail.briefingCompulsory ?? false,
    contactName: detail.contactName ?? null,
    contactEmail: detail.contactEmail ?? null,
    contactPhone: detail.contactPhone ?? null,
  };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const started = Date.now();
  console.log(`[${SOURCE_ID}] starting scrape of ${LISTING_URL}`);

  let result = { totalNew: 0, totalUpdated: 0, totalErrors: 0, batchesPushed: 0, totalScraped: 0 };

  try {
    // The whole pipeline runs inside a wall-clock budget so a hung fetch or
    // runaway pagination loop can't consume more than its share of Actions
    // minutes. This is one of two safety nets — the workflow-level
    // `timeout-minutes:` config is the outer one.
    result = await withTimeBudget(SOURCE_ID, TIME_BUDGET_MS, async () => {
      const res = await politeFetch(LISTING_URL);
      if (!res) {
        console.error(`[${SOURCE_ID}] fetch failed`);
        return { totalNew: 0, totalUpdated: 0, totalErrors: 0, batchesPushed: 0, totalScraped: 0 };
      }

      const html = await res.text();
      if (!html || html.length < 1000) {
        console.error(`[${SOURCE_ID}] suspiciously short response (${html.length} bytes)`);
        return { totalNew: 0, totalUpdated: 0, totalErrors: 0, batchesPushed: 0, totalScraped: 0 };
      }

      const rows = parseListing(html);
      console.log(`[${SOURCE_ID}] parsed ${rows.length} listings`);

      if (rows.length === 0) {
        console.log(`[${SOURCE_ID}] no listings today — exit 0`);
        return { totalNew: 0, totalUpdated: 0, totalErrors: 0, batchesPushed: 0, totalScraped: 0 };
      }

      // OPTIONAL: enrich with detail pages. Only do this if the listing lacks
      // essential data AND the source allows public detail access. Otherwise skip.
      //
      // const enriched = [];
      // for (const row of rows.slice(0, 200)) {
      //   const detail = row.detailHref ? await fetchDetail(row.detailHref) : {};
      //   enriched.push(toCanonical(row, detail));
      // }
      //
      // For the simpler case (listing has everything) — and using safeMap so
      // one bad row can't take down the whole batch:
      const { results: tenders, errors: mapErrors } = safeMap(
        rows,
        (r) => toCanonical(r),
        SOURCE_ID
      );
      console.log(`[${SOURCE_ID}] canonical-mapped ${tenders.length} (${mapErrors} per-row errors)`);

      return await runIngest(SOURCE_ID, tenders);
    });
  } catch (err) {
    console.error(`[${SOURCE_ID}] uncaught error: ${err.message}`);
    result = { ...result, totalErrors: result.totalErrors + 1 };
  }

  // Always report health, even on failure — that's how we detect silent deaths
  const durationMs = Date.now() - started;
  await reportHealth(SOURCE_ID, result, { durationMs });

  // Exit 1 only if we got zero batches through AND had errors.
  if (result.totalErrors > 0 && result.batchesPushed === 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`[${SOURCE_ID}] fatal error escaped main():`, err);
  process.exit(1);
});
