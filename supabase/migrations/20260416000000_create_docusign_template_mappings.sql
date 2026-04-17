DO $$
BEGIN
  IF to_regclass('public.docusign_template_mappings') IS NULL THEN
    CREATE TABLE public.docusign_template_mappings (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      attorney_id uuid NULL,
      lawyer_requirement_id uuid NULL,
      state_code text NULL,
      template_id character varying(100) NOT NULL,
      template_name text NULL,
      template_type text NULL,
      is_default boolean NOT NULL DEFAULT false,
      priority integer NOT NULL DEFAULT 100,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT docusign_template_mappings_pkey PRIMARY KEY (id),
      CONSTRAINT docusign_template_mappings_attorney_id_fkey
        FOREIGN KEY (attorney_id) REFERENCES public.attorney_profiles (user_id) ON DELETE SET NULL,
      CONSTRAINT docusign_template_mappings_lawyer_requirement_id_fkey
        FOREIGN KEY (lawyer_requirement_id) REFERENCES public.lawyer_requirements (id) ON DELETE SET NULL,
      CONSTRAINT docusign_template_mappings_state_code_chk
        CHECK (
          state_code IS NULL OR char_length(trim(both from state_code)) = 2
        )
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dtm_attorney_id
  ON public.docusign_template_mappings USING btree (attorney_id)
  WHERE attorney_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dtm_lawyer_requirement_id
  ON public.docusign_template_mappings USING btree (lawyer_requirement_id)
  WHERE lawyer_requirement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dtm_state_code
  ON public.docusign_template_mappings USING btree (upper(state_code))
  WHERE state_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dtm_unique_attorney_state_template
  ON public.docusign_template_mappings USING btree (attorney_id, upper(state_code), template_id)
  WHERE attorney_id IS NOT NULL AND state_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dtm_unique_attorney_global_template
  ON public.docusign_template_mappings USING btree (attorney_id, template_id)
  WHERE attorney_id IS NOT NULL AND state_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dtm_unique_lr_state_template
  ON public.docusign_template_mappings USING btree (lawyer_requirement_id, upper(state_code), template_id)
  WHERE lawyer_requirement_id IS NOT NULL AND state_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dtm_unique_lr_global_template
  ON public.docusign_template_mappings USING btree (lawyer_requirement_id, template_id)
  WHERE lawyer_requirement_id IS NOT NULL AND state_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dtm_one_default_per_attorney_state
  ON public.docusign_template_mappings USING btree (attorney_id, upper(state_code))
  WHERE attorney_id IS NOT NULL AND state_code IS NOT NULL AND is_default = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dtm_one_default_per_attorney_global
  ON public.docusign_template_mappings USING btree (attorney_id)
  WHERE attorney_id IS NOT NULL AND state_code IS NULL AND is_default = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dtm_one_default_per_lr_state
  ON public.docusign_template_mappings USING btree (lawyer_requirement_id, upper(state_code))
  WHERE lawyer_requirement_id IS NOT NULL AND state_code IS NOT NULL AND is_default = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dtm_one_default_per_lr_global
  ON public.docusign_template_mappings USING btree (lawyer_requirement_id)
  WHERE lawyer_requirement_id IS NOT NULL AND state_code IS NULL AND is_default = true AND is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_docusign_template_mappings_updated_at'
      AND tgrelid = 'public.docusign_template_mappings'::regclass
  ) THEN
    CREATE TRIGGER update_docusign_template_mappings_updated_at
      BEFORE UPDATE ON public.docusign_template_mappings
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
