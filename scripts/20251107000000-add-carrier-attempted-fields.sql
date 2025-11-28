-- Migration to add carrier_attempted fields for GI - Currently DQ status
-- Adds columns to track which carriers were attempted before disqualifying for GI only

ALTER TABLE call_results
ADD COLUMN IF NOT EXISTS carrier_attempted_1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS carrier_attempted_2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS carrier_attempted_3 VARCHAR(255);

-- Add comment for documentation
COMMENT ON COLUMN call_results.carrier_attempted_1 IS 'First carrier attempted for GI - Currently DQ status';
COMMENT ON COLUMN call_results.carrier_attempted_2 IS 'Second carrier attempted for GI - Currently DQ status';
COMMENT ON COLUMN call_results.carrier_attempted_3 IS 'Third carrier attempted for GI - Currently DQ status';