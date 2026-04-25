CREATE TABLE IF NOT EXISTS public.retainer_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id text NOT NULL,
  submission_id text NULL,
  lead_id uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  template_id text NULL,
  recipient_name text NULL,
  recipient_email text NULL,
  recipient_phone text NULL,
  delivery_method text NULL,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamp with time zone NULL,
  viewed_at timestamp with time zone NULL,
  signed_at timestamp with time zone NULL,
  declined_at timestamp with time zone NULL,
  voided_at timestamp with time zone NULL,
  last_event text NULL,
  last_event_at timestamp with time zone NULL,
  last_synced_at timestamp with time zone NOT NULL DEFAULT now(),
  document_bucket text NULL,
  document_storage_path text NULL,
  document_file_name text NULL,
  document_content_type text NULL,
  document_size bigint NULL,
  document_sha256 text NULL,
  document_stored_at timestamp with time zone NULL,
  raw_last_event jsonb NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT retainer_agreements_envelope_id_key UNIQUE (envelope_id),
  CONSTRAINT retainer_agreements_status_check CHECK (
    status = ANY (ARRAY['sent'::text, 'viewed'::text, 'signed'::text, 'declined'::text, 'voided'::text, 'unknown'::text])
  ),
  CONSTRAINT retainer_agreements_delivery_method_check CHECK (
    delivery_method IS NULL OR delivery_method = ANY (ARRAY['email'::text, 'sms_only'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_retainer_agreements_submission_id
  ON public.retainer_agreements USING btree (submission_id)
  WHERE submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retainer_agreements_lead_id
  ON public.retainer_agreements USING btree (lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retainer_agreements_status
  ON public.retainer_agreements USING btree (status);

CREATE INDEX IF NOT EXISTS idx_retainer_agreements_last_synced_at
  ON public.retainer_agreements USING btree (last_synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_retainer_agreements_document_stored_at
  ON public.retainer_agreements USING btree (document_stored_at DESC)
  WHERE document_stored_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.retainer_agreement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retainer_agreement_id uuid NULL REFERENCES public.retainer_agreements(id) ON DELETE CASCADE,
  envelope_id text NOT NULL,
  event_type text NOT NULL,
  event_at timestamp with time zone NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retainer_agreement_events_envelope_id
  ON public.retainer_agreement_events USING btree (envelope_id);

CREATE INDEX IF NOT EXISTS idx_retainer_agreement_events_agreement_id
  ON public.retainer_agreement_events USING btree (retainer_agreement_id)
  WHERE retainer_agreement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retainer_agreement_events_created_at
  ON public.retainer_agreement_events USING btree (created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_retainer_agreements_updated_at'
      AND tgrelid = 'public.retainer_agreements'::regclass
  ) THEN
    CREATE TRIGGER update_retainer_agreements_updated_at
      BEFORE UPDATE ON public.retainer_agreements
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.retainer_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retainer_agreement_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retainer_agreements_insert_authenticated ON public.retainer_agreements;
DROP POLICY IF EXISTS retainer_agreements_update_authenticated ON public.retainer_agreements;

CREATE OR REPLACE FUNCTION public.has_retainer_agreement_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE user_id = auth.uid()
      AND (
        is_super_admin = true
        OR role = ANY (
          ARRAY[
            'super_admin'::text,
            'admin'::text,
            'agent'::text,
            'accounts'::text,
            'publisher_admin'::text,
            'publisher_closer'::text,
            'lawyer'::text
          ]
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_retainer_agreement_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_retainer_agreement_access() TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('retainer-agreements', 'retainer-agreements', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'retainer_agreements'
      AND policyname = 'retainer_agreements_select_authenticated'
  ) THEN
    CREATE POLICY retainer_agreements_select_authenticated
      ON public.retainer_agreements
      FOR SELECT
      TO authenticated
      USING (public.has_retainer_agreement_access());
  ELSE
    ALTER POLICY retainer_agreements_select_authenticated
      ON public.retainer_agreements
      USING (public.has_retainer_agreement_access());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'retainer_agreement_events'
      AND policyname = 'retainer_agreement_events_select_authenticated'
  ) THEN
    CREATE POLICY retainer_agreement_events_select_authenticated
      ON public.retainer_agreement_events
      FOR SELECT
      TO authenticated
      USING (public.has_retainer_agreement_access());
  ELSE
    ALTER POLICY retainer_agreement_events_select_authenticated
      ON public.retainer_agreement_events
      USING (public.has_retainer_agreement_access());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'retainer_agreements_storage_select_authenticated'
  ) THEN
    CREATE POLICY retainer_agreements_storage_select_authenticated
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'retainer-agreements'
        AND public.has_retainer_agreement_access()
      );
  ELSE
    ALTER POLICY retainer_agreements_storage_select_authenticated
      ON storage.objects
      USING (
        bucket_id = 'retainer-agreements'
        AND public.has_retainer_agreement_access()
      );
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.retainer_agreements;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;

COMMENT ON TABLE public.retainer_agreements IS 'Durable DocuSign retainer envelope lifecycle state.';
COMMENT ON TABLE public.retainer_agreement_events IS 'Append-only DocuSign Connect event audit records for retainer envelopes.';
