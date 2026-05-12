-- 004_pipeline.sql
-- Pipeline management tables for tenderpreneurs.co.za

BEGIN;

-- Create pipeline_items table
CREATE TABLE IF NOT EXISTS pipeline_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    tender_id INTEGER,
    manual_title VARCHAR(255),
    stage VARCHAR(50) NOT NULL
        CHECK (stage IN ('identified', 'documents_requested', 'bid_preparing', 'submitted', 'evaluation', 'awarded', 'lost', 'cancelled')),
    priority VARCHAR(10) NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high')),
    notes TEXT,
    submission_date DATE,
    assigned_to VARCHAR(255),
    win_probability_score INTEGER
        CHECK (win_probability_score >= 0 AND win_probability_score <= 100),
    estimated_value_zar INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Foreign keys
    CONSTRAINT fk_pipeline_items_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_pipeline_items_tender
        FOREIGN KEY (tender_id)
        REFERENCES tenders(id)
        ON DELETE SET NULL
);

-- Create pipeline_documents table
CREATE TABLE IF NOT EXISTS pipeline_documents (
    id SERIAL PRIMARY KEY,
    pipeline_item_id INTEGER NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by INTEGER,
    
    -- Foreign keys
    CONSTRAINT fk_pipeline_documents_item
        FOREIGN KEY (pipeline_item_id)
        REFERENCES pipeline_items(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_pipeline_documents_uploader
        FOREIGN KEY (uploaded_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_pipeline_items_user_id ON pipeline_items(user_id);
CREATE INDEX idx_pipeline_items_stage ON pipeline_items(stage);
CREATE INDEX idx_pipeline_documents_item_id ON pipeline_documents(pipeline_item_id);
CREATE INDEX idx_pipeline_documents_uploaded_by ON pipeline_documents(uploaded_by);

-- Trigger to automatically update updated_at on pipeline_items
CREATE OR REPLACE FUNCTION update_pipeline_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pipeline_items_updated_at
    BEFORE UPDATE ON pipeline_items
    FOR EACH ROW
    EXECUTE FUNCTION update_pipeline_items_updated_at();

COMMIT;