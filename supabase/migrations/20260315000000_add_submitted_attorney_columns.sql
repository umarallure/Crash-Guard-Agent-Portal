-- Add submitted_attorney and submitted_attorney_status columns to daily_deal_flow table
ALTER TABLE daily_deal_flow 
ADD COLUMN IF NOT EXISTS submitted_attorney TEXT,
ADD COLUMN IF NOT EXISTS submitted_attorney_status TEXT;

-- Add submitted_attorney and submitted_attorney_status columns to call_results table
ALTER TABLE call_results 
ADD COLUMN IF NOT EXISTS submitted_attorney TEXT,
ADD COLUMN IF NOT EXISTS submitted_attorney_status TEXT;
