-- Add attorney_name column to call_results for tracking selected attorney
ALTER TABLE call_results 
ADD COLUMN IF NOT EXISTS attorney_name TEXT;

-- Add submission_status to track lawyer submission status
ALTER TABLE call_results 
ADD COLUMN IF NOT EXISTS submission_status TEXT DEFAULT 'pending';

-- Add lawyer_requirement_id to reference the lawyer configuration
ALTER TABLE call_results 
ADD COLUMN IF NOT EXISTS lawyer_requirement_id UUID;
