# DeepSeek Brief — Bulk Tender Scraper Generation

You are generating web scrapers for **Tenderpreneurs**, a South African tender
aggregation website. Each scraper fetches tenders from one government or
parastatal source and POSTs them to an existing ingestion API.

You will be given a list of institutions, each with a name and a tender-page URL.
For **each** institution you must do TWO things in order:

1. **VIABILITY CHECK** — confirm the URL is a real, scrapable tender page.
2. **GENERATE THE SCRAPER** — only if step 1 passes, write a complete
`fetch-{slug}.js` file following the exact template in this brief.

Work through the list in bulk. Produce one section of output per institution.

\---

## PART A — How the system works (context you must respect)

The pipeline is already built and proven. You are only adding new scraper files.

```
Your scraper (Node.js, runs in GitHub Actions)
   │  fetch HTML → parse → map to canonical shape
   │  POST { source, tenders\[] } to the ingest API
   ▼
Ingest API (already exists — do NOT build this)
   │  authenticates, fingerprints, dedupes, writes to database
   ▼
Website displays the tenders
```

Key facts you must not violate:

* **The ingest API already dedupes.** Every tender is fingerprinted by
`sha256(externalId|title|buyer)`. You do NOT need to dedupe across sources.
Two scrapers grabbing the same tender is harmless — the API collapses it.
* **Each scraper is one self-contained file:** `.github/scripts/fetch-{slug}.js`
* **Scrapers import shared helpers** from `./lib/common.js` (provided below).
Do NOT reimplement province mapping, date parsing, HTTP fetching, etc.
* **Scrapers run in GitHub Actions**, Node 22, ES modules (`import`/`export`).
* **Never fetch from inside a server/Worker.** Scrapers are standalone scripts.

\---

## PART B — VIABILITY CHECK (do this FIRST for every URL)

Before writing any code, fetch the URL and answer these questions. If the page
**fails any of the hard checks**, do NOT generate a scraper — output a SKIP
record instead (format in Part E).

### Hard checks (failure = SKIP)

1. **Does the URL load?** (HTTP 200, not 404/403/500/timeout)

   * If 403/blocked: note it, mark as `NEEDS\_MANUAL` not SKIP.
2. **Is it actually a tender page?** The page must contain tender-like content:
tender/bid/RFQ/RFP reference numbers, closing dates, tender descriptions.

   * A generic "Supplier Portal" login page with no visible tenders = SKIP.
   * A page that only explains *how* to tender with no listings = SKIP.
   * If not the actual tender page find the tender page on the website if you cant find it = SKIP
3. **Are there tenders available now (or recently)?** If the page explicitly
says "no current tenders" AND shows no historical/closed tenders either,
mark as `EMPTY\_BUT\_VALID` (build the scraper anyway — tenders may appear
later — but flag it so the owner knows it returns nothing today).

### Soft checks (failure = still build, but FLAG in code comments)

4. **Server-rendered or JavaScript-rendered?**

   * View the page source. If tender data is in the raw HTML → server-rendered,
normal scraper.
   * If the raw HTML is an empty shell (`<div id="app">`) and tenders only
appear after JS runs → mark `JS\_RENDERED`. Still write the scraper, but
add a header comment: `// ⚠️ JS-RENDERED — may need Playwright, test first`.
5. **Is this source likely ALREADY COVERED?** Compare the institution against
the "already-covered sources" list in Part C. If it matches or is a
provincial body that just republishes the national eTenders feed, add a
header comment: `// ⚠️ POSSIBLE OVERLAP with {source} — confirm before enabling`
and set `active: 0` in the suggested SQL (Part F) so it doesn't run until
the owner confirms.
6. **Is it a downloadable index** (PDF bulletin, Excel, RSS, JSON API)?
Prefer these over HTML scraping. If you find a JSON API in the network
calls, note it — it's the best possible source.

\---

## PART C — Already-covered sources (check for overlap)

These are ALREADY being scraped or fed by the existing pipeline. If an
institution on the input list matches one of these, FLAG it as a possible
overlap (see soft check 5):

