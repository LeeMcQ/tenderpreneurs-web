-- =============================================================
-- Tenderpreneurs D1 schema — auth & payments extension
-- Adds: Google OAuth identities, PayFast subscriptions & payments,
--       and OAuth state tokens for CSRF protection.
-- Idempotent (uses IF NOT EXISTS).
-- =============================================================

-- ---------- 1. OAuth identities (Google now, extensible later) ----------
-- One row per (provider, provider_user_id). A user can have multiple identities
-- (e.g. magic-link + Google) — they're linked by users.id.
CREATE TABLE IF NOT EXISTS oauth_identities (
  id                TEXT PRIMARY KEY,                   -- ULID
  user_id           TEXT NOT NULL REFERENCES users(id),
  provider          TEXT NOT NULL,                      -- 'google' | 'github' | ...
  provider_user_id  TEXT NOT NULL,                      -- the sub claim from the provider
  email             TEXT,                               -- email reported by the provider (may differ from users.email)
  display_name      TEXT,
  picture_url       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at     TEXT,
  UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_user     ON oauth_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_provider ON oauth_identities(provider, email);

-- ---------- 2. OAuth state tokens (short-lived, CSRF protection) ----------
-- Generated when we send the user to Google; verified on callback.
-- Carries the post-login redirect target so we can return them to the page they wanted.
CREATE TABLE IF NOT EXISTS oauth_state (
  state         TEXT PRIMARY KEY,                       -- random 32 bytes hex
  provider      TEXT NOT NULL,
  redirect_to   TEXT,
  plan          TEXT,                                   -- 'free' | 'pro' | 'pro_annual' | null
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_state_expiry ON oauth_state(expires_at);

-- ---------- 3. Subscriptions (one active row per user) ----------
-- We keep historical rows by status. A user's "current" subscription is the
-- row with status IN ('active','past_due') ordered by created_at DESC.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  TEXT PRIMARY KEY,                 -- ULID
  user_id             TEXT NOT NULL REFERENCES users(id),
  plan                TEXT NOT NULL,                    -- 'pro_monthly' | 'pro_annual'
  status              TEXT NOT NULL,                    -- 'pending' | 'active' | 'past_due' | 'cancelled' | 'failed'
  amount_zar_cents    INTEGER NOT NULL,                 -- e.g. 29900 = R299.00
  billing_cycle       TEXT NOT NULL,                    -- 'monthly' | 'annual'
  payfast_token       TEXT,                             -- PayFast subscription token (returned in ITN)
  m_payment_id        TEXT NOT NULL UNIQUE,             -- our idempotency key sent to PayFast
  current_period_end  TEXT,                             -- ISO timestamp
  cancelled_at        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subs_user_status ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subs_token       ON subscriptions(payfast_token);

-- ---------- 4. Payments ledger (one row per ITN we accept) ----------
-- Every successful or failed PayFast ITN is logged here for audit.
CREATE TABLE IF NOT EXISTS payments (
  id                TEXT PRIMARY KEY,                   -- ULID
  user_id           TEXT REFERENCES users(id),
  subscription_id   TEXT REFERENCES subscriptions(id),
  pf_payment_id     TEXT,                               -- PayFast's pf_payment_id
  m_payment_id      TEXT NOT NULL,
  amount_zar_cents  INTEGER NOT NULL,
  payment_status    TEXT NOT NULL,                      -- 'COMPLETE' | 'FAILED' | 'CANCELLED'
  raw_itn_json      TEXT,                               -- full ITN payload for debugging
  received_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(pf_payment_id)
);

CREATE INDEX IF NOT EXISTS idx_payments_user        ON payments(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_mpaymentid  ON payments(m_payment_id);
