#!/usr/bin/env node
/**
 * Official National Treasury OCDS API — runs on GitHub Actions, not the Worker.
 * Worker fetch of this API 500s (CPU/memory). Same write path as the dump script.
 */

const OCDS_BASE = 'https://ocds-api.etenders.gov.za/api/OCDSReleases';
const PAGE_SIZE = 20;
const MAX_PAGES = 15;
const LOOKBACK_DAYS = 30;

const PROVINCE_MAP = {
  'Eastern Cape': 'eastern-cape', 'Free State': 'free-state',
  Gauteng: 'gauteng', 'KwaZulu-Natal': 'kwazulu-natal',
  Limpopo: 'limpopo', Mpumalanga: 'mpumalanga',
  'North West': 'north-west', 'Northern Cape': 'northern-cape',
  'Western Cape': 'western-cape', National: 'national',
};

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function mapSector(category = '') {
  const lower = String(category).toLowerCase();
  if (/construct|works|infrastructure/.test(lower)) return 'construction';
  if (/ict|information|technology|software/.test(lower)) return 'ict';
  if (/health|medical/.test(lower)) return 'health';
  if (/education|training/.test(lower)) return 'education';
  if (/transport|logistics/.test(lower)) return 'transport';
  if (/agricultur|farm/.test(lower)) return 'agriculture';
  if (/energy|electric/.test(lower)) return 'energy';
  if (/security|guard/.test(lower)) return 'security';
  return 'consulting';
}

function isClosedStatus(status) {
  const s = String(status ?? '').toLowerCase();
  return ['cancelled', 'canceled', 'unsuccessful', 'complete', 'completed', 'withdrawn'].includes(s);
}

function mapRelease(release) {
  const t = release.tender;
  if (!t?.title) return null;
  if (isClosedStatus(t.status)) return null;
  return {
    externalId: release.ocid,
    title: String(t.title).slice(0, 300),
    description: String(t.description ?? '').slice(0, 500),
    buyer: t.procuringEntity?.name ?? release.buyer?.name ?? '',
    province: PROVINCE_MAP[t.province] ?? 'national',
    sector: mapSector(t.category ?? t.mainProcurementCategory ?? ''),
    status: 'active',
    closingDate: t.tenderPeriod?.endDate?.split('T')[0] ?? null,
    openingDate: t.tenderPeriod?.startDate?.split('T')[0] ?? release.date?.split('T')[0] ?? null,
    value: typeof t.value?.amount === 'number' ? t.value.amount : null,
    currency: t.value?.currency ?? 'ZAR',
    documentUrls: (t.documents ?? []).map((d) => d.url).filter(Boolean).slice(0, 10),
    sourceUrl: `https://www.etenders.gov.za/home/TenderDetails?tenderID=${t.id ?? ''}`,
    briefingDate: t.briefingSession?.isSession ? (t.briefingSession.date?.split('T')[0] ?? null) : null,
    briefingCompulsory: t.briefingSession?.compulsory ?? false,
    contactName: t.contactPerson?.name ?? null,
    contactEmail: t.contactPerson?.email ?? null,
    contactPhone: t.contactPerson?.telephoneNumber ?? null,
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
        },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`OCDS HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      console.log(`  retry ${attempt}/3: ${err.cause?.code || err.message}`);
      await sleep(2000 * attempt);
    }
  }
  throw lastErr;
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
  const SITE_URL = (process.env.SITE_URL || 'https://tenderpreneurs.co.za').replace(/\/$/, '');
  if (!CRON_SECRET) {
    console.error('CRON_SECRET not set');
    process.exit(1);
  }

  const dateFrom = isoDate(new Date(Date.now() - LOOKBACK_DAYS * 86400000));
  const dateTo = isoDate(new Date());
  console.log(`Official OCDS ${dateFrom} → ${dateTo}`);

  const releases = [];
  let nextUrl =
    `${OCDS_BASE}?PageNumber=1&PageSize=${PAGE_SIZE}` +
    `&dateFrom=${dateFrom}&dateTo=${dateTo}`;

  for (let page = 1; page <= MAX_PAGES && nextUrl; page++) {
    console.log(`Page ${page}: ${nextUrl}`);
    try {
      const data = await fetchPage(nextUrl);
      const chunk = data.releases ?? [];
      console.log(`  ${chunk.length} releases`);
      if (!chunk.length) break;
      releases.push(...chunk);
      const nxt = data.links?.next ?? null;
      nextUrl = nxt && nxt !== nextUrl ? nxt : null;
    } catch (err) {
      console.log(`Page ${page} failed (${err.cause?.code || err.message}) — keeping ${releases.length} already fetched`);
      break;
    }
  }

  const tenders = [];
  const seen = new Set();
  for (const r of releases) {
    const mapped = mapRelease(r);
    if (!mapped || seen.has(mapped.externalId)) continue;
    seen.add(mapped.externalId);
    tenders.push(mapped);
  }
  console.log(`Mapped ${tenders.length} open tenders from ${releases.length} releases`);

  if (!tenders.length) {
    console.log('Nothing to push');
    return;
  }

  let totalNew = 0;
  let totalUpdated = 0;
  let errors = 0;
  const BATCH = 100;
  for (let i = 0; i < tenders.length; i += BATCH) {
    const batch = tenders.slice(i, i + BATCH);
    const { status, body } = await pushBatch(SITE_URL, CRON_SECRET, batch);
    console.log(`Batch ${Math.floor(i / BATCH) + 1} HTTP ${status} ${body.slice(0, 200)}`);
    if (status !== 200) {
      errors += 1;
      continue;
    }
    try {
      const parsed = JSON.parse(body);
      totalNew += parsed.items_new ?? 0;
      totalUpdated += parsed.items_updated ?? 0;
    } catch (_) {}
  }
  console.log(`Done official OCDS: ${totalNew} new, ${totalUpdated} updated, ${errors} errors`);
  if (errors && !totalNew && !totalUpdated && !tenders.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