|Already covered|How|
|-|-|
|National departments \& most provincial tenders|eTenders OCDS feed|
|eTenders Publication Portal (etenders.gov.za)|OCDS feed|
|National Treasury Tender Bulletin|existing scraper|
|City of Cape Town|existing scraper (`city-cape-town`)|
|Gauteng / Western Cape / KZN / EC / FS / Limpopo / Mpumalanga / Northern Cape / North West Provincial Treasuries|OCDS feed (provincial treasuries republish eTenders)|

**Rule of thumb:** national departments and provincial treasuries are almost
always already in the OCDS feed → FLAG as overlap. Municipalities, metros,
and SOEs (Eskom, Transnet, water boards, CIDB, etc.) are NOT in OCDS → safe
to scrape, no overlap.

\---

## PART D — The scraper template (COPY THIS EXACTLY)

Every generated scraper must follow this structure. Only change the marked
sections. Do not alter the imports, the `main()` structure, the error
handling, or the exit-code logic.

```javascript
#!/usr/bin/env node
// .github/scripts/fetch-{SLUG}.js
// {INSTITUTION NAME} tenders — {URL}
// Generated by DeepSeek. Viability: {SERVER\_RENDERED | JS\_RENDERED | etc}
// {Any ⚠️ flags go here}

import { parse } from 'node-html-parser';
import {
  mapSector,
  mapProvince,
  parseDate,
  politeFetch,
  clean,
  truncate,
  runIngest,
  safeMap,
  withTimeBudget,
  reportHealth,
} from './lib/common.js';

// ---- CONFIG — change per source ----
const SOURCE\_ID = '{SLUG}';                 // kebab-case, must match the D1 sources.id
const LISTING\_URL = '{URL}';
const BUYER\_NAME = '{INSTITUTION NAME}';
const PROVINCE\_SLUG = '{province-slug or "national"}';  // hardcode if source is province-specific
const TIME\_BUDGET\_MS = 4 \* 60\_000;

// ---- PARSING — implement to match the actual page HTML ----
function parseListing(html) {
  const root = parse(html);
  const out = \[];

  // {DEEPSEEK: replace these selectors with ones matching the real page.
  //  Inspect the fetched HTML and target the actual tender rows/cards.}
  const rows = root.querySelectorAll('{SELECTOR FOR EACH TENDER ROW}');

  for (const row of rows) {
    const externalId = clean(row.querySelector('{REF SELECTOR}')?.text);
    const title      = clean(row.querySelector('{TITLE SELECTOR}')?.text);
    const closingTxt = clean(row.querySelector('{CLOSING DATE SELECTOR}')?.text);
    const postedTxt  = clean(row.querySelector('{POSTED DATE SELECTOR}')?.text);
    const detailHref = row.querySelector('a')?.getAttribute('href');

    if (!externalId || !title) continue;  // skip incomplete rows

    out.push({ externalId, title, closingTxt, postedTxt, detailHref });
  }
  return out;
}

// ---- MAPPING — produces the canonical tender shape ----
function toCanonical(row) {
  return {
    externalId: row.externalId,
    title: truncate(row.title, 300),
    description: truncate(row.title, 500),
    buyer: BUYER\_NAME,
    province: PROVINCE\_SLUG,                        // or mapProvince(row.location)
    sector: mapSector(row.title),
    status: 'active',
    closingDate: parseDate(row.closingTxt),
    openingDate: parseDate(row.postedTxt),
    value: null,
    currency: 'ZAR',
    documentUrls: \[],
    sourceUrl: row.detailHref
      ? new URL(row.detailHref, LISTING\_URL).toString()
      : LISTING\_URL,
    briefingDate: null,
    briefingCompulsory: false,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
  };
}

// ---- MAIN — do not modify ----
async function main() {
  const started = Date.now();
  console.log(`\[${SOURCE\_ID}] starting scrape of ${LISTING\_URL}`);
  let result = { totalNew: 0, totalUpdated: 0, totalErrors: 0, batchesPushed: 0, totalScraped: 0 };
  try {
    result = await withTimeBudget(SOURCE\_ID, TIME\_BUDGET\_MS, async () => {
      const res = await politeFetch(LISTING\_URL);
      if (!res) { console.error(`\[${SOURCE\_ID}] fetch failed`); return result; }
      const html = await res.text();
      if (!html || html.length < 500) {
        console.error(`\[${SOURCE\_ID}] short response (${html.length} bytes)`);
        return result;
      }
      const rows = parseListing(html);
      console.log(`\[${SOURCE\_ID}] parsed ${rows.length} listings`);
      if (rows.length === 0) {
        console.log(`\[${SOURCE\_ID}] no listings — selectors may need updating`);
        return result;
      }
      const { results: tenders, errors: mapErrors } = safeMap(rows, toCanonical, SOURCE\_ID);
      console.log(`\[${SOURCE\_ID}] mapped ${tenders.length} (${mapErrors} errors)`);
      return await runIngest(SOURCE\_ID, tenders);
    });
  } catch (err) {
    console.error(`\[${SOURCE\_ID}] error: ${err.message}`);
    result = { ...result, totalErrors: result.totalErrors + 1 };
  }
  await reportHealth(SOURCE\_ID, result, { durationMs: Date.now() - started });
  process.exit(result.totalErrors > 0 \&\& result.batchesPushed === 0 ? 1 : 0);
}
main().catch((err) => { console.error(`\[${SOURCE\_ID}] fatal:`, err); process.exit(1); });
```

