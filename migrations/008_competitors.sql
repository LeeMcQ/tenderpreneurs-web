-- Migration: 008_competitors.sql
-- Creates tables for tender awards, tracked competitors, and alerts log.

-- Table for awarded tender information from public sources
CREATE TABLE tender_awards (
    id BIGSERIAL PRIMARY KEY,
    tender_id BIGINT NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    winner_name VARCHAR(255) NOT NULL,
    winner_registration VARCHAR(100),           -- optional registration/company number
    award_value_zar BIGINT NOT NULL,
    award_date DATE NOT NULL,
    runner_up_names TEXT[] DEFAULT '{}',        -- array of runner-up names
    source VARCHAR(50) NOT NULL DEFAULT 'etenders' CHECK (source IN ('etenders','gazette','manual')),
    raw_data JSONB,                             -- full imported record for audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Prevent duplicate awards for the same tender
    CONSTRAINT unique_tender_award UNIQUE (tender_id, winner_name, award_date)
);

-- Indexes for fast filtering and leaderboards
CREATE INDEX idx_awards_winner_name ON tender_awards(winner_name);
CREATE INDEX idx_awards_award_date ON tender_awards(award_date);

-- Table for user's tracked competitors
CREATE TABLE tracked_competitors (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competitor_name VARCHAR(255) NOT NULL,
    competitor_registration VARCHAR(100),       -- optional identifier
    notes TEXT,
    alert_on_new_award BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, competitor_name)
);

-- Log of alerts sent to users about competitor awards
CREATE TABLE competitor_alerts_log (
    id BIGSERIAL PRIMARY KEY,
    tracked_competitor_id BIGINT NOT NULL REFERENCES tracked_competitors(id) ON DELETE CASCADE,
    award_id BIGINT NOT NULL REFERENCES tender_awards(id) ON DELETE CASCADE,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tracked_competitor_id, award_id)    -- avoid duplicate alerts
);