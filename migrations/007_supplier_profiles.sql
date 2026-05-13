-- Migration: Create supplier_profiles table
-- Down migration: DROP TABLE IF EXISTS supplier_profiles;

CREATE TABLE IF NOT EXISTS supplier_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_name VARCHAR(255) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,

    -- Company identity
    legal_name VARCHAR(255) NOT NULL,
    trading_name VARCHAR(255),
    company_registration VARCHAR(100) NOT NULL,
    vat_number VARCHAR(50),
    tax_clearance_pin VARCHAR(50),
    tax_clearance_expiry DATE,

    -- B-BBEE
    bbbee_level INTEGER CHECK (bbbee_level BETWEEN 1 AND 8),
    bbbee_certificate_url VARCHAR(500),
    bbbee_expiry DATE,
    bbbee_verification_agency VARCHAR(255),
    black_ownership_percent DECIMAL(5,2),
    black_women_ownership_percent DECIMAL(5,2),

    -- CSD
    csd_number VARCHAR(100),
    csd_registered_date DATE,
    csd_active BOOLEAN DEFAULT FALSE,

    -- Capabilities
    primary_sectors TEXT[],
    secondary_sectors TEXT[],
    services_offered TEXT,
    max_contract_value_zar BIGINT,
    min_contract_value_zar INTEGER,
    geographic_coverage TEXT[], -- Provinces list

    -- Experience
    years_in_operation INTEGER NOT NULL,
    number_of_employees INTEGER NOT NULL,
    annual_turnover_zar BIGINT,

    -- JSON documents, projects, personnel
    documents JSONB DEFAULT '[]'::jsonb,
    past_projects JSONB DEFAULT '[]'::jsonb,
    key_personnel JSONB DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_supplier_profiles_user_id ON supplier_profiles(user_id);
CREATE INDEX idx_supplier_profiles_is_default ON supplier_profiles(is_default);
CREATE UNIQUE INDEX idx_user_default_profile ON supplier_profiles (user_id) WHERE is_default = true;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_supplier_profiles_updated_at
    BEFORE UPDATE ON supplier_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();