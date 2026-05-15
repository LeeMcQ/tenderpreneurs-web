-- =============================================================
-- Tenderpreneurs D1 schema — initial migration
-- SQLite/D1 compatible. Idempotent where possible.
-- =============================================================

-- Sources: upstream public tender publishers we scrape.
-- Seeded by scripts/seed-sources.sql.
CREATE TABLE IF NOT EXISTS sources (
  id              TEXT PRIMARY KEY,                -- slug, e.g. "etenders", "treasury-bulletin", "joburg-metro"
  name            TEXT NOT NULL,                   -- display name
  type            TEXT NOT NULL,                   -- 'national' | 'provincial' | 'metro' | 'soe' | 'bulletin'
  url             TEXT NOT NULL,                   -- base URL of the source
  province        TEXT,                            -- if regional, the province slug (gauteng, western-cape, ...)
  active          INTEGER NOT NULL DEFAULT 1,      -- 0 to disable a source without dropping it
  poll_freq_mins  INTEGER NOT NULL DEFAULT 360,    -- how often to re-scrape (default 6h)
  last_run_at     TEXT,                            -- ISO-8601, set by ingest
  last_success_at TEXT,                            -- ISO-8601, only updated on a successful run
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sources_active ON sources(active);

-- Ingestion runs: one row per attempt to scrape one source.
-- The coverage audit reads these to detect silent failures.
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       TEXT NOT NULL REFERENCES sources(id),
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at     TEXT,
  status          TEXT NOT NULL DEFAULT 'running', -- 'running' | 'success' | 'failed' | 'partial'
  items_found     INTEGER NOT NULL DEFAULT 0,
  items_new       INTEGER NOT NULL DEFAULT 0,
  items_updated   INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  duration_ms     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_runs_source_started ON ingestion_runs(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON ingestion_runs(status);

-- Tenders: the core table.
-- A tender is uniquely identified by (source_id, source_ref) — the reference
-- number assigned by the procuring entity. Cross-source dedupe is handled
-- via canonical_ref (set by the dedupe step, points to the "winning" row).
CREATE TABLE IF NOT EXISTS tenders (
  id                  TEXT PRIMARY KEY,            -- ULID; generated at insert
  source_id           TEXT NOT NULL REFERENCES sources(id),
  source_ref          TEXT NOT NULL,               -- e.g. "RFT 022/2026"
  source_url          TEXT,                        -- canonical URL on the source site
  canonical_ref       TEXT,                        -- set if this row is a duplicate of another; points to its id
  title               TEXT NOT NULL,
  description         TEXT,                        -- short blurb (1-3 sentences)
  procuring_entity    TEXT,                        -- e.g. "Gauteng Department of Health"
  province            TEXT,                        -- slug; FK-by-convention to province slugs in /tenders/
  sector              TEXT,                        -- slug; one of the 12 sectors
  category            TEXT,                        -- 'goods' | 'services' | 'construction' | 'other'
  closing_date        TEXT,                        -- ISO date (no time component)
  closing_time        TEXT,                        -- HH:MM if known
  published_date      TEXT,                        -- ISO date when the source published it
  briefing_date       TEXT,                        -- ISO date for compulsory briefings, if any
  briefing_compulsory INTEGER NOT NULL DEFAULT 0,
  briefing_location   TEXT,
  contact_name        TEXT,
  contact_email       TEXT,
  contact_phone       TEXT,
  cidb_grade          TEXT,                        -- e.g. "5CE", null for non-construction
  estimated_value     INTEGER,                     -- in ZAR cents, null if unknown
  raw_html            TEXT,                        -- original HTML/text snippet for audit
  documents_json      TEXT,                        -- JSON array of {filename, url, r2_key, size_bytes}
  fingerprint         TEXT NOT NULL,               -- sha256 of normalised title+ref+procuring_entity (for change detection)
  status              TEXT NOT NULL DEFAULT 'open',-- 'open' | 'closed' | 'cancelled' | 'awarded'
  first_seen_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at        TEXT NOT NULL DEFAULT (datetime('now')),
  llm_extracted_at    TEXT,                        -- when DeepSeek last enriched this row
  llm_classified_at   TEXT,                        -- when Gemini last classified this row
  UNIQUE(source_id, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_tenders_province_closing ON tenders(province, closing_date DESC);
CREATE INDEX IF NOT EXISTS idx_tenders_sector_closing  ON tenders(sector, closing_date DESC);
CREATE INDEX IF NOT EXISTS idx_tenders_status_closing  ON tenders(status, closing_date DESC);
CREATE INDEX IF NOT EXISTS idx_tenders_canonical       ON tenders(canonical_ref);
CREATE INDEX IF NOT EXISTS idx_tenders_fingerprint     ON tenders(fingerprint);
CREATE INDEX IF NOT EXISTS idx_tenders_last_seen       ON tenders(last_seen_at DESC);

-- Tender history: every meaningful change to a tender (extension of closing
-- date, cancellation, scope change) gets a row. Lets us audit what changed
-- and surface "this tender was extended on X" badges.
CREATE TABLE IF NOT EXISTS tender_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id    TEXT NOT NULL REFERENCES tenders(id),
  changed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  change_type  TEXT NOT NULL,                       -- 'extended' | 'cancelled' | 'updated' | 'awarded'
  old_value    TEXT,
  new_value    TEXT,
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_history_tender ON tender_history(tender_id, changed_at DESC);

-- Users: magic-link authenticated. No passwords.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,                  -- ULID
  email         TEXT NOT NULL UNIQUE,
  email_lower   TEXT NOT NULL UNIQUE,              -- lowercased copy for case-insensitive lookup
  name          TEXT,
  company       TEXT,
  province      TEXT,                              -- their primary province of interest
  sectors_json  TEXT,                              -- JSON array of sector slugs they care about
  tier          TEXT NOT NULL DEFAULT 'free',      -- 'free' | 'paid'
  verified_at   TEXT,                              -- ISO timestamp of first successful magic-link verify
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);

-- Magic link tokens: one-shot, short-lived, hashed.
CREATE TABLE IF NOT EXISTS magic_tokens (
  token_hash    TEXT PRIMARY KEY,                  -- sha256 of the actual token; the token is never stored raw
  email         TEXT NOT NULL,                     -- lowercased
  redirect_to   TEXT,                              -- post-verify destination
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  consumed_at   TEXT                               -- set when used; nulled is "still valid"
);

CREATE INDEX IF NOT EXISTS idx_tokens_email ON magic_tokens(email);
CREATE INDEX IF NOT EXISTS idx_tokens_expiry ON magic_tokens(expires_at);

-- Sessions: signed JWT in the cookie, plus a row here for revocation.
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,                  -- random 32-byte hex
  user_id       TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT,
  ip            TEXT,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Bookmarks: a user has saved a tender to follow.
CREATE TABLE IF NOT EXISTS bookmarks (
  user_id      TEXT NOT NULL REFERENCES users(id),
  tender_id    TEXT NOT NULL REFERENCES tenders(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  notes        TEXT,
  PRIMARY KEY (user_id, tender_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id, created_at DESC);

-- Waitlist: email-only signups (from the inline forms on hub pages).
-- Separate from users because they haven't verified an email yet.
CREATE TABLE IF NOT EXISTS waitlist (
  email        TEXT NOT NULL,
  hub          TEXT NOT NULL,                      -- "Province:Gauteng" or "Sector:Construction"
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, hub)
);
