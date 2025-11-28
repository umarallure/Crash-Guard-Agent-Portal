-- Migration: Add accident and contact-related fields to `leads` table
-- Generated: 2025-11-29

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS accident_date DATE,
  ADD COLUMN IF NOT EXISTS prior_attorney_involved BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prior_attorney_details TEXT,
  ADD COLUMN IF NOT EXISTS medical_attention TEXT,
  ADD COLUMN IF NOT EXISTS police_attended BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS accident_location TEXT,
  ADD COLUMN IF NOT EXISTS accident_scenario TEXT,
  ADD COLUMN IF NOT EXISTS insured BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS injuries TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_registration TEXT,
  ADD COLUMN IF NOT EXISTS insurance_company TEXT,
  ADD COLUMN IF NOT EXISTS third_party_vehicle_registration TEXT,
  ADD COLUMN IF NOT EXISTS other_party_admit_fault BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS passengers_count INTEGER,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS contact_address TEXT;

COMMIT;

-- Notes:
-- 1) Column names use snake_case and are intentionally generic/text where
--    the required structure isn't specified. Adjust types later if you
--    prefer JSON, structured address, or separate phone normalization.
-- 2) Boolean defaults set to FALSE for yes/no fields.
