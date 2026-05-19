#!/usr/bin/env node
/**
 * .github/scripts/fetch-etenders.js
 *
 * Expert architecture: ignore the slow live OCDS API.
 * Download the monthly OCDS bulk file from data.etenders.gov.za instead.
 *
 * These files are:
 *  - Pre-generated nightly by Treasury
 *  - Served from CDN (fast, reliable)
 *  - Standard OCDS JSON format (releases array)
 *  - Same data as the live API, just packaged as a static file
 *
 * This is how ProTenders, Skyner, and EasyTenders all do it.
 *
 * File URL pattern (confirmed from data.etenders.gov.za/Home/ReleasesFiles):
 *   https://data.etenders.gov.za/Home/DownloadFile/?fileName=DDMMYYYY.json
 *   https://data.etenders.gov.za/Home/DownloadFile/?fileName=MMYYYY.xlsx
 *
 * Strategy:
 *  - Try yesterday's daily JSON file (most fresh)
 *  - If it doesn't exist (weekend/holiday), try previous 7 days
 *  - Parse the OCDS releases and push to ingest endpoint
 */

const DATA_BASE = 'https://data.etenders.gov.za/Home/DownloadFile';
const FETCH_TIMEOUT_MS = 60_000;      // 60s for CDN download (should be fast)
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024; // 50MB cap (monthly files are big)
const DAYS_TO_TRY = 7;

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
  const lower = category.toLowerCase();
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return sector;
  }
  return 'consulting';
}

function pad(n) { return String(n).padStart(2, '0'); }

/** Build a list of YYYYMMDD strings for the last N days, newest first */
function recentDates(n) {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push({
      ddmmyyyy: `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}`,
      iso: d.toISOString().split('T')[0],
    });
  }
  return dates;
}

async function tryFetchFile(fileName) {
  const url = `${DATA_BASE}/?fileName=${fileName}`;
  console.log(`  Trying: ${url}`);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json, application/octet-stream, */*',
        'User-Agent': 'Tenderpreneurs/1.0 (data sync)',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });

    if (!res.ok) {
      console.log(`  HTTP ${res.status} — file not available`);
      await res.body?.cancel();
      return null;
    }

    // Size-capped read
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        console.log(`  File too large (>${MAX_RESPONSE_BYTES / 1024 / 1024}MB)`);
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }

    const combined = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { combined.set(c, offset); offset += c.byteLength; }

    const text = new TextDecoder().decode(combined);
    console.log(`  Downloaded ${(total / 1024).toFixed(0)}KB`);

    // OCDS releases come either as { releases: [...] } or as JSONL
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed?.releases)) return parsed.releases;
      if (Array.isArray(parsed)) return parsed;
      // Some files wrap in { packages: [{ releases: [...] }] }
      if (Array.isArray(parsed?.packages)) {
        return parsed.packages.flatMap(p => p.releases ?? []);
      }
      console.log('  Unknown JSON shape');
      return null;
    } catch {
      // Try JSONL — each line is a release or release package
      const lines = text.split('\n').filter(l => l.trim());
      const releases = [];
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.releases) releases.push(...obj.releases);
          else if (obj.ocid) releases.push(obj);
        } catch {}
      }
      if (releases.length > 0) return releases;
      console.log('  Not parseable JSON or JSONL');
      return null;
    }

  } catch (err) {
    console.log(`  Error: ${err.message}`);
    return null;
  }
}

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

async function main() {
  const CRON_SECRET = process.env.CRON_SECRET;
  const SITE_URL = (process.env.SITE_URL || 'https://tenderpreneurs.pages.dev').replace(/\/$/, '');

  if (!CRON_SECRET) {
    console.error('CRON_SECRET not set');
    process.exit(1);
  }

  console.log('eTenders bulk file ingestion');
  console.log('============================\n');

  // Try the last N days of daily files, newest first
  const dates = recentDates(DAYS_TO_TRY);
  const allReleases = new Map(); // dedupe by ocid

  for (const { ddmmyyyy, iso } of dates) {
    console.log(`Date ${iso} (file: ${ddmmyyyy}):`);

    // Try .json then .xlsx isn't useful for parsing — stick to .json
    const candidates = [
      `${ddmmyyyy}.json`,
      `${ddmmyyyy}.jsonl`,
    ];

    let releases = null;
    for (const fileName of candidates) {
      releases = await tryFetchFile(fileName);
      if (releases) {
        console.log(`  ✓ Got ${releases.length} releases from ${fileName}`);
        break;
      }
    }

    if (releases) {
      for (const r of releases) {
        if (r.ocid) allReleases.set(r.ocid, r);
      }
    }
    console.log('');
  }

  console.log(`Total unique releases: ${allReleases.size}\n`);

  if (allReleases.size === 0) {
    console.log('No releases found in last 7 days of bulk files.');
    console.log('This is normal if Treasury hasn\'t published yet today.');
    console.log('Exiting cleanly — will try again on next cron tick.');
    process.exit(0);
  }

  // Map to our schema
  const tenders = [];
  for (const release of allReleases.values()) {
    const mapped = mapRelease(release);
    if (mapped) tenders.push(mapped);
  }

  console.log(`Mapped to ${tenders.length} valid tenders.`);

  if (tenders.length === 0) {
    console.log('No mappable tenders. Exiting.');
    process.exit(0);
  }

  // Push in batches of 100
  const BATCH_SIZE = 100;
  let totalNew = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  console.log(`\nPushing in batches of ${BATCH_SIZE}...\n`);

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
        const itemsNew = parsed.items_new ?? 0;
        const itemsUpdated = parsed.items_updated ?? 0;
        totalNew += itemsNew;
        totalUpdated += itemsUpdated;
        console.log(`  New: ${itemsNew}  Updated: ${itemsUpdated}`);
      } catch {
        console.log(`  Response: ${body.slice(0, 200)}`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
      totalErrors++;
    }
  }

  console.log(`\n============================`);
  console.log(`Summary: ${totalNew} new, ${totalUpdated} updated, ${totalErrors} batch errors`);

  if (totalErrors > 0 && totalNew === 0 && totalUpdated === 0) {
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
