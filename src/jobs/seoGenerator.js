// src/jobs/seoGenerator.js
const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

// --------------------------------------------------------------------
//  Configuration – adjust DB connection to your environment
// --------------------------------------------------------------------
const DB_CONFIG = {
  connectionString: process.env.DATABASE_URL,           // or use individual env vars
  // host, port, database, user, password
};

// Paths
const LAST_GEN_FILE = path.join(__dirname, 'lastGenerated.json');
const CONTENT_DIR = path.join(process.cwd(), 'src', 'content');
const TENDERS_DIR = path.join(CONTENT_DIR, 'tenders');
const ENTITIES_DIR = path.join(CONTENT_DIR, 'entities');

// --------------------------------------------------------------------
//  Helpers
// --------------------------------------------------------------------
const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');

const formatCurrency = (value) => {
  if (value == null) return 'Not specified';
  return `R ${Number(value).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
};

const truncate = (text, maxLen = 160) => {
  return text.length <= maxLen ? text : text.slice(0, maxLen).replace(/\s+\S*$/, '');
};

const nowDateStr = () => new Date().toISOString().split('T')[0];

// --------------------------------------------------------------------
//  Content generators
// --------------------------------------------------------------------
function createDetailPage(tender, relatedTenders) {
  const {
    id,
    title,
    entity,
    province,
    tender_value,
    closing_date,
    description,
  } = tender;

  const pubDate = closing_date ? new Date(closing_date).toISOString().split('T')[0] : nowDateStr();
  const meta = truncate(
    `${title} — ${entity} tender in ${province}. Find details, how to apply, B-BBEE requirements, and related tenders. Closing date: ${pubDate}.`,
    160
  );

  const intro = `The ${entity} has published a tender for **${title}** in ${province}. This procurement opportunity has an estimated value of ${formatCurrency(tender_value)} and closes on ${pubDate}. Interested suppliers and service providers are advised to review the full tender requirements and submit their proposals before the deadline.`;

  const relatedList = relatedTenders.length
    ? relatedTenders
        .map((rt) => `- [${rt.title}](/tenders/${rt.id})`)
        .join('\n')
    : '_No related tenders found._';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'GovernmentService',
    name: title,
    description: meta,
    provider: {
      '@type': 'GovernmentOrganization',
      name: entity,
    },
    areaServed: {
      '@type': 'State',
      name: province,
    },
    serviceType: 'Procurement / Tender',
    availableChannel: {
      '@type': 'ServiceChannel',
      serviceUrl: `https://tenderpreneurs.co.za/tenders/${id}`,
    },
  };

  const content = `---
title: "${title} — ${entity} Tender ${new Date().getFullYear()}"
description: "${meta}"
pubDate: "${pubDate}"
---

# ${title}

${intro}

## Tender Details

| Field | Details |
|-------|---------|
| Entity | ${entity} |
| Province | ${province} |
| Estimated Value | ${formatCurrency(tender_value)} |
| Closing Date | ${pubDate} |

## How to apply for this tender

To apply, visit the official **${entity}** e‑tender portal or supply chain management website. Ensure you meet all submission requirements and submit your proposal before the closing date. For further assistance, contact the department directly.

## B‑BBEE requirements

This tender may include specific **Broad‑Based Black Economic Empowerment (B‑BBEE)** criteria. Applicants are encouraged to review the tender document for preferential procurement points, subcontracting requirements, and any applicable B‑BBEE level certification needs.

## Related tenders in ${province}

${relatedList}

<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
</script>`;

  return content;
}

function createEntityPage(entity, allTenders, stats) {
  const { name, description } = entity;
  const slug = entity.slug || slugify(name);
  const entityDesc =
    description ||
    `Find all active and historical tenders published by **${name}**, a government organisation in South Africa. Tenderpreneurs aggregates the latest procurement opportunities, bids, and contract awards from ${name}. Access detailed tender notices, closing dates, and requirements.`;

  const tenderList = allTenders
    .map((t) => {
      const status = new Date(t.closing_date) > new Date() ? 'Open' : 'Closed';
      return `- [${t.title}](/tenders/${t.id}) — ${status} (closing ${new Date(t.closing_date).toISOString().split('T')[0]})`;
    })
    .join('\n');

  const content = `---
title: "${name} Tenders & Procurement Opportunities"
description: "Browse all tenders from ${name}. Find latest bids, tender documents, and procurement statistics on Tenderpreneurs.co.za."
---

# ${name} Tenders

${entityDesc}

## Tender Statistics

- Total tenders: ${stats.count}
- Average tender value: ${formatCurrency(stats.avgValue)}
- Most common sector: ${stats.topSector || 'Not available'}

## List of Tenders

${tenderList || '_No tenders found._'}
`;

  return { slug, content };
}

