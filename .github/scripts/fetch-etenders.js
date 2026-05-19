#!/usr/bin/env node
/**
 * .github/scripts/fetch-etenders.js
 *
 * Uses the OCP Data Registry mirror at fastly.data.open-contracting.org
 * which hosts the SA Treasury OCDS data as gzipped JSONL files on a CDN.
 *
 * Files are organized by year:
 *   https://fastly.data.open-contracting.org/downloads/south_africa_national_treasury_api/3398/2026.jsonl.gz
 *
 * Each line is one OCDS record package containing releases.
 *
 * The ID (3398 above) is the latest collection ID. We try a known recent ID first,
 * and fall back to scraping the registry page for the current one.
 */

import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';

const REGISTRY_PAGE = 'https://data.open-contracting.org/en/publication/143';
const CDN_BASE = 'https://fastly.data.open-contracting.org/downloads/south_africa_national_treasury_api';
const KNOWN_COLLECTION_IDS = ['3398', '3500', '3600', '3700', '3800', '3900', '4000']; // try these in order
const CURRENT_YEAR = new Date().getFullYear();
const FALLBACK_YEAR = CURRENT_YEAR - 1;
const FETCH_TIMEOUT_MS = 120_000;
const MAX_RELEASES = 500; // cap total releases ingested per run

const PROVINCE_MAP = {
  'Eastern Cape': 'eastern-cape', 'Free State': 'free-state',
  'Gauteng': 'gauteng', 'KwaZulu-Natal': 'kwazulu-natal',
  'Limpopo': 'limpopo', 'Mpumalanga': 'mpumalanga',
  'North West': 'north-west', 'Northern Cape': 'northern-cape',
  'Western Cape': 'western-cape', 'National': 'national',
};

const SECTOR_KEYWORDS = {
  construction: ['construction','works','infrastructure','building','civil','roads'],
  ict: ['ict','information technology','software','hardware','network','computer','digital'],
  health: ['health','medical','hospital','pharmaceutical','clinical','nursing'],
  education: ['education','training','school','university','learning','bursary'],
  transport: ['transport','logistics','fleet','vehicle','aviation'],
  agriculture: ['agriculture','farming','livestock','crop','veterinary'],
  energy: ['energy','electricity','solar','power','fuel','gas'],
  security: ['security','guard','surveillance','protection','cctv'],
  cleaning: ['cleaning','hygiene','waste','sanitation','refuse'],
  catering: ['catering','food service','hospitality','meals'],
  legal: ['legal services','attorney','litigation'],
  consulting: ['consulting','advisory','management services','research','audit'],
};

function mapSector(category = '') {
  const lower = String(category).toLowerCase();
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return sector;
  }
  return 'consulting';
}

// ─── Step 1: discover the latest collection ID ──────────────────────────────

async function discoverCollectionId() {
  console.log(`Looking up latest collection ID from ${REGISTRY_PAGE}`);
  try {
    const res = await fetch(REGISTRY_PAGE, {
      headers: { Accept: 'text/html', 'User-Agent': 'Tenderpreneurs/1.0' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.log(`  Registry page returned ${res.status}, using fallback IDs`);
      return null;
    }
    const html = await res.text();
    // Look for the south_africa_national_treasury_api/{ID}/ pattern
    const match = html.match(/south_africa_national_treasury_api\/(\d+)\//);
    if (match) {
      console.log(`  Found collection ID: ${match[1]}`);
      return match[1];
    }
    return null;
  } catch (e) {
    console.log(`  Registry page error: ${e.message}`);
    return null;
  }
}

// ─── Step 2: download and parse the JSONL.gz file ───────────────────────────

async function downloadAndParse(collectionId, year) {
  const url = `${CDN_BASE}/${collectionId}/${year}.jsonl.gz`;
  console.log(`Trying: ${url}`);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Tenderpreneurs/1.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.log(`  HTTP ${res.status}`);
      return null;
    }

    console.log(`  Downloading (Content-Length: ${res.headers.get('content-length') ?? 'unknown'})...`);

    // Stream-decompress and parse line by line
    const gunzip = createGunzip();
    Readable.fromWeb(res.body).pipe(gunzip);

    const releases = [];
    let buffer = '';

    for await (const chunk of gunzip) {
      buffer += chunk.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep last partial line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const pkg = JSON.parse(line);
          if (Array.isArray(pkg.releases)) {
            releases.push(...pkg.releases);
          } else if (pkg.ocid) {
            releases.push(pkg);
          }
          if (releases.length >= MAX_RELEASES * 3) break; // safety cap on parse
        } catch (_) {
          // skip bad lines
        }
      }

      if (releases.length >= MAX_RELEASES * 3) break;
    }

    // Process last partial line
    if (buffer.trim()) {
      try {
        const pkg = JSON.parse(buffer);
        if (Array.isArray(pkg.releases)) releases.push(...pkg.releases);
        else if (pkg.ocid) releases.push(pkg);
      } catch (_) {}
    }

    console.log(`  Parsed ${releases.length} releases from ${year} file`);
    return releases;
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    return null;
  }
}

// ─── Step 3: filter to most recent tenders ──────────────────────────────────

function filterRecent(releases, maxDaysOld = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxDaysOld);
  const cutoffMs = cutoff.getTime();

  // Sort by date desc (most recent first), then filter, then dedupe
  const seen = new Map();
  for (const r of releases) {
    const date = r.date ?? r.tender?.tenderPeriod?.endDate ?? null;
    if (!date) continue;
    const ts = new Date(date).getTime();
    if (isNaN(ts) || ts < cutoffMs) continue;
    if (!r.ocid) continue;
    // Keep the most recent version of each ocid
    const existing = seen.get(r.ocid);
    if (!existing || ts > existing._ts) {
      r._ts = ts;
      seen.set(r.ocid, r);
    }
  }

  const filtered = Array.from(seen.values()).sort((a, b) => b._ts - a._ts);
  return filtered.slice(0, MAX_RELEASES);
}

// ─── Step 4: map to our schema ──────────────────────────────────────────────

function mapRelease(release) {
  const t = release.tender;
  if (!t?.title) return null;
  return {
    externalId: release.ocid,
    title: String(t.title).slice(0, 300),
    description: String(t.description ?? '').slice(0, 500),
    buyer: t.procuringEntity?.name ?? release.buyer?.name ?? '',
    province: PROVINCE_MAP[t.province] ?? 'national',
    sector: mapSector(t.category ?? t.mainProcurementCategory ?? ''),
    status: 'active',
    closingDate: t.tenderPeriod?.endDate?.split('T')[0] ?? null,
    openingDate: t.tenderPeriod?.startDate?.split('T')[0]
                 ?? release.date?.split('T')[0] ?? null,
    value: typeof t.value?.amount === 'number' ? t.value.amount : null,
    currency: t.value?.currency ?? 'ZAR',
    documentUrls: (t.documents ?? [])
      .map(d => d.url).filter(Boolean).slice(0, 10),
    sourceUrl: `https://www.etenders.gov.za/home/TenderDetails?tenderID=${t.id ?? ''}`,
    briefingDate: t.briefingSession?.isSession
      ? (t.briefingSession.date?.split('T')[0] ?? null) : null,
    briefingCompulsory: t.briefingSession?.compulsory ?? false,
  };
}

// ─── Step 5: push to ingest endpoint ────────────────────────────────────────

async function pushBatch(siteUrl, secret, batch) {
  const res = await fetch(`${siteUrl}/api/cron/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': secret,
    },
    body: JSON.stringify({ source: 'etenders', tenders: batch }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.text();
  return { status: res.status, body };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const CRON_SECRET = process.env.CRON_SECRET;
  const SITE_URL = (process.env.SITE_URL || 'https://tenderpreneurs.pages.dev').replace(/\/$/, '');

  if (!CRON_SECRET) {
    console.error('CRON_SECRET not set');
    process.exit(1);
  }

  console.log('eTenders ingestion (via OCP Data Registry CDN)');
  console.log('================================================\n');

  // Build list of collection IDs to try
  const idsToTry = [];
  const discovered = await discoverCollectionId();
  if (discovered) idsToTry.push(discovered);
  for (const id of KNOWN_COLLECTION_IDS) {
    if (!idsToTry.includes(id)) idsToTry.push(id);
  }

  // Try each ID with current year, then fallback year
  let allReleases = [];
  let foundId = null;

  outer: for (const id of idsToTry) {
    for (const year of [CURRENT_YEAR, FALLBACK_YEAR]) {
      const releases = await downloadAndParse(id, year);
      if (releases && releases.length > 0) {
        allReleases = releases;
        foundId = id;
        console.log(`✓ Successfully fetched from collection ${id}, year ${year}`);
        break outer;
      }
    }
  }

  if (allReleases.length === 0) {
    console.error('\nFailed to fetch from any collection ID. Tried:', idsToTry);
    console.error('The OCP Data Registry may have changed structure.');
    console.error('Visit https://data.open-contracting.org/en/publication/143 to find the new ID.');
    process.exit(1);
  }

  console.log(`\nFiltering to last 90 days, max ${MAX_RELEASES} tenders...`);
  const filtered = filterRecent(allReleases, 90);
  console.log(`Filtered: ${filtered.length} releases\n`);

  // Map to our schema
  const tenders = [];
  for (const r of filtered) {
    const mapped = mapRelease(r);
    if (mapped) tenders.push(mapped);
  }
  console.log(`Mapped: ${tenders.length} valid tenders\n`);

  if (tenders.length === 0) {
    console.log('No mappable tenders. Exiting cleanly.');
    process.exit(0);
  }

  // Push in batches of 100
  const BATCH_SIZE = 100;
  let totalNew = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  console.log(`Pushing to ${SITE_URL} in batches of ${BATCH_SIZE}...\n`);

  for (let i = 0; i < tenders.length; i += BATCH_SIZE) {
    const batch = tenders.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tenders.length / BATCH_SIZE);
    console.log(`Batch ${batchNum}/${totalBatches}: ${batch.length} tenders`);

    try {
      const { status, body } = await pushBatch(SITE_URL, CRON_SECRET, batch);
      console.log(`  HTTP ${status}`);
      if (status !== 200) {
        console.log(`  Response: ${body.slice(0, 500)}`);
        totalErrors++;
        continue;
      }
      try {
        const parsed = JSON.parse(body);
        totalNew += parsed.items_new ?? 0;
        totalUpdated += parsed.items_updated ?? 0;
        console.log(`  New: ${parsed.items_new ?? 0}  Updated: ${parsed.items_updated ?? 0}`);
      } catch {
        console.log(`  Response: ${body.slice(0, 200)}`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
      totalErrors++;
    }
  }

  console.log(`\n================================================`);
  console.log(`Summary: ${totalNew} new, ${totalUpdated} updated, ${totalErrors} errors`);

  if (totalErrors > 0 && totalNew === 0 && totalUpdated === 0) {
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
