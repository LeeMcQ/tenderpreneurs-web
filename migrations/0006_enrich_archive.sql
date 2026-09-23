-- 0006_enrich_archive.sql
-- Recover omitted fields, keep closed notices for comparison.

ALTER TABLE tenders ADD COLUMN submission_method TEXT;
ALTER TABLE tenders ADD COLUMN evaluation_notes TEXT;
ALTER TABLE tenders ADD COLUMN returnables_json TEXT;
ALTER TABLE tenders ADD COLUMN enriched_at TEXT;
ALTER TABLE tenders ADD COLUMN enrich_source TEXT;

CREATE TABLE IF NOT EXISTS tender_comparables (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id  TEXT NOT NULL,
  closed_id  TEXT NOT NULL,
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tender_id, closed_id)
);
CREATE INDEX IF NOT EXISTS idx_tcomp_tender ON tender_comparables(tender_id);

CREATE INDEX IF NOT EXISTS idx_tenders_status_sector_prov
  ON tenders(status, sector, province, closing_date);
