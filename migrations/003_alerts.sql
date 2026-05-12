-- migrations/003_alerts.sql
-- Creates alert preferences and alert log tables for Tenderpreneurs.co.za

-- Enum types
CREATE TYPE IF NOT EXISTS alert_frequency AS ENUM ('instant', 'daily', 'weekly');
CREATE TYPE IF NOT EXISTS email_status_type AS ENUM ('sent', 'failed', 'skipped');

-- Alert preferences: a user can have multiple named alert configurations
CREATE TABLE IF NOT EXISTS alert_preferences (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,                     -- e.g. "My IT Alerts"
    provinces       TEXT[] NOT NULL DEFAULT '{}',              -- empty array means all provinces
    sectors         TEXT[] NOT NULL DEFAULT '{}',               -- empty array means all sectors
    keywords        TEXT[] NOT NULL DEFAULT '{}',               -- words to match in tender title/description
    min_value_zar   INTEGER,                                   -- nullable minimum contract value
    max_value_zar   INTEGER,                                   -- nullable maximum contract value
    is_active       BOOLEAN NOT NULL DEFAULT true,
    frequency       alert_frequency NOT NULL DEFAULT 'daily',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient filtering
CREATE INDEX idx_alert_preferences_user_id    ON alert_preferences(user_id);
CREATE INDEX idx_alert_preferences_is_active  ON alert_preferences(is_active);
CREATE INDEX idx_alert_preferences_frequency  ON alert_preferences(frequency);

-- Alert log: records which tender was matched against which alert preference
CREATE TABLE IF NOT EXISTS alert_log (
    id                  SERIAL PRIMARY KEY,
    alert_preference_id INTEGER NOT NULL REFERENCES alert_preferences(id) ON DELETE CASCADE,
    tender_id           INTEGER NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sent_at             TIMESTAMPTZ,                            -- null until the alert is actually sent
    email_status        email_status_type NOT NULL,
    -- Prevent the same tender from being sent twice for the same alert
    CONSTRAINT uq_alert_preference_tender UNIQUE (alert_preference_id, tender_id)
);

-- Optional: index on alert_log user_id for user‑centric queries
-- (not explicitly requested, but often useful)
CREATE INDEX idx_alert_log_user_id ON alert_log(user_id);