### Canonical field rules (the ingest API rejects anything that breaks these)

* `externalId` — REQUIRED. The source's own tender reference number. If the
page has no reference number, build one from the title: use a short slug.
* `title` — REQUIRED. Max 300 chars (the `truncate` helper handles this).
* `province` — REQUIRED. Must be exactly one of:
`eastern-cape`, `free-state`, `gauteng`, `kwazulu-natal`, `limpopo`,
`mpumalanga`, `north-west`, `northern-cape`, `western-cape`, `national`
* `sector` — REQUIRED. The `mapSector()` helper picks one of:
`agriculture`, `catering`, `cleaning`, `construction`, `consulting`,
`education`, `energy`, `health`, `ict`, `legal`, `security`, `transport`
* `status` — always the string `'active'` on ingest.
* `closingDate` / `openingDate` — ISO `YYYY-MM-DD` or `null`. Always run raw
date text through `parseDate()` — never pass raw strings.
* `value` — number in Rands, or `null`. Never a string, never cents.
* `documentUrls` — array of absolute URLs, max 10. Empty array if none.

### Province slug guidance

If the source is a single municipality/metro, hardcode `PROVINCE\_SLUG`:

* Johannesburg, Tshwane, Ekurhuleni → `gauteng`
* eThekwini, Msunduzi → `kwazulu-natal`
* Nelson Mandela Bay, Buffalo City → `eastern-cape`
* Mangaung → `free-state`
* Cape Town → `western-cape`
* National SOEs, CIDB, national bodies → `national`

\---

## PART E — Required output format (per institution)

For EACH institution in the input list, output exactly one block:

### If viable — generate the scraper:

````
## {Institution Name}

\*\*Viability:\*\* VIABLE
\*\*Slug:\*\* `{slug}`
\*\*Rendering:\*\* SERVER\_RENDERED
\*\*Overlap:\*\* NONE
\*\*Tenders visible:\*\* \~{N} on the page
\*\*Notes:\*\* {anything useful — pagination, detail pages, quirks}

```javascript
{the complete fetch-{slug}.js file}
```
````

### If it should be skipped:

````
## {Institution Name}

\*\*Viability:\*\* SKIP
\*\*Reason:\*\* {404 / not a tender page / login wall with no listings / etc}
\*\*Recommendation:\*\* {what the owner should do, if anything}
````

### If it builds but needs caution:

````
## {Institution Name}

\*\*Viability:\*\* NEEDS\_MANUAL  (or JS\_RENDERED, or EMPTY\_BUT\_VALID, or POSSIBLE\_OVERLAP)
\*\*Slug:\*\* `{slug}`
\*\*Reason:\*\* {why caution is needed}

```javascript
{the complete fetch-{slug}.js file — with ⚠️ flags in the header comment}
```
````

\---

## PART F — At the very end, output a combined SQL block

After all institutions, output ONE SQL block that inserts every VIABLE source
into the database. Use this exact format (the schema columns are:
`id, name, type, url, province, active`):

