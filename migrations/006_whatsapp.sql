-- 006_whatsapp.sql
-- Add WhatsApp alerting support

BEGIN;

-- 1. Users table: add WhatsApp fields
ALTER TABLE users
  ADD COLUMN whatsapp_number VARCHAR(20) UNIQUE,
  ADD COLUMN whatsapp_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN whatsapp_opted_in BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN whatsapp_verification_code VARCHAR(6),
  ADD COLUMN whatsapp_verification_expires_at TIMESTAMP WITH TIME ZONE;

-- 2. Alert preferences: add channel selection
DO $$ BEGIN
  CREATE TYPE channel_type AS ENUM ('email', 'whatsapp', 'both');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE alert_preferences
  ADD COLUMN channel channel_type NOT NULL DEFAULT 'email';

-- 3. WhatsApp message log
CREATE TYPE whatsapp_message_status AS ENUM ('queued', 'sent', 'delivered', 'failed');

CREATE TABLE whatsapp_log (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_type  VARCHAR(50) NOT NULL,
  tender_id     INTEGER REFERENCES tenders(id) ON DELETE SET NULL,
  twilio_sid    VARCHAR(34),
  status        whatsapp_message_status NOT NULL DEFAULT 'queued',
  cost_zar      DECIMAL(10,4),
  sent_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  error_message TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_log_user_id ON whatsapp_log(user_id);
CREATE INDEX idx_whatsapp_log_sent_at ON whatsapp_log(sent_at);

COMMIT;