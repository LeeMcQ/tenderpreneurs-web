-- 0005_tender_reference.sql
-- Durable reference store. Forward-only.
-- Places seed is optional; the app gazetteer lives in src/lib/tender-location.ts.

CREATE TABLE IF NOT EXISTS places (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  province    TEXT,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  precision   TEXT NOT NULL,
  aliases     TEXT
);

CREATE TABLE IF NOT EXISTS tender_locations (
  tender_id   TEXT PRIMARY KEY REFERENCES tenders(id),
  label       TEXT NOT NULL,
  town        TEXT,
  province    TEXT,
  precision   TEXT NOT NULL,
  source      TEXT NOT NULL,
  lat         REAL,
  lng         REAL,
  resolved_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tloc_province_town ON tender_locations(province, town);
CREATE INDEX IF NOT EXISTS idx_tloc_town ON tender_locations(town);

CREATE TABLE IF NOT EXISTS tender_documents (
  id          TEXT PRIMARY KEY,
  tender_id   TEXT NOT NULL REFERENCES tenders(id),
  filename    TEXT,
  url         TEXT,
  r2_key      TEXT,
  size_bytes  INTEGER,
  content_type TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tender_id, url)
);
CREATE INDEX IF NOT EXISTS idx_tdocs_tender ON tender_documents(tender_id);

CREATE TABLE IF NOT EXISTS tender_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id   TEXT NOT NULL REFERENCES tenders(id),
  kind        TEXT NOT NULL,
  at_date     TEXT,
  at_time     TEXT,
  place       TEXT,
  compulsory  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tevents_tender ON tender_events(tender_id, kind);

CREATE TABLE IF NOT EXISTS tender_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id   TEXT NOT NULL REFERENCES tenders(id),
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  source_url  TEXT,
  raw_excerpt TEXT
);
CREATE INDEX IF NOT EXISTS idx_tsnap_tender ON tender_snapshots(tender_id, captured_at DESC);

ALTER TABLE tenders ADD COLUMN locality TEXT;
ALTER TABLE tenders ADD COLUMN locality_precision TEXT;
ALTER TABLE tenders ADD COLUMN locality_lat REAL;
ALTER TABLE tenders ADD COLUMN locality_lng REAL;
ALTER TABLE tenders ADD COLUMN locality_source TEXT;

CREATE INDEX IF NOT EXISTS idx_tenders_locality ON tenders(locality);
CREATE INDEX IF NOT EXISTS idx_tenders_entity ON tenders(procuring_entity);
CREATE INDEX IF NOT EXISTS idx_tenders_ref ON tenders(source_ref);

CREATE VIRTUAL TABLE IF NOT EXISTS tenders_fts USING fts5(
  tender_id UNINDEXED,
  title,
  description,
  entity,
  source_ref,
  place,
  sector
);