```sql
-- Run with: wrangler d1 execute tenderpreneurs --remote --file=new-sources.sql
INSERT OR IGNORE INTO sources (id, name, type, url, province, active) VALUES
  ('{slug}', '{Institution Name}', '{metro|soe|municipality|bulletin}', '{url}', '{province}', {1 or 0});
-- ... one row per viable source
-- Sources flagged POSSIBLE\_OVERLAP get active = 0 (won't run until owner confirms)
-- SKIP sources get no row at all
```

Also output a workflow snippet — one step per viable scraper — in this format:

```yaml
      - name: Fetch {Institution Name} tenders
        env:
          CRON\_SECRET: ${{ secrets.CRON\_SECRET }}
          SITE\_URL: https://tenderpreneurs.pages.dev
        run: node .github/scripts/fetch-{slug}.js
        continue-on-error: true
        timeout-minutes: 5
```

\---

## PART G — `lib/common.js` reference (DO NOT regenerate this — it already exists)

The scrapers import these. They are ALREADY in the repo. Listed here only so
you know the function signatures — do not output this file.

* `mapSector(text)` → returns a canonical sector slug from free text
* `mapProvince(text)` → returns a canonical province slug from free text
* `parseDate(text)` → returns `YYYY-MM-DD` or `null`; handles SA date formats
* `politeFetch(url, opts?)` → `fetch()` with UA, timeout, retries; returns
Response or `null`
* `clean(text)` → collapses whitespace, trims
* `truncate(text, max)` → trims to length with ellipsis
* `safeMap(items, fn, sourceId)` → maps with per-item error catching;
returns `{ results, errors }`
* `withTimeBudget(sourceId, ms, asyncFn)` → aborts if it runs too long
* `reportHealth(sourceId, result, opts)` → posts run health; never throws
* `runIngest(sourceId, tenders, opts?)` → validates, dedupes, batches, POSTs;
returns `{ totalNew, totalUpdated, totalErrors, batchesPushed, totalScraped }`

\---

## PART H — Slug naming convention

`SOURCE\_ID` / slug must be **kebab-case**, lowercase, no spaces, descriptive:

* City of Johannesburg → `joburg-metro`
* eThekwini → `ethekwini`
* City of Tshwane → `tshwane`
* Ekurhuleni → `ekurhuleni`
* Nelson Mandela Bay → `nelson-mandela-bay`
* Buffalo City → `buffalo-city`
* Mangaung → `mangaung`
* CIDB → `cidb`

The same slug must be used in: the filename, `SOURCE\_ID`, the SQL row, and the
workflow step.

\---

## PART I — Final checklist DeepSeek must self-verify per file

Before outputting each scraper, confirm:

* \[ ] File starts with `#!/usr/bin/env node` and the correct path comment
* \[ ] All imports come from `./lib/common.js` — nothing reimplemented
* \[ ] `SOURCE\_ID`, `LISTING\_URL`, `BUYER\_NAME`, `PROVINCE\_SLUG` are all set
* \[ ] `parseListing()` uses selectors based on the ACTUAL fetched HTML,
not guesses
* \[ ] Every `province` value is one of the 10 canonical slugs
* \[ ] Dates go through `parseDate()`, never raw strings
* \[ ] `main()` is copied verbatim from the template — not modified
* \[ ] Header comment notes the rendering type and any ⚠️ flags
* \[ ] The slug is kebab-case and consistent across file/SQL/workflow

\---

## INPUT — institutions to process

Process every row below. (The owner will paste the list here.)

|Institution|Tender URL|
|-|-|
|City of Johannesburg|https://www.joburg.org.za/work\_/Pages/Work%20in%20Joburg/Tenders%20and%20Quotations/Tenders-and-Quotations.aspx|
|eThekwini (Durban)|https://ethekwinisupplierportal.durban.gov.za/|
|City of Tshwane|https://www.tshwane.gov.za/?page\_id=108|
|Ekurhuleni|https://www.ekurhuleni.gov.za/tenders/|
|Nelson Mandela Bay|https://www.nelsonmandelabay.gov.za/tenders|
|Buffalo City|https://www.buffalocity.gov.za/tenders/|
|Mangaung|https://www.mangaung.co.za/tenders/|
|CIDB|https://www.cidb.org.za/cidb-tenders/current-tenders/|

<!-- Add more rows here as you find them. Keep the two-column format:

