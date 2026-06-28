-- migrations/0003_intelligence.sql
-- Adds the tables/columns powering Win Probability AI and (later) the Verifier
-- and awards-based calibration. Forward-only. Run once.
--
-- NOTE: D1/SQLite does NOT support "ADD COLUMN IF NOT EXISTS". These ALTERs
-- assume the columns do not yet exist. If re-running, comment out lines that
-- already applied. Tables use IF NOT EXISTS and are safe to re-run.

-- ── Supplier profiles (PII — process only on Anthropic/SA-adequate infra) ──
CREATE TABLE IF NOT EXISTS supplier_profiles (
  user_id            TEXT PRIMARY KEY REFERENCES users(id),
  cidb_grades_json   TEXT,                    -- JSON array of held grades, e.g. ["6CE","4GB"] (R1: firms hold several)
  bbbee_level        INTEGER,                 -- 1 (best) .. 8 (none)
  turnover_band      TEXT,                    -- e.g. "<1m" | "1-5m" | "5-20m" | "20m+"
  capacity_value_max INTEGER,                 -- ZAR cents — largest deliverable contract
  provinces_json     TEXT,                    -- JSON array of province slugs
  sectors_json       TEXT,                    -- JSON array of sector slugs
  keywords_json      TEXT,                    -- JSON array, up to 10
  certifications_json TEXT,                   -- JSON array of {name, expires_at}
  csd_number         TEXT,                    -- Central Supplier Database number
  doc_expiry_json    TEXT,                    -- JSON {tax_clearance, bbbee_cert, ...: ISO date}
  jv_visible         INTEGER NOT NULL DEFAULT 0, -- POPIA opt-in for JV directory
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Awards (feeds Win Probability v2 calibration + market intelligence) ──
CREATE TABLE IF NOT EXISTS awards (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id        TEXT REFERENCES tenders(id),   -- nullable: award may predate our row
  source_ref       TEXT,
  procuring_entity TEXT,
  sector           TEXT,
  province         TEXT,
  winner_name      TEXT,
  winner_bbbee     INTEGER,
  award_value_cents INTEGER,
  num_bidders      INTEGER,
  awarded_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_awards_segment ON awards(sector, province, award_value_cents);
CREATE INDEX IF NOT EXISTS idx_awards_tender  ON awards(tender_id);

-- ── Tender columns the Verifier + scoring read (nullable; backfilled later) ──
ALTER TABLE tenders ADD COLUMN bbbee_required    INTEGER;          -- required minimum B-BBEE level
ALTER TABLE tenders ADD COLUMN preference_system TEXT;             -- '80/20' | '90/10' | NULL
