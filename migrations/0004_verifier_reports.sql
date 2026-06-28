-- migrations/0004_verifier_reports.sql
-- Admin review queue for the Tender Verifier + opt-in subscription consent.
-- Forward-only. Tables use IF NOT EXISTS (safe to re-run).

CREATE TABLE IF NOT EXISTS verification_reports (
  id              TEXT PRIMARY KEY,            -- ULID
  tender_id       TEXT NOT NULL REFERENCES tenders(id),
  corpus_version  TEXT,
  engines_json    TEXT,                        -- JSON array of engine names used
  report_json     TEXT NOT NULL,               -- full internal report (with confidence/agreement)
  external_json   TEXT NOT NULL,               -- high-confidence external view (what gets published/sent)
  health_score    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft|approved|published|sent|discarded
  reviewed_by     TEXT,
  reviewed_at     TEXT,
  published_at    TEXT,
  sent_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vr_status ON verification_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vr_tender ON verification_reports(tender_id, status);

-- Opt-in PUSH consent (POPIA s69). No outbound email without a row here + sign-off.
CREATE TABLE IF NOT EXISTS entity_subscriptions (
  procuring_entity TEXT NOT NULL,
  contact_email    TEXT NOT NULL,
  consent_at       TEXT,
  consent_form_ref TEXT,                        -- evidence of Form-4-style consent
  opted_out_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (procuring_entity, contact_email)
);
