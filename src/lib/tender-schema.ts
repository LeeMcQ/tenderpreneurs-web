/** Apply forward-only reference columns if a deploy reached prod before wrangler migrate. */

const STMTS = [
  `CREATE TABLE IF NOT EXISTS places (
     slug TEXT PRIMARY KEY, name TEXT NOT NULL, province TEXT,
     lat REAL NOT NULL, lng REAL NOT NULL, precision TEXT NOT NULL, aliases TEXT)`,
  `CREATE TABLE IF NOT EXISTS tender_locations (
     tender_id TEXT PRIMARY KEY, label TEXT NOT NULL, town TEXT, province TEXT,
     precision TEXT NOT NULL, source TEXT NOT NULL, lat REAL, lng REAL,
     resolved_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX IF NOT EXISTS idx_tloc_province_town ON tender_locations(province, town)`,
  `CREATE TABLE IF NOT EXISTS tender_documents (
     id TEXT PRIMARY KEY, tender_id TEXT NOT NULL, filename TEXT, url TEXT,
     r2_key TEXT, size_bytes INTEGER, content_type TEXT,
     first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE (tender_id, url))`,
  `CREATE INDEX IF NOT EXISTS idx_tdocs_tender ON tender_documents(tender_id)`,
  `CREATE TABLE IF NOT EXISTS tender_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT, tender_id TEXT NOT NULL, kind TEXT NOT NULL,
     at_date TEXT, at_time TEXT, place TEXT, compulsory INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_tevents_tender ON tender_events(tender_id, kind)`,
  `CREATE TABLE IF NOT EXISTS tender_snapshots (
     id INTEGER PRIMARY KEY AUTOINCREMENT, tender_id TEXT NOT NULL,
     captured_at TEXT NOT NULL DEFAULT (datetime('now')), source_url TEXT, raw_excerpt TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_tsnap_tender ON tender_snapshots(tender_id, captured_at DESC)`,
  `ALTER TABLE tenders ADD COLUMN locality TEXT`,
  `ALTER TABLE tenders ADD COLUMN locality_precision TEXT`,
  `ALTER TABLE tenders ADD COLUMN locality_lat REAL`,
  `ALTER TABLE tenders ADD COLUMN locality_lng REAL`,
  `ALTER TABLE tenders ADD COLUMN locality_source TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_tenders_locality ON tenders(locality)`,
  `ALTER TABLE tenders ADD COLUMN submission_method TEXT`,
  `ALTER TABLE tenders ADD COLUMN evaluation_notes TEXT`,
  `ALTER TABLE tenders ADD COLUMN returnables_json TEXT`,
  `ALTER TABLE tenders ADD COLUMN enriched_at TEXT`,
  `ALTER TABLE tenders ADD COLUMN enrich_source TEXT`,
  `CREATE TABLE IF NOT EXISTS tender_comparables (
     id INTEGER PRIMARY KEY AUTOINCREMENT, tender_id TEXT NOT NULL, closed_id TEXT NOT NULL,
     reason TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE (tender_id, closed_id))`,
  `CREATE INDEX IF NOT EXISTS idx_tcomp_tender ON tender_comparables(tender_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tenders_status_sector_prov ON tenders(status, sector, province, closing_date)`,
];

export async function ensureReferenceSchema(db: { prepare: Function }): Promise<number> {
  let applied = 0;
  for (const sql of STMTS) {
    try {
      await db.prepare(sql).run();
      applied += 1;
    } catch {
      // duplicate column / already exists
    }
  }
  try {
    await db.prepare(
      `CREATE VIRTUAL TABLE IF NOT EXISTS tenders_fts USING fts5(
         tender_id UNINDEXED, title, description, entity, source_ref, place, sector)`,
    ).run();
    applied += 1;
  } catch {
    // fts5 optional
  }
  return applied;
}
