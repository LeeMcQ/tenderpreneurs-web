// .github/scripts/lib/common.js
//
// Shared utilities for all Tenderpreneurs scrapers.
//
// Every per-source scraper imports from here:
//   - PROVINCE_MAP / mapProvince        — normalise any free-text province to a canonical slug
//   - SECTOR_KEYWORDS / mapSector       — keyword-based sector classification
//   - parseDate                          — turn any SA-government date format into YYYY-MM-DD
//   - politeFetch                        — fetch() with timeout + UA + retry
//   - sleep                              — async delay
//   - chunk                              — split array into batches
//   - fingerprint                        — sha256(title|ref|buyer) for dedup
//   - pushBatch                          — POST canonical tenders to /api/cron/ingest
//   - runIngest                          — end-to-end: dedup, chunk, push, summarise
//   - canonicalProvinces / canonicalSectors — the allowed slug sets

import { createHash } from 'node:crypto';

// -----------------------------------------------------------------------------
// Canonical vocabulary (mirrors what the D1 schema accepts)
// -----------------------------------------------------------------------------

export const canonicalProvinces = [
  'eastern-cape', 'free-state', 'gauteng', 'kwazulu-natal', 'limpopo',
  'mpumalanga', 'north-west', 'northern-cape', 'western-cape', 'national',
];

export const canonicalSectors = [
  'agriculture', 'catering', 'cleaning', 'construction', 'consulting',
  'education', 'energy', 'health', 'ict', 'legal', 'security', 'transport',
];

// -----------------------------------------------------------------------------
// Province mapping — every variant we've seen in SA government data
// -----------------------------------------------------------------------------

export const PROVINCE_MAP = {
  // Western Cape
  'western cape': 'western-cape',
  'wc': 'western-cape',
  'western-cape': 'western-cape',
  'cape town': 'western-cape',
  'city of cape town': 'western-cape',

  // Gauteng
  'gauteng': 'gauteng',
  'gp': 'gauteng',
  'johannesburg': 'gauteng',
  'tshwane': 'gauteng',
  'pretoria': 'gauteng',
  'ekurhuleni': 'gauteng',

  // KwaZulu-Natal
  'kwazulu-natal': 'kwazulu-natal',
  'kwazulu natal': 'kwazulu-natal',
  'kzn': 'kwazulu-natal',
  'durban': 'kwazulu-natal',
  'ethekwini': 'kwazulu-natal',
  'pietermaritzburg': 'kwazulu-natal',
  'msunduzi': 'kwazulu-natal',

  // Eastern Cape
  'eastern cape': 'eastern-cape',
  'eastern-cape': 'eastern-cape',
  'ec': 'eastern-cape',
  'port elizabeth': 'eastern-cape',
  'gqeberha': 'eastern-cape',
  'east london': 'eastern-cape',
  'nelson mandela bay': 'eastern-cape',
  'buffalo city': 'eastern-cape',

  // Free State
  'free state': 'free-state',
  'free-state': 'free-state',
  'fs': 'free-state',
  'bloemfontein': 'free-state',
  'mangaung': 'free-state',

  // Limpopo
  'limpopo': 'limpopo',
  'lp': 'limpopo',
  'polokwane': 'limpopo',

  // Mpumalanga
  'mpumalanga': 'mpumalanga',
  'mp': 'mpumalanga',
  'nelspruit': 'mpumalanga',
  'mbombela': 'mpumalanga',

  // North West
  'north west': 'north-west',
  'north-west': 'north-west',
  'nw': 'north-west',
  'mahikeng': 'north-west',
  'rustenburg': 'north-west',

  // Northern Cape
  'northern cape': 'northern-cape',
  'northern-cape': 'northern-cape',
  'nc': 'northern-cape',
  'kimberley': 'northern-cape',

  // National (SOEs, national departments)
  'national': 'national',
  'all provinces': 'national',
  'south africa': 'national',
  'national treasury': 'national',
  'rsa': 'national',
};

/**
 * Normalise any free-text province / buyer location to a canonical slug.
 * Falls back to 'national' if nothing matches.
 */
export function mapProvince(text = '') {
  if (!text) return 'national';
  const cleaned = String(text).toLowerCase().trim();
  if (PROVINCE_MAP[cleaned]) return PROVINCE_MAP[cleaned];

  // Partial-match fallback — useful when province appears inside a longer string
  for (const [needle, slug] of Object.entries(PROVINCE_MAP)) {
    if (cleaned.includes(needle)) return slug;
  }
  return 'national';
}

// -----------------------------------------------------------------------------
// Sector classification — keyword-based
// -----------------------------------------------------------------------------

export const SECTOR_KEYWORDS = {
  agriculture: ['farm', 'agric', 'crop', 'livestock', 'veterinar', 'irrigation', 'horticult', 'seed', 'plant nursery'],
  catering: ['cater', 'food serv', 'meal', 'refreshment', 'lunch', 'kitchen serv', 'canteen'],
  cleaning: ['cleaning', 'janitorial', 'hygiene', 'sanitation serv', 'laundry', 'sweeping', 'horticultur', 'grounds'],
  construction: ['construct', 'civil', 'building', 'road', 'bridge', 'infrastructure', 'rehabilitat', 'paving', 'concrete', 'cidb', 'housing', 'erf '],
  consulting: ['consult', 'advisor', 'profess service', 'professional service', 'feasibility', 'study', 'audit', 'assessment', 'research'],
  education: ['school', 'educat', 'learner', 'student', 'curriculum', 'training', 'bursary', 'tvet', 'university'],
  energy: ['electric', 'energy', 'solar', 'power', 'generator', 'transformer', 'substation', 'cable', 'pv ', 'ipp'],
  health: ['health', 'medical', 'hospital', 'clinic', 'pharma', 'ppe', 'nursing', 'patient', 'diagnostic', 'ambulance'],
  ict: ['ict', 'software', 'hardware', 'computer', 'network', 'fibre', 'fiber', 'server', 'cloud', 'database', 'ai ', 'artificial intelligence', 'microsoft', 'cisco', 'data ', 'cyber', 'erp', 'sap'],
  legal: ['legal', 'attorney', 'law firm', 'litigation', 'counsel', 'advocate'],
  security: ['security', 'guard', 'surveillance', 'cctv', 'access control', 'firearm', 'body armour', 'patrol', 'police', 'fencing'],
  transport: ['transport', 'vehicle', 'fleet', 'logist', 'shuttle', 'truck', 'bus', 'rail', 'aviation', 'airport', 'port', 'shipping', 'fuel'],
};

/**
 * Map free-text (usually title + description) to a canonical sector slug.
 * Returns 'consulting' as a safe fallback for tenders that look service-oriented,
 * or the highest-scoring sector based on keyword hits.
 */
export function mapSector(text = '') {
  if (!text) return 'consulting';
  const lower = String(text).toLowerCase();
  let bestSector = null;
  let bestScore = 0;

  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestSector = sector;
    }
  }
  return bestSector ?? 'consulting';
}

// -----------------------------------------------------------------------------
// Date parsing — every SA government date format normalised to YYYY-MM-DD
// -----------------------------------------------------------------------------

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/**
 * Parse any reasonable SA-government date format into ISO YYYY-MM-DD.
 * Handles:
 *   - "2026-05-22" (already ISO)
 *   - "2026-05-22 10:00 AM" (ISO with time)
 *   - "2026/05/22"
 *   - "22/05/2026" or "22-05-2026"
 *   - "22 May 2026" or "22 May 2026 10:00"
 *   - "May 22, 2026"
 * Returns null if no recognisable date.
 */
export function parseDate(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  // Already ISO (possibly with time): 2026-05-22 ... or 2026-05-22T...
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // YYYY/MM/DD
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  // DD Month YYYY
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month) return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  // Month DD, YYYY
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    if (month) return `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }

  return null;
}

// -----------------------------------------------------------------------------
// HTTP helpers
// -----------------------------------------------------------------------------

const USER_AGENT = 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za) sync bot';
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * fetch() with sensible defaults: clear UA, timeout, automatic retry on 5xx.
 * Returns null on persistent failure rather than throwing — caller decides
 * whether that's fatal or a "no data today" exit-0 scenario.
 */
export async function politeFetch(url, opts = {}) {
  const {
    timeout = DEFAULT_TIMEOUT_MS,
    retries = 2,
    accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    headers = {},
    ...rest
  } = opts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...rest,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: accept,
          'Accept-Language': 'en-ZA,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          ...headers,
        },
        signal: AbortSignal.timeout(timeout),
      });
      if (res.ok) return res;
      // Retry on 5xx, give up on 4xx
      if (res.status < 500) {
        console.warn(`[politeFetch] ${url} -> HTTP ${res.status} (no retry)`);
        return null;
      }
      console.warn(`[politeFetch] ${url} -> HTTP ${res.status} (attempt ${attempt + 1}/${retries + 1})`);
    } catch (err) {
      console.warn(`[politeFetch] ${url} -> ${err.message} (attempt ${attempt + 1}/${retries + 1})`);
    }
    if (attempt < retries) await sleep(2000 * (attempt + 1));
  }
  return null;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -----------------------------------------------------------------------------
// Array utilities
// -----------------------------------------------------------------------------

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// -----------------------------------------------------------------------------
// Defensive per-item mapping
// -----------------------------------------------------------------------------

/**
 * Apply a mapping function to each item, catching errors per-item so one bad
 * row can't take down the whole batch. Returns { results, errors }.
 *
 * This is the single most important defensive primitive in the pipeline:
 * a typo in a regex, a null pointer in a date string, a weird unicode
 * character in a description — none of them should cause us to drop 199
 * good tenders alongside the 1 broken one.
 *
 * Usage:
 *   const { results: tenders, errors } = safeMap(rows, toCanonical, SOURCE_ID);
 *   if (errors > 5) console.warn(`[${SOURCE_ID}] ${errors} rows failed mapping`);
 */
export function safeMap(items, mapFn, sourceId = 'unknown') {
  const results = [];
  let errors = 0;
  for (let i = 0; i < items.length; i++) {
    try {
      const mapped = mapFn(items[i], i);
      if (mapped != null) results.push(mapped);
    } catch (err) {
      errors++;
      // Log first 3 errors with full detail, then just count the rest
      if (errors <= 3) {
        console.warn(`[${sourceId}] safeMap item ${i} failed: ${err.message}`);
      }
    }
  }
  if (errors > 3) {
    console.warn(`[${sourceId}] safeMap: ${errors} total errors (showing first 3)`);
  }
  return { results, errors };
}

// -----------------------------------------------------------------------------
// Fingerprinting — for de-duplication within a source
// -----------------------------------------------------------------------------

/**
 * Produce a deterministic SHA-256 of the canonical identifying fields.
 * Used for in-script dedup before pushing, and (separately) by the Worker
 * for dedup across the whole D1 table.
 */
export function fingerprint(tender) {
  const parts = [
    (tender.externalId ?? '').toLowerCase().trim(),
    (tender.title ?? '').toLowerCase().trim(),
    (tender.buyer ?? '').toLowerCase().trim(),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

/**
 * Deduplicate a list of canonical tenders by their fingerprint.
 * Keeps the first occurrence of each unique fingerprint.
 * Per-item errors during fingerprinting are caught and logged — that item
 * is dropped, but the rest still get deduped.
 */
export function dedupTenders(tenders) {
  const seen = new Set();
  const out = [];
  let errors = 0;
  for (const t of tenders) {
    try {
      const fp = fingerprint(t);
      if (seen.has(fp)) continue;
      seen.add(fp);
      out.push(t);
    } catch (err) {
      errors++;
    }
  }
  if (errors > 0) console.warn(`dedupTenders dropped ${errors} unprocessable items`);
  return out;
}

// -----------------------------------------------------------------------------
// Canonical tender validation
// -----------------------------------------------------------------------------

/**
 * Light validation — drop tenders missing required fields, return only valid.
 * Logs warnings for dropped items so scraper authors can debug.
 * Per-item errors are caught — a single malformed object can't crash the batch.
 */
export function validateTenders(tenders, sourceId) {
  const valid = [];
  let dropped = 0;
  let errors = 0;
  for (const t of tenders) {
    try {
      if (!t || typeof t !== 'object') { dropped++; continue; }
      if (!t.externalId || !t.title || !t.province || !t.sector) {
        dropped++;
        continue;
      }
      if (!canonicalProvinces.includes(t.province)) {
        console.warn(`[${sourceId}] dropping tender with invalid province "${t.province}": ${t.externalId}`);
        dropped++;
        continue;
      }
      if (!canonicalSectors.includes(t.sector)) {
        console.warn(`[${sourceId}] dropping tender with invalid sector "${t.sector}": ${t.externalId}`);
        dropped++;
        continue;
      }
      valid.push(t);
    } catch (err) {
      errors++;
    }
  }
  if (dropped > 0) console.warn(`[${sourceId}] dropped ${dropped} invalid tenders`);
  if (errors > 0) console.warn(`[${sourceId}] ${errors} tenders caused validation exceptions`);
  return valid;
}

// -----------------------------------------------------------------------------
// Pushing to the ingest endpoint
// -----------------------------------------------------------------------------

/**
 * POST one batch of tenders to /api/cron/ingest.
 * Returns { status, body, parsed, networkError } — never throws.
 * networkError is set when fetch itself failed (timeout, DNS, etc).
 */
export async function pushBatch(siteUrl, secret, sourceId, batch) {
  try {
    const res = await fetch(`${siteUrl}/api/cron/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': secret,
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ source: sourceId, tenders: batch }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(body); } catch { /* non-JSON response */ }
    return { status: res.status, body, parsed, networkError: null };
  } catch (err) {
    return { status: 0, body: '', parsed: null, networkError: err.message };
  }
}

/**
 * High-level helper: dedupe, validate, batch, and push every tender.
 * Reads CRON_SECRET and SITE_URL from process.env.
 *
 * Returns { totalNew, totalUpdated, totalErrors, batchesPushed, totalScraped }.
 *
 * This function NEVER throws. Every per-batch error is caught and reported in
 * the return value, so one failing batch can't prevent the next from trying.
 *
 * Designed so a scraper's main() looks like:
 *
 *     const tenders = await scrapeMySource();
 *     const result = await runIngest(SOURCE_ID, tenders);
 *     await reportHealth(SOURCE_ID, result);
 *     process.exit(result.totalErrors > 0 && result.batchesPushed === 0 ? 1 : 0);
 */
export async function runIngest(sourceId, tenders, opts = {}) {
  const {
    batchSize = 100,
    maxTenders = 200,
    siteUrl = (process.env.SITE_URL ?? 'https://tenderpreneurs.pages.dev').replace(/\/$/, ''),
    secret = process.env.CRON_SECRET,
  } = opts;

  const totalScraped = tenders.length;

  if (!secret) {
    console.error(`[${sourceId}] CRON_SECRET not set — cannot push`);
    return { totalNew: 0, totalUpdated: 0, totalErrors: 1, batchesPushed: 0, totalScraped };
  }

  // 1. Validate, dedup — these are pure functions and don't throw
  let validated, deduped, capped;
  try {
    validated = validateTenders(tenders, sourceId);
    deduped = dedupTenders(validated);
    capped = deduped.slice(0, maxTenders);
  } catch (err) {
    console.error(`[${sourceId}] validation/dedup failed: ${err.message}`);
    return { totalNew: 0, totalUpdated: 0, totalErrors: 1, batchesPushed: 0, totalScraped };
  }

  console.log(`[${sourceId}] ${totalScraped} scraped -> ${validated.length} valid -> ${deduped.length} unique -> ${capped.length} after cap`);

  if (capped.length === 0) {
    console.log(`[${sourceId}] nothing to push (no new tenders today)`);
    return { totalNew: 0, totalUpdated: 0, totalErrors: 0, batchesPushed: 0, totalScraped };
  }

  // 2. Push in batches — each batch is independently try/catched so a failure
  // in batch 2 cannot prevent batch 3 from trying.
  const batches = chunk(capped, batchSize);
  let totalNew = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  let batchesPushed = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      const { status, body, parsed, networkError } = await pushBatch(siteUrl, secret, sourceId, batch);
      if (networkError) {
        totalErrors++;
        console.error(`[${sourceId}] batch ${i + 1}/${batches.length}: network error: ${networkError}`);
      } else if (status === 200 && parsed) {
        totalNew += parsed.items_new ?? 0;
        totalUpdated += parsed.items_updated ?? 0;
        batchesPushed++;
        console.log(`[${sourceId}] batch ${i + 1}/${batches.length}: HTTP 200, +${parsed.items_new ?? 0} new, ${parsed.items_updated ?? 0} updated`);
      } else {
        totalErrors++;
        console.error(`[${sourceId}] batch ${i + 1}/${batches.length}: HTTP ${status}, body=${body.slice(0, 300)}`);
      }
    } catch (err) {
      totalErrors++;
      console.error(`[${sourceId}] batch ${i + 1}/${batches.length}: uncaught error: ${err.message}`);
    }
  }

  console.log(`[${sourceId}] DONE: ${totalNew} new, ${totalUpdated} updated, ${totalErrors} errors`);
  return { totalNew, totalUpdated, totalErrors, batchesPushed, totalScraped };
}

