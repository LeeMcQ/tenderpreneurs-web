#!/usr/bin/env node
/**
 * .github/scripts/fetch-etenders.js
 *
 * Runs in GitHub Actions (no time limit).
 * 1. Fetches tenders from the OCDS API (takes as long as needed)
 * 2. POSTs the pre-fetched data to /api/cron/ingest (Worker just writes D1)
 *
 * Usage:
 *   CRON_SECRET=xxx SITE_URL=https://tenderpreneurs.pages.dev node fetch-etenders.js
 */

const OCDS_BASE = 'https://ocds-api.etenders.gov.za';
const PAGE_SIZE = 20;
const LOOKBACK_DAYS = 30;
const MAX_PAGES = 15;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024; // 4MB per page

const PROVINCE_MAP = {
  'Eastern Cape': 'eastern-cape', 'Free State': 'free-state',
  'Gauteng': 'gauteng', 'KwaZulu-Natal': 'kwazulu-natal',
  'Limpopo': 'limpopo', 'Mpumalanga': 'mpumalanga',
  'North West': 'north-west', 'Northern Cape': 'northern-cape',
  'Western Cape': 'western-cape', 'National': 'national',
};

const SECTOR_KEYWORDS = {
  construction: ['construction','works','infrastructure','building','civil'],
  ict: ['ict','information','technology','software','hardware','network','computer'],
  health: ['health','medical','hospital','pharmaceutical','clinical'],
  education: ['education','training','school','university','learning'],
  transport: ['transport','logistics','fleet','vehicle','road'],
  agriculture: ['agriculture','farming','food','livestock','crop'],
  energy: ['energy','electricity','solar','power','fuel'],
  security: ['security','guard','surveillance','protection'],
  consulting: ['consulting','advisory','management','research','audit'],
  cleaning: ['cleaning','hygiene','waste','sanitation'],
  catering: ['catering','catering','food service','hospitality'],
  legal: ['legal','law','attorney','compliance'],
};

function mapSector(category = '') {
  const lower = category.toLowerCase();
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return sector;
  }
  return 'consulting';
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Tenderpreneurs/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) { console.error(`HTTP ${res.status} from ${url}`); return null; }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    console.error(`Non-JSON response from ${url}`);
    await res.body?.cancel();
    return null;
  }
  // Size cap
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      console.error(`Response too large (>${MAX_RESPONSE_BYTES} bytes), skipping page`);
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { combined.set(c, offset); offset += c.byteLength; }
  return JSON.parse(new TextDecoder().decode(combined));
}

function mapRelease(release) {
  const t = release.tender;
  if (!t?.title) return null;
  return {
    externalId: release.ocid,
    title: t.title,
    description: t.description ?? '',
    buyer: t.procuringEntity?.name ?? release.buyer?.name ?? '',
    province: PROVINCE_MAP[t.province] ?? 'national',
    sector: mapSector(t.category ?? t.mainProcurementCategory ?? ''),
    status: 'active',
    closingDate: t.tenderPeriod?.endDate?.split('T')[0] ?? null,
    openingDate: t.tenderPeriod?.startDate?.split('T')[0] ?? null,
    value: t.value?.amount ?? null,
    currency: t.value?.currency ?? 'ZAR',
    documentUrls: (t.documents ?? []).map(d => d.url).filter(Boolean),
    sourceUrl: `https://www.etenders.gov.za/home/TenderDetails?tenderID=${t.id ?? ''}`,
    briefingDate: t.briefingSession?.isSession ? (t.briefingSession.date?.split('T')[0] ?? null) : null,
    briefingCompulsory: t.briefingSession?.compulsory ?? false,
  };
}

async function main() {
  const CRON_SECRET = process.env.CRON_SECRET;
  const SITE_URL = process.env.SITE_URL || 'https://tenderpreneurs.pages.dev';

  if (!CRON_SECRET) { console.error('CRON_SECRET not set'); process.exit(1); }

  const dateFrom = daysAgo(LOOKBACK_DAYS);
  const dateTo = new Date().toISOString().split('T')[0];
  console.log(`Fetching OCDS releases ${dateFrom} → ${dateTo}`);

  const tenders = [];
  let nextUrl = `${OCDS_BASE}/api/OCDSReleases?PageNumber=1&PageSize=${PAGE_SIZE}&dateFrom=${dateFrom}&dateTo=${dateTo}`;
  let page = 0;

  while (nextUrl && page < MAX_PAGES) {
    page++;
    console.log(`Page ${page}: ${nextUrl}`);
    const data = await fetchPage(nextUrl);
    if (!data) break;

    const releases = data.releases ?? [];
    console.log(`  ${releases.length} releases`);
    if (releases.length === 0) break;

    for (const r of releases) {
      const mapped = mapRelease(r);
      if (mapped) tenders.push(mapped);
    }

    const next = data.links?.next;
    nextUrl = (next && next !== nextUrl) ? next : null;

    // Pause between pages to be polite to the API
    if (nextUrl) await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nFetched ${tenders.length} tenders. Pushing to ingest endpoint...`);

  const ingestUrl = `${SITE_URL}/api/cron/ingest`;
  const res = await fetch(ingestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': CRON_SECRET,
    },
    body: JSON.stringify({ source: 'etenders', tenders }),
    signal: AbortSignal.timeout(60000),
  });

  const body = await res.text();
  console.log(`Ingest response: HTTP ${res.status}`);
  console.log(body);

  if (!res.ok) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
