#!/usr/bin/env node
/**
 * .github/scripts/fetch-etenders.js
 *
 * VERIFIED URLs (checked against live OCP Data Registry page 2026-05-19):
 *   https://data.open-contracting.org/en/publication/143/download?name=2026.jsonl.gz
 *   https://data.open-contracting.org/en/publication/143/download?name=2025.jsonl.gz
 *   ...etc
 *
 * Strategy:
 *   1. Try current year first (small file, freshest data)
 *   2. Fall back to previous year if current year is empty/missing
 *   3. Stream-decompress gzip and parse JSONL line by line
 *   4. Filter to releases from last 90 days
 *   5. Push to ingest endpoint in batches of 100
 */

import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';

const REGISTRY_BASE = 'https://data.open-contracting.org/en/publication/143/download';
const FETCH_TIMEOUT_MS = 120_000;
const MAX_RELEASES = 500;
const LOOKBACK_DAYS = 90;

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

// ─── Download and stream-parse a JSONL.gz file ──────────────────────────────

async function downloadAndParse(yearOrName) {
  const url = `${REGISTRY_BASE}?name=${yearOrName}.jsonl.gz`;
  console.log(`Trying: ${url}`);

  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Tenderpreneurs/1.0',
        Accept: 'application/gzip, application/octet-stream',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
  } catch (e) {
    console.log(`  fetch error: ${e.message}`);
    return null;
  }

  if (!res.ok) {
    console.log(`  HTTP ${res.status}`);
    return null;
  }

  const contentLength = res.headers.get('content-length');
  console.log(`  Status ${res.status} | Size: ${contentLength ? `${contentLength} bytes` : 'unknown'} | Content-Type: ${res.headers.get('content-type')}`);

  // Stream-decompress gzip
  const gunzip = createGunzip();
  Readable.fromWeb(res.body).pipe(gunzip);

  const releases = [];
  let buffer = '';
  let lineCount = 0;

  try {
    for await (const chunk of gunzip) {
      buffer += chunk.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep partial line for next iteration

      for (const line of lines) {
        if (!line.trim()) continue;
        lineCount++;
        try {
          const obj = JSON.parse(line);
          // OCDS files store as either {releases:[...]} per line, or {ocid:..., ...} per line (compiled releases)
          if (Array.isArray(obj.releases)) {
            releases.push(...obj.releases);
          } else if (obj.ocid) {
            releases.push(obj);
          }
        } catch (_) {
          // skip malformed lines silently
        }
      }
    }
    // process final partial line
    if (buffer.trim()) {
      try {
        const obj = JSON.parse(buffer);
        if (Array.isArray(obj.releases)) releases.push(...obj.releases);
        else if (obj.ocid) releases.push(obj);
      } catch (_) {}
    }
  } catch (e) {
    console.log(`  Stream parse error: ${e.message}`);
    return null;
  }

  console.log(`  Parsed ${lineCount} lines → ${releases.length} releases`);
  return releases;
}

// ─── Filter to last N days, dedupe by ocid, sort by recency ─────────────────

function filterRecent(releases, maxDaysOld = LOOKBACK_DAYS) {
  const cutoffMs = Date.now() - maxDaysOld * 86_400_000;
  const seen = new Map();

  for (const r of releases) {
    if (!r.ocid) continue;
    const date = r.date
      ?? r.tender?.tenderPeriod?.endDate
      ?? r.tender?.tenderPeriod?.startDate
      ?? null;
    if (!date) continue;
    const ts = new Date(date).getTime();
    if (isNaN(ts) || ts < cutoffMs) continue;
    const existing = seen.get(r.ocid);
    if (!existing || ts > existing._ts) {
      r._ts = ts;
      seen.set(r.ocid, r);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b._ts - a._ts)
    .slice(0, MAX_RELEASES);
}

// ─── Map OCDS release to our schema ─────────────────────────────────────────

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
    contactName: t.contactPerson?.name ?? null,
    contactEmail: t.contactPerson?.email ?? null,
    contactPhone: t.contactPerson?.telephoneNumber ?? null,
  };
}

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

  console.log('eTenders ingestion via OCP Data Registry');
  console.log('==========================================\n');

  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  // Try current year first, then fall back to previous year
  let allReleases = null;
  let sourceLabel = null;

  for (const yr of [String(currentYear), String(previousYear)]) {
    const releases = await downloadAndParse(yr);
    if (releases && releases.length > 0) {
      allReleases = releases;
      sourceLabel = yr;
      break;
    }
    console.log('');
  }

  // Last resort: try the "full" archive (all years)
  if (!allReleases || allReleases.length === 0) {
    console.log('\nFalling back to full archive...');
    allReleases = await downloadAndParse('full');
    sourceLabel = 'full';
  }

  if (!allReleases || allReleases.length === 0) {
    console.error('\nCould not fetch from any registry URL. Network or registry down?');
    process.exit(1);
  }

  console.log(`\n✓ Total raw releases: ${allReleases.length} (from ${sourceLabel})`);
  console.log(`\nFiltering to last ${LOOKBACK_DAYS} days, max ${MAX_RELEASES}...`);
  const filtered = filterRecent(allReleases);
  console.log(`Filtered: ${filtered.length} releases\n`);

  if (filtered.length === 0) {
    console.log('No releases match recency window. Exiting cleanly.');
    process.exit(0);
  }

  const tenders = [];
  for (const r of filtered) {
    const mapped = mapRelease(r);
    if (mapped) tenders.push(mapped);
  }
  console.log(`Mapped: ${tenders.length} valid tenders\n`);

  if (tenders.length === 0) {
    console.log('No mappable tenders. Exiting.');
    process.exit(0);
  }

  // Push in batches
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

  console.log(`\n==========================================`);
  console.log(`Done: ${totalNew} new, ${totalUpdated} updated, ${totalErrors} errors`);

  if (totalErrors > 0 && totalNew === 0 && totalUpdated === 0) {
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });