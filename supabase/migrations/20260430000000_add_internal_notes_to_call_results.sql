ALTER TABLE public.call_results
ADD COLUMN IF NOT EXISTS internal_notes text;

COMMENT ON COLUMN public.call_results.internal_notes IS
  'Internal-only notes for call result follow-up. These notes must not be sent to Slack notifications.';