function createValueRangePage(range, tenders) {
  const ranges = {
    'under-1m': {
      title: 'Tenders Under R1 Million South Africa | Government Bids < R1,000,000',
      description:
        'Find South African government tenders with a value under R1 million. Browse active procurement opportunities below R1,000,000 on Tenderpreneurs.co.za.',
      intro:
        'Explore **tenders under R1 million South Africa** – ideal for SMMEs and emerging businesses. The following opportunities are currently open for bids with an estimated value below R1,000,000.',
      keyword: 'tenders under R1 million South Africa',
    },
    '1m-10m': {
      title: 'Tenders Between R1 Million and R10 Million | Medium-Value Government Contracts',
      description:
        'Browse South African government tenders valued between R1 million and R10 million. Find medium‑value procurement opportunities on Tenderpreneurs.co.za.',
      intro:
        'This collection features active **tenders between R1 million and R10 million** – medium‑sized contracts suitable for established businesses and growing enterprises.',
      keyword: 'tenders between R1 million and R10 million',
    },
    'over-10m': {
      title: 'Tenders Over R10 Million | Large Government Procurement Opportunities',
      description:
        'Access South African government tenders exceeding R10 million. Find high‑value procurement contracts on Tenderpreneurs.co.za.',
      intro:
        'Discover **tenders over R10 million** – large‑scale government projects requiring significant capacity and experience. Stay informed on the biggest procurement opportunities.',
      keyword: 'tenders over R10 million South Africa',
    },
  };

  const config = ranges[range];
  const list = tenders
    .map((t) => `- [${t.title}](/tenders/${t.id}) — ${formatCurrency(t.tender_value)} (closes ${new Date(t.closing_date).toISOString().split('T')[0]})`)
    .join('\n');

  const content = `---
title: "${config.title}"
description: "${config.description}"
---

# ${config.title.split('|')[0].trim()}

${config.intro}

## Active ${config.keyword}

${list || '_No active tenders in this range._'}
`;

  return content;
}

// --------------------------------------------------------------------
//  Tracking last run
// --------------------------------------------------------------------
async function loadLastRun() {
  try {
    const data = await fs.readFile(LAST_GEN_FILE, 'utf-8');
    return JSON.parse(data).lastRun || '1970-01-01T00:00:00.000Z';
  } catch {
    return '1970-01-01T00:00:00.000Z'; // first run, generate all
  }
}

async function saveLastRun(timestamp) {
  await fs.mkdir(path.dirname(LAST_GEN_FILE), { recursive: true });
  await fs.writeFile(LAST_GEN_FILE, JSON.stringify({ lastRun: timestamp }));
}

