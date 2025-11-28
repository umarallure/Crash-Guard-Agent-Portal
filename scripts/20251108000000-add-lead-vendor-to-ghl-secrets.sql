-- Migration to add lead_vendor column to ghl_location_secrets table
-- This allows mapping lead vendors to their corresponding GHL location IDs

ALTER TABLE ghl_location_secrets
ADD COLUMN IF NOT EXISTS lead_vendor VARCHAR(255);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_ghl_location_secrets_lead_vendor ON ghl_location_secrets(lead_vendor);

-- Add comment for documentation
COMMENT ON COLUMN ghl_location_secrets.lead_vendor IS 'Lead vendor name that maps to this GHL location';