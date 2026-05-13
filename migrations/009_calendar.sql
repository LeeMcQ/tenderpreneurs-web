-- Add briefing & site visit fields to tenders
ALTER TABLE tenders
  ADD COLUMN briefing_date TIMESTAMPTZ,
  ADD COLUMN briefing_venue VARCHAR,
  ADD COLUMN briefing_is_compulsory BOOLEAN DEFAULT false,
  ADD COLUMN briefing_virtual_link VARCHAR,
  ADD COLUMN site_visit_date TIMESTAMPTZ,
  ADD COLUMN site_visit_venue VARCHAR;

-- Add calendar sync fields to users
ALTER TABLE users
  ADD COLUMN google_calendar_token TEXT,
  ADD COLUMN google_calendar_refresh_token TEXT,
  ADD COLUMN calendar_sync_enabled BOOLEAN DEFAULT false,
  ADD COLUMN ical_feed_token UUID UNIQUE DEFAULT gen_random_uuid();

-- Track Google Calendar events
CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('briefing','site_visit','closing','submission_reminder')),
    google_event_id VARCHAR,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_calendar_events_user_tender ON calendar_events(user_id, tender_id);