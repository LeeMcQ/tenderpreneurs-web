-- Product ops: usage events, source health, saved searches, drafts, digest log.
-- Safe to re-run (IF NOT EXISTS). ALTER COLUMN lines may fail if already applied.

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT NOT NULL,
  user_hash TEXT,
  tender_id TEXT,
  props_json TEXT,
  path TEXT
);
CREATE INDEX IF NOT EXISTS idx_usage_at ON usage_events(at);
CREATE INDEX IF NOT EXISTS idx_usage_name ON usage_events(name, at);

CREATE TABLE IF NOT EXISTS source_health (
  source TEXT PRIMARY KEY,
  last_ok_at TEXT,
  last_fail_at TEXT,
  last_http INTEGER,
  last_error TEXT,
  items_ok INTEGER NOT NULL DEFAULT 0,
  items_fail INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT,
  q TEXT,
  province TEXT,
  sector TEXT,
  within_days INTEGER,
  channel TEXT NOT NULL DEFAULT 'email',
  last_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id);

CREATE TABLE IF NOT EXISTS notice_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  body_json TEXT NOT NULL,
  last_review_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_drafts_user ON notice_drafts(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS digest_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  item_count INTEGER NOT NULL DEFAULT 0,
  clicked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS thin_notices (
  tender_id TEXT PRIMARY KEY,
  reasons TEXT,
  flagged_at TEXT NOT NULL DEFAULT (datetime('now'))
);
