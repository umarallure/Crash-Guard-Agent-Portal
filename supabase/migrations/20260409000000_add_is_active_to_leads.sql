-- Add is_active column to leads table for soft-delete (e.g. TCPA litigator flagged leads).
-- Defaults to true so all existing leads remain active.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Index for filtering active leads in portal queries.
CREATE INDEX IF NOT EXISTS idx_leads_is_active
  ON public.leads USING btree (is_active)
  WHERE is_active = true;
