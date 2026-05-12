-- migrations/002_subscriptions.sql
-- Subscription system: plans, update subscriptions, payment_events

BEGIN;

-- 1. Static lookup table for subscription plans
CREATE TABLE IF NOT EXISTS plans (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    price_zar           INTEGER NOT NULL,
    ai_calls_per_month  INTEGER NOT NULL,
    tender_details      BOOLEAN NOT NULL DEFAULT false,
    alerts              BOOLEAN NOT NULL DEFAULT false,
    drafter_per_month   INTEGER NOT NULL
);

INSERT INTO plans (id, name, price_zar, ai_calls_per_month, tender_details, alerts, drafter_per_month)
VALUES
    ('free',         'Free',         0,   3,  false, false, 0),
    ('professional', 'Professional', 299, -1, true,  true,  10),
    ('business',     'Business',     999, -1, true,  true,  -1)
ON CONFLICT (id) DO NOTHING;

-- 2. Enum for subscription status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
        CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'past_due', 'trialing');
    END IF;
END $$;

-- Update existing subscriptions table with new columns
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS plan_id                   TEXT NOT NULL DEFAULT 'free' REFERENCES plans(id),
    ADD COLUMN IF NOT EXISTS payfast_token             VARCHAR(255),
    ADD COLUMN IF NOT EXISTS payfast_subscription_id   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS current_period_start      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS current_period_end        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS status                    subscription_status NOT NULL DEFAULT 'active';

-- 3. Payment events log
CREATE TABLE IF NOT EXISTS payment_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    event_type          VARCHAR(50) NOT NULL,
    amount_zar          NUMERIC(10,2) NOT NULL,
    payfast_payment_id  VARCHAR(255),
    payload             JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for payment_events
CREATE INDEX IF NOT EXISTS idx_payment_events_user_id              ON payment_events(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_payfast_payment_id   ON payment_events(payfast_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at           ON payment_events(created_at);

COMMIT;