// -----------------------------------------------------------------------------
// Text helpers
// -----------------------------------------------------------------------------

/**
 * Collapse all whitespace runs to single spaces and trim.
 * Use on every string extracted from HTML — government sites are riddled
 * with non-breaking spaces, tabs, and stray newlines.
 */
export function clean(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

/**
 * Truncate to a max length, adding ellipsis. Useful for keeping titles
 * and descriptions within the D1 column limits.
 */
export function truncate(text = '', max = 300) {
  const s = clean(text);
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

// -----------------------------------------------------------------------------
// Time-budget enforcement (in-script timeout)
// -----------------------------------------------------------------------------

/**
 * Run an async task with a hard wall-clock timeout. If the task hasn't
 * resolved by `budgetMs`, this rejects with a TimeoutError.
 *
 * Use this in main() to bound any single scraper's runtime, so a hung fetch
 * or runaway pagination loop can't consume more than its share of the
 * GitHub Actions minute budget.
 *
 *     await withTimeBudget(SOURCE_ID, 4 * 60_000, async () => {
 *       const tenders = await scrape();
 *       await runIngest(SOURCE_ID, tenders);
 *     });
 *
 * This is one of two layers — the workflow-level `timeout-minutes:` config
 * is the outer guard. This in-script budget gives finer-grained control
 * (e.g. abort at 4 min so we have 1 min headroom before the workflow kills us).
 */
export async function withTimeBudget(sourceId, budgetMs, task) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`[${sourceId}] time budget exceeded (${budgetMs}ms)`));
    }, budgetMs);
  });

  try {
    return await Promise.race([task(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// -----------------------------------------------------------------------------
// Health reporting
// -----------------------------------------------------------------------------

/**
 * POST a health-status record after each scraper run.
 *
 * Sends to /api/cron/health with the same x-cron-secret used for ingestion.
 * The endpoint stores this in D1 so the admin dashboard can show which
 * scrapers are working and which aren't.
 *
 * NEVER throws — if the health endpoint is down, that's not a reason to
 * report the scraper itself as failed. Failure to report health is logged
 * but not propagated.
 *
 * Expected payload schema:
 *   {
 *     source: string,
 *     status: 'success' | 'partial' | 'no_data' | 'error',
 *     scraped: number,
 *     new: number,
 *     updated: number,
 *     errors: number,
 *     duration_ms: number,
 *     run_id: string  // GitHub Actions run ID if available
 *   }
 */
export async function reportHealth(sourceId, result, opts = {}) {
  const {
    durationMs = 0,
    siteUrl = (process.env.SITE_URL ?? 'https://tenderpreneurs.pages.dev').replace(/\/$/, ''),
    secret = process.env.CRON_SECRET,
    runId = process.env.GITHUB_RUN_ID ?? 'local',
  } = opts;

  if (!secret) {
    console.warn(`[${sourceId}] reportHealth skipped — no secret`);
    return;
  }

  // Determine status from result shape
  let status;
  if (result.totalErrors > 0 && result.batchesPushed === 0) {
    status = 'error';
  } else if (result.totalErrors > 0) {
    status = 'partial';
  } else if ((result.totalScraped ?? 0) === 0) {
    status = 'no_data';
  } else {
    status = 'success';
  }

  const payload = {
    source: sourceId,
    status,
    scraped: result.totalScraped ?? 0,
    new: result.totalNew ?? 0,
    updated: result.totalUpdated ?? 0,
    errors: result.totalErrors ?? 0,
    duration_ms: durationMs,
    run_id: String(runId),
  };

  try {
    await fetch(`${siteUrl}/api/cron/health`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': secret,
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    console.log(`[${sourceId}] health reported: ${status}`);
  } catch (err) {
    // Best-effort only — don't propagate failure
    console.warn(`[${sourceId}] health report failed: ${err.message}`);
  }
}
