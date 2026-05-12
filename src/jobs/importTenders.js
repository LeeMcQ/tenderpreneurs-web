const axios = require('axios');
const { Pool } = require('pg');
const cron = require('node-cron');

// ── Database connection pool ────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // OR configure individually:
  // user: process.env.PGUSER,
  // host: process.env.PGHOST,
  // database: process.env.PGDATABASE,
  // password: process.env.PGPASSWORD,
  // port: process.env.PGPORT,
});

// ── Configuration ───────────────────────────────────────────────────────────
const OCDS_BASE_URL =
  'https://etenders.gov.za/OpenData/OCDS'; // Adjust if the real endpoint differs
const RETRIES = 3;
const BATCH_SIZE = 50; // for future performance tuning (currently one‑by‑one)

// ── Fetch with retry ⨯ exponential backoff ─────────────────────────────────
async function fetchWithRetry(url, retries = RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, { timeout: 30000 });
      return response.data;
    } catch (error) {
      if (attempt === retries) throw error;
      console.warn(`Attempt ${attempt} failed – retrying in ${attempt * 2}s`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
}

// ── Paginated fetch of all releases (OCDS 1.1+ uses links.next) ────────────
async function fetchAllReleases(baseUrl) {
  let url = baseUrl;
  const allReleases = [];

  while (url) {
    const data = await fetchWithRetry(url);
    // Standard OCDS package or plain array
    const pageReleases = data.releases || (Array.isArray(data) ? data : []);
    allReleases.push(...pageReleases);

    // Follow next page if present
    url = data.links?.next || null;
  }

  return allReleases;
}

// ── Normalise one OCDS release to the target tender schema ─────────────────
function normalizeTender(release) {
  const { id, tender, buyer, planning } = release;

  // 1. title
  const title = tender?.title ?? 'Untitled';

  // 2. entity (buyer)
  const entity =
    buyer?.name ??
    planning?.budget?.sourceParty?.name ??
    'Unknown';

  // 3. province – try buyer address, then first item delivery address
  let province = null;
  if (buyer?.address?.region) {
    province = buyer.address.region;
  } else if (tender?.items?.[0]?.deliveryAddress?.region) {
    province = tender.items[0].deliveryAddress.region;
  }

  // 4. sector – main procurement category or classification description
  let sector = tender?.mainProcurementCategory ?? null;
  if (!sector && tender?.items?.[0]?.classification?.description) {
    sector = tender.items[0].classification.description;
  }

  // 5. value – concatenate amount and currency
  let value = null;
  if (tender?.value?.amount !== undefined) {
    const amount = tender.value.amount;
    const currency = tender.value.currency ?? 'ZAR';
    value = `${amount} ${currency}`;
  }

  // 6. closing date
  let closing_date = null;
  if (tender?.tenderPeriod?.endDate) {
    closing_date = new Date(tender.tenderPeriod.endDate).toISOString();
  }

  // 7. status
  const status = tender?.status ?? 'unknown';

  // 8. source URL – construct from releaseId (adjust template as needed)
  const source_url = id
    ? `https://etenders.gov.za/Home/TenderOpportunity?id=${id}`
    : null;

  return {
    id,                   // OCDS release id
    title,
    entity,
    province,
    sector,
    value,
    closing_date,
    status,
    source_url,
    created_at: new Date().toISOString(),
  };
}

// ── Bulk upsert into PostgreSQL ────────────────────────────────────────────
async function upsertTenders(tenders) {
  const client = await pool.connect();
  let added = 0;
  let skipped = 0;
  let failed = 0;

  try {
    await client.query('BEGIN');

    for (const t of tenders) {
      try {
        const res = await client.query(
          `INSERT INTO tenders (id, title, entity, province, sector, value,
                                 closing_date, status, source_url, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (source_url) DO NOTHING
           RETURNING id`,
          [
            t.id,
            t.title,
            t.entity,
            t.province,
            t.sector,
            t.value,
            t.closing_date,
            t.status,
            t.source_url,
            t.created_at,
          ]
        );
        res.rowCount > 0 ? added++ : skipped++;
      } catch (err) {
        console.error(`Failed to insert tender ${t.id}:`, err.message);
        failed++;
      }
    }

    await client.query('COMMIT');
    console.log(`Import finished: +${added} added, −${skipped} skipped, ✗${failed} failed`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Transaction rolled back:', err);
    throw err;
  } finally {
    client.release();
  }

  return { added, skipped, failed };
}

// ── Main public function – exported for manual triggering ──────────────────
async function runImport() {
  try {
    console.log('[importTenders] Fetching releases…');
    const releases = await fetchAllReleases(OCDS_BASE_URL);
    console.log(`[importTenders] Received ${releases.length} releases`);

    // Normalise and keep only records with an id and a source_url
    const tenders = releases
      .map(normalizeTender)
      .filter((t) => t.id && t.source_url);

    const result = await upsertTenders(tenders);
    return result;
  } catch (error) {
    console.error('[importTenders] Import failed:', error);
    throw error;
  }
}

// ── Schedule with cron (every 4 hours) when run directly ───────────────────
if (require.main === module) {
  cron.schedule(
    '0 */4 * * *',
    () => {
      console.log('[importTenders] Running scheduled import…');
      runImport().catch((err) =>
        console.error('[importTenders] Scheduled import error:', err)
      );
    },
    {
      timezone: 'Africa/Johannesburg',
    }
  );
  console.log('[importTenders] Scheduler started (every 4 hours).');
}

module.exports = { runImport };