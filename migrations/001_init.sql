-- =====================================================================
-- tenderpreneurs.co.za :: initial schema migration
-- Postgres 15+
-- Run inside a transaction; safe to re-run after rollback.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- keyword/trigram search

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('user', 'admin', 'support');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE plan_tier AS ENUM ('free', 'starter', 'pro', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM (
        'trialing', 'active', 'past_due', 'canceled', 'expired'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE alert_frequency AS ENUM ('instant', 'daily', 'weekly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE tender_status AS ENUM ('open', 'closed', 'awarded', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Trigger function: keep updated_at fresh
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- users
-- =====================================================================
CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               CITEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    full_name           VARCHAR(160),
    company_name        VARCHAR(200),
    phone               VARCHAR(32),
    role                user_role NOT NULL DEFAULT 'user',
    email_verified      BOOLEAN NOT NULL DEFAULT FALSE,
    email_verify_token  TEXT,
    email_verify_expires TIMESTAMPTZ,
    reset_token         TEXT,
    reset_token_expires TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ,
    failed_login_count  INT NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email_active
    ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_reset_token
    ON users (reset_token) WHERE reset_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_verify_token
    ON users (email_verify_token) WHERE email_verify_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- tenders
-- =====================================================================
CREATE TABLE IF NOT EXISTS tenders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_number    VARCHAR(120) NOT NULL UNIQUE,
    title               VARCHAR(500) NOT NULL,
    short_description   TEXT,
    full_description    TEXT,           -- premium field
    issuing_authority   VARCHAR(300),
    province            VARCHAR(64),
    sector              VARCHAR(120),
    category            VARCHAR(120),
    budget_min          NUMERIC(18, 2),
    budget_max          NUMERIC(18, 2),
    currency            CHAR(3) NOT NULL DEFAULT 'ZAR',
    published_date      DATE,
    closing_date        TIMESTAMPTZ,
    briefing_date       TIMESTAMPTZ,
    contact_details     JSONB,          -- premium field
    documents           JSONB,          -- premium field; [{name,url,size}]
    requirements        JSONB,
    source_url          TEXT,
    source_name         VARCHAR(120),
    status              tender_status NOT NULL DEFAULT 'open',
    cidb_grading        VARCHAR(16),
    bbbee_level         SMALLINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scraped_at          TIMESTAMPTZ,
    CONSTRAINT chk_budget_range CHECK (
        budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max
    ),
    CONSTRAINT chk_bbbee_level CHECK (bbbee_level IS NULL OR bbbee_level BETWEEN 1 AND 8)
);

CREATE INDEX IF NOT EXISTS idx_tenders_closing_date ON tenders (closing_date)
    WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_tenders_province ON tenders (province);
CREATE INDEX IF NOT EXISTS idx_tenders_sector   ON tenders (sector);
CREATE INDEX IF NOT EXISTS idx_tenders_status   ON tenders (status);
CREATE INDEX IF NOT EXISTS idx_tenders_published_date
    ON tenders (published_date DESC);
CREATE INDEX IF NOT EXISTS idx_tenders_title_trgm
    ON tenders USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tenders_short_desc_trgm
    ON tenders USING GIN (short_description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tenders_province_sector_status
    ON tenders (province, sector, status);

DROP TRIGGER IF EXISTS trg_tenders_updated_at ON tenders;
CREATE TRIGGER trg_tenders_updated_at
    BEFORE UPDATE ON tenders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- saved_tenders (a.k.a. bookmarks)
-- =====================================================================
CREATE TABLE IF NOT EXISTS saved_tenders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    tender_id   UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, tender_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_tenders_user_id   ON saved_tenders (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_tenders_tender_id ON saved_tenders (tender_id);

DROP TRIGGER IF EXISTS trg_saved_tenders_updated_at ON saved_tenders;
CREATE TRIGGER trg_saved_tenders_updated_at
    BEFORE UPDATE ON saved_tenders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- alerts (saved searches that notify the user)
-- =====================================================================
CREATE TABLE IF NOT EXISTS alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(160) NOT NULL,
    keywords        TEXT[],
    provinces       TEXT[],
    sectors         TEXT[],
    min_budget      NUMERIC(18, 2),
    max_budget      NUMERIC(18, 2),
    frequency       alert_frequency NOT NULL DEFAULT 'daily',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_sent_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active_due
    ON alerts (frequency, last_sent_at) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_alerts_updated_at ON alerts;
CREATE TRIGGER trg_alerts_updated_at
    BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- subscriptions
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan                    plan_tier NOT NULL DEFAULT 'free',
    status                  subscription_status NOT NULL DEFAULT 'active',
    provider                VARCHAR(40),        -- 'payfast', 'stripe', etc.
    provider_subscription_id VARCHAR(160),
    provider_customer_id    VARCHAR(160),
    amount                  NUMERIC(12, 2),
    currency                CHAR(3) NOT NULL DEFAULT 'ZAR',
    billing_interval        VARCHAR(20),        -- 'month', 'year'
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    trial_ends_at           TIMESTAMPTZ,
    cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
    canceled_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one ACTIVE-ish subscription per user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_one_active_per_user
    ON subscriptions (user_id)
    WHERE status IN ('trialing', 'active', 'past_due');
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status  ON subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_id
    ON subscriptions (provider, provider_subscription_id);

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- ai_usage_log (track per-user AI consumption for quota & billing)
-- =====================================================================
CREATE TABLE IF NOT EXISTS ai_usage_log (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tender_id           UUID REFERENCES tenders(id) ON DELETE SET NULL,
    feature             VARCHAR(80) NOT NULL,       -- 'bid_writer','summary','match_score'
    provider            VARCHAR(40),                -- 'anthropic','openai','groq'
    model               VARCHAR(80),
    prompt_tokens       INT NOT NULL DEFAULT 0,
    completion_tokens   INT NOT NULL DEFAULT 0,
    total_tokens        INT NOT NULL DEFAULT 0,
    cost_usd            NUMERIC(10, 6) NOT NULL DEFAULT 0,
    latency_ms          INT,
    success             BOOLEAN NOT NULL DEFAULT TRUE,
    error_message       TEXT,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id    ON ai_usage_log (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_month
    ON ai_usage_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature    ON ai_usage_log (feature);

-- =====================================================================
-- sessions (refresh-token store; access tokens stay JWT-stateless)
-- =====================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash  TEXT NOT NULL UNIQUE,
    user_agent          TEXT,
    ip_address          INET,
    revoked_at          TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_active
    ON sessions (user_id) WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS trg_sessions_updated_at ON sessions;
CREATE TRIGGER trg_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- audit_log (immutable trail; no updates, only inserts)
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email     CITEXT,         -- snapshot in case user is deleted
    action          VARCHAR(80) NOT NULL,
    entity_type     VARCHAR(60),
    entity_id       TEXT,
    ip_address      INET,
    user_agent      TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id     ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at  ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action      ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_entity      ON audit_log (entity_type, entity_id);

COMMIT;
