#!/usr/bin/env node
// .github/scripts/fetch-city-cape-town.js
//
// Scrapes the City of Cape Town public tender portal:
//   https://web1.capetown.gov.za/web1/tenderportal/Tender
//
// Why this approach:
//   - The listing page is fully server-rendered HTML (no JavaScript required).
//   - It shows ALL currently advertised tenders on a single page (no pagination).
//   - All required fields (number, description, directorate, closing/posted dates)
//     are visible on the listing — no need to follow detail pages, which require
//     supplier registration anyway.
//
// This means: 1 HTTP request, no auth, no rate-limiting concerns, no detail
// page fetches. It's the cleanest possible scrape of any of our 12+ sources.

import { parse } from 'node-html-parser';
import {
  mapSector,
  parseDate,
  politeFetch,
  clean,
  truncate,
  runIngest,
  safeMap,
  withTimeBudget,
  reportHealth,
} from './lib/common.js';

// -----------------------------------------------------------------------------
// Source configuration
// -----------------------------------------------------------------------------

const SOURCE_ID = 'city-cape-town';
const LISTING_URL = 'https://web1.capetown.gov.za/web1/tenderportal/Tender';
const PORTAL_BASE = 'https://web1.capetown.gov.za';
const BUYER_NAME = 'City of Cape Town';
const PROVINCE_SLUG = 'western-cape';
const TIME_BUDGET_MS = 4 * 60_000;  // 4 minutes — leaves 1 min headroom under the 5 min workflow timeout

// -----------------------------------------------------------------------------
// HTML parsing
// -----------------------------------------------------------------------------

/**
 * Parse the City of Cape Town tender listing page.
 *
 * The page layout (verified 2026-05-20) is a single <table> where each row has:
 *   [0] Tender Number    e.g. "RFI147/2025/26"
 *   [1] Description      e.g. "Request for information for market pricing..."
 *   [2] Directorate      e.g. "CORPORATE SERVICES"
 *   [3] Department       e.g. "Information Systems and Technology"
 *   [4] Closing Date     e.g. "2026-05-22"
 *   [5] Closing Date     e.g. "2026-05-22 16:00 PM"   (duplicate column)
 *   [6] Posted Date      e.g. "2026-04-20"
 *   [7] Posted Date      e.g. "2026-04-20 10:07 AM"   (duplicate column)
 *   [8..10] Actions (Details / Add Notice / Delete links)
 *
 * The Details link is the source URL for that tender.
 */
function parseListing(html) {
  const root = parse(html);

  // Find the main table holding tenders. The portal has only one large table.
  const tables = root.querySelectorAll('table');
  let tenderTable = null;
  for (const t of tables) {
    const rows = t.querySelectorAll('tr');
    // The tender table has many rows (50+) and a header row containing
    // "Tender Number". Identify by the header.
    const headerText = rows[0]?.text?.toLowerCase() ?? '';
    if (headerText.includes('tender number') && rows.length > 5) {
      tenderTable = t;
      break;
    }
  }

  if (!tenderTable) {
    console.warn('[city-cape-town] could not find tender table — site layout may have changed');
    return [];
  }

  const rows = tenderTable.querySelectorAll('tr');
  const out = [];

  // Skip the first row (headers)
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].querySelectorAll('td');
    if (cells.length < 8) continue; // Skip malformed rows

    const externalId = clean(cells[0].text);
    const description = clean(cells[1].text);
    const directorate = clean(cells[2].text);
    const department = clean(cells[3].text);
    const closingDateText = clean(cells[4].text);
    const postedDateText = clean(cells[6].text);

    // Find the "Details" link to use as sourceUrl
    let detailUrl = null;
    const links = rows[i].querySelectorAll('a');
    for (const a of links) {
      const href = a.getAttribute('href') ?? '';
      if (href.includes('/Tender/Details/')) {
        detailUrl = href.startsWith('http') ? href : `${PORTAL_BASE}${href}`;
        break;
      }
    }

    if (!externalId || !description) continue;

    out.push({
      externalId,
      description,
      directorate,
      department,
      closingDateText,
      postedDateText,
      detailUrl,
    });
  }

  return out;
}

