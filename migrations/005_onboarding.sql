-- migrations/005_onboarding.sql
BEGIN;

-- Create role enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'bid_writer',
        'business_owner',
        'procurement_officer',
        'consultant'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add onboarding columns to users table
ALTER TABLE users
    ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN onboarding_step INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN company_name VARCHAR,
    ADD COLUMN company_registration VARCHAR,
    ADD COLUMN bbbee_level INTEGER,
    ADD COLUMN primary_province VARCHAR,
    ADD COLUMN primary_sectors TEXT[],
    ADD COLUMN role user_role,
    ADD COLUMN referred_by VARCHAR,
    ADD COLUMN utm_source VARCHAR,
    ADD COLUMN utm_medium VARCHAR,
    ADD COLUMN utm_campaign VARCHAR;

COMMIT;