// --------------------------------------------------------------------
//  Main generator function
// --------------------------------------------------------------------
async function generateSEO(db, options = {}) {
  const pool = db || new Pool(DB_CONFIG);
  try {
    const tracker = {
      details: { created: 0, failed: 0, skipped: 0, total: 0 },
      entities: { created: 0, failed: 0, skipped: 0, total: 0 },
      valuePages: { created: 0, failed: 0, skipped: 0 },
    };

    // 1. Determine which tenders were updated/new
    const lastRun = await loadLastRun();
    let allUpdated;

    if (options.tenderIds && options.tenderIds.length > 0) {
      const { rows } = await pool.query('SELECT * FROM tenders WHERE id = ANY($1)', [options.tenderIds]);
      allUpdated = rows;
    } else {
      const { rows } = await pool.query('SELECT * FROM tenders WHERE updated_at > $1', [lastRun]);
      allUpdated = rows;
    }

    const now = new Date();
    const openUpdated = allUpdated.filter((t) => new Date(t.closing_date) > now);

    // Count total open tenders for logging
    const { rows: [{ count: openTotal }] } = await pool.query(
      "SELECT COUNT(*) FROM tenders WHERE closing_date > NOW()"
    );
    tracker.details.total = Number(openTotal);

    // 2. Generate per-tender detail pages (only open & updated)
    await fs.mkdir(TENDERS_DIR, { recursive: true });

    for (const tender of openUpdated) {
      try {
        // Related tenders: 5 other open tenders in same province
        const { rows: related } = await pool.query(
          `SELECT id, title FROM tenders
           WHERE province = $1 AND id != $2 AND closing_date > NOW()
           ORDER BY closing_date ASC LIMIT 5`,
          [tender.province, tender.id]
        );
        const content = createDetailPage(tender, related);
        await fs.writeFile(path.join(TENDERS_DIR, `${tender.id}.mdx`), content, 'utf-8');
        tracker.details.created++;
      } catch (err) {
        console.error(`Failed to generate detail page for tender ${tender.id}:`, err);
        tracker.details.failed++;
      }
    }
    tracker.details.skipped = tracker.details.total - tracker.details.created - tracker.details.failed;

    // 3. Entity pages (distinct entities affected by any updated tender)
    const affectedEntities = [...new Set(allUpdated.map((t) => t.entity))];
    const { rows: [{ count: totalEntities }] } = await pool.query('SELECT COUNT(DISTINCT entity) FROM tenders');
    tracker.entities.total = Number(totalEntities);

    for (const entityName of affectedEntities) {
      try {
        // Get entity description & slug if entities table exists, otherwise fallback
        let entityInfo = { name: entityName, slug: slugify(entityName), description: null };
        try {
          const { rows: [entityRow] } = await pool.query(
            'SELECT slug, description FROM entities WHERE name = $1',
            [entityName]
          );
          if (entityRow) {
            entityInfo = { ...entityInfo, ...entityRow };
          }
        } catch {
          // entities table probably doesn’t exist – ignore
        }

        // All tenders for this entity (open and closed)
        const { rows: allTenders } = await pool.query(
          'SELECT * FROM tenders WHERE entity = $1 ORDER BY closing_date DESC',
          [entityName]
        );

        // Stats
        const { rows: [stats] } = await pool.query(
          `SELECT COUNT(*)::int AS count,
                  AVG(tender_value)::numeric(12,2) AS avg_value
           FROM tenders WHERE entity = $1`,
          [entityName]
        );
        const { rows: [sectorRow] } = await pool.query(
          `SELECT sector, COUNT(*) as cnt
           FROM tenders WHERE entity = $1 AND sector IS NOT NULL
           GROUP BY sector ORDER BY cnt DESC LIMIT 1`,
          [entityName]
        );
        const topSector = sectorRow ? sectorRow.sector : null;

        const page = createEntityPage(entityInfo, allTenders, {
          count: stats.count,
          avgValue: stats.avg_value,
          topSector,
        });

        await fs.writeFile(
          path.join(ENTITIES_DIR, `${page.slug}.mdx`),
          page.content,
          'utf-8'
        );
        tracker.entities.created++;
      } catch (err) {
        console.error(`Failed to generate entity page for ${entityName}:`, err);
        tracker.entities.failed++;
      }
    }
    tracker.entities.skipped = tracker.entities.total - tracker.entities.created - tracker.entities.failed;

    // 4. Value-range pages (regenerate if any tender was updated)
    if (allUpdated.length > 0) {
      await fs.mkdir(TENDERS_DIR, { recursive: true }); // value pages go here too

      const { rows: openWithValue } = await pool.query(
        `SELECT id, title, tender_value, closing_date
         FROM tenders
         WHERE closing_date > NOW() AND tender_value IS NOT NULL
         ORDER BY tender_value ASC`
      );

      const under1m = openWithValue.filter((t) => Number(t.tender_value) < 1_000_000);
      const between1and10 = openWithValue.filter(
        (t) => Number(t.tender_value) >= 1_000_000 && Number(t.tender_value) <= 10_000_000
      );
      const over10m = openWithValue.filter((t) => Number(t.tender_value) > 10_000_000);

      const ranges = [
        { file: 'under-1m.mdx', data: under1m, type: 'under-1m' },
        { file: '1m-10m.mdx', data: between1and10, type: '1m-10m' },
        { file: 'over-10m.mdx', data: over10m, type: 'over-10m' },
      ];

      for (const range of ranges) {
        try {
          const content = createValueRangePage(range.type, range.data);
          await fs.writeFile(path.join(TENDERS_DIR, range.file), content, 'utf-8');
          tracker.valuePages.created++;
        } catch (err) {
          console.error(`Failed to generate value page ${range.file}:`, err);
          tracker.valuePages.failed++;
        }
      }
    } else {
      tracker.valuePages.skipped = 3; // no changes, skip all
    }

    // 5. Update last-generated timestamp
    await saveLastRun(new Date().toISOString());

    // 6. Log summary
    const totalCreated =
      tracker.details.created + tracker.entities.created + tracker.valuePages.created;
    const totalSkipped =
      tracker.details.skipped + tracker.entities.skipped + tracker.valuePages.skipped;
    const totalFailed =
      tracker.details.failed + tracker.entities.failed + tracker.valuePages.failed;

    console.log(
      `SEO Generation: ${totalCreated} pages created (${tracker.details.created} details, ${tracker.entities.created} entities, ${tracker.valuePages.created} value pages), ${totalSkipped} skipped, ${totalFailed} failed.`
    );
  } finally {
    if (!db) await pool.end(); // only close if we created our own pool
  }
}

// --------------------------------------------------------------------
//  CLI entry point (npm run generate-seo)
// --------------------------------------------------------------------
if (require.main === module) {
  generateSEO().catch((err) => {
    console.error('SEO generation failed:', err);
    process.exit(1);
  });
} else {
  module.exports = generateSEO;
}