// -----------------------------------------------------------------------------
// Mapping to canonical RawTender shape
// -----------------------------------------------------------------------------

function toCanonical(row) {
  // Build a richer description by combining directorate + department + description
  // (since we're not fetching detail pages, this gives the worker more text to
  // search on later if needed).
  const fullDescription = [row.directorate, row.department, row.description]
    .filter(Boolean)
    .join(' — ');

  // Sector inference uses title + directorate + department for best results
  const sectorInput = `${row.description} ${row.directorate} ${row.department}`;

  return {
    externalId: row.externalId,
    title: truncate(row.description, 300),
    description: truncate(fullDescription, 500),
    buyer: row.department ? `${BUYER_NAME} — ${row.department}` : BUYER_NAME,
    province: PROVINCE_SLUG,
    sector: mapSector(sectorInput),
    status: 'active',
    closingDate: parseDate(row.closingDateText),
    openingDate: parseDate(row.postedDateText),
    value: null,
    currency: 'ZAR',
    documentUrls: [], // Detail pages are gated behind supplier login; documents not available without auth
    sourceUrl: row.detailUrl ?? LISTING_URL,
    briefingDate: null,
    briefingCompulsory: false,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
  };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const started = Date.now();
  console.log(`[${SOURCE_ID}] starting scrape of ${LISTING_URL}`);

  // The whole pipeline runs inside a wall-clock budget so a hung fetch or
  // runaway loop can't consume more than its share of Actions minutes.
  let result = { totalNew: 0, totalUpdated: 0, totalErrors: 0, batchesPushed: 0, totalScraped: 0 };
  let budgetExceeded = false;

  try {
    result = await withTimeBudget(SOURCE_ID, TIME_BUDGET_MS, async () => {
      const res = await politeFetch(LISTING_URL);
      if (!res) {
        console.error(`[${SOURCE_ID}] failed to fetch listing page after retries`);
        // Return a zero-result rather than throwing — keeps reportHealth in scope
        return { totalNew: 0, totalUpdated: 0, totalErrors: 0, batchesPushed: 0, totalScraped: 0 };
      }

      const html = await res.text();
      if (!html || html.length < 1000) {
        console.error(`[${SOURCE_ID}] suspiciously short response (${html.length} bytes) — likely an error page`);
        return { totalNew: 0, totalUpdated: 0, totalErrors: 0, batchesPushed: 0, totalScraped: 0 };
      }

      const rows = parseListing(html);
      console.log(`[${SOURCE_ID}] parsed ${rows.length} listings from page`);

      if (rows.length === 0) {
        console.log(`[${SOURCE_ID}] no listings parsed — page may be empty today, or layout changed`);
        return { totalNew: 0, totalUpdated: 0, totalErrors: 0, batchesPushed: 0, totalScraped: 0 };
      }

      // safeMap means one row with a weird date or unicode char doesn't kill
      // the other 49 rows. Each per-row error is caught and logged.
      const { results: tenders, errors: mapErrors } = safeMap(rows, toCanonical, SOURCE_ID);
      console.log(`[${SOURCE_ID}] canonical-mapped ${tenders.length} (${mapErrors} per-row errors)`);

      return await runIngest(SOURCE_ID, tenders);
    });
  } catch (err) {
    if (err.message.includes('time budget exceeded')) {
      budgetExceeded = true;
      console.error(`[${SOURCE_ID}] aborted: ${err.message}`);
      result = { ...result, totalErrors: result.totalErrors + 1 };
    } else {
      // Uncaught scraper bug — log but still try to report health
      console.error(`[${SOURCE_ID}] uncaught error: ${err.message}`);
      result = { ...result, totalErrors: result.totalErrors + 1 };
    }
  }

  // Always report health, even on failure — that's how we detect silent deaths
  const durationMs = Date.now() - started;
  await reportHealth(SOURCE_ID, result, { durationMs });

  // Exit 1 only if we got zero batches through AND had errors. Partial success
  // (some batches pushed) is still exit 0 — the next run will retry the rest.
  if (result.totalErrors > 0 && result.batchesPushed === 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`[${SOURCE_ID}] fatal error escaped main():`, err);
  process.exit(1);
});
