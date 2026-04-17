-- Deterministic broker DocuSign template seed.
-- This migration intentionally uses exact normalized aliases only.
CREATE TEMP TABLE _desired_broker_templates (
  firm_key text NOT NULL,
  template_name text NOT NULL,
  template_id text NOT NULL,
  is_default boolean NOT NULL,
  priority integer NOT NULL
) ON COMMIT DROP;

INSERT INTO _desired_broker_templates (firm_key, template_name, template_id, is_default, priority)
VALUES
  (
    'mcdonald_worley',
    'Retainer Contract - MCDONALD WORLEY, LLC',
    '001991f3-71e7-4cdc-a80c-ca5d60c9c4be',
    true,
    10
  ),
  (
    'dworkin_maciariello',
    'Retainer Contract - DWORKIN & MACIARIELLO',
    'e8cdeab3-b379-49b7-bf96-e87eceba5418',
    true,
    10
  );

CREATE TEMP TABLE _broker_firm_aliases (
  firm_key text NOT NULL,
  normalized_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO _broker_firm_aliases (firm_key, normalized_name)
VALUES
  ('mcdonald_worley', 'MCDONALDWORLEY'),
  ('mcdonald_worley', 'MCDONALDWORLY'),
  ('mcdonald_worley', 'MCDONALDWORLEYLLC'),
  ('mcdonald_worley', 'MCDONALDWORLYLLC'),
  ('dworkin_maciariello', 'DWORKINMACIARIELLO'),
  ('dworkin_maciariello', 'DWORKINANDMACIARIELLO');

CREATE TEMP TABLE _matched_broker_attorneys ON COMMIT DROP AS
SELECT DISTINCT
  dt.firm_key,
  ap.user_id AS attorney_id,
  dt.template_name,
  dt.template_id,
  dt.is_default,
  dt.priority
FROM _desired_broker_templates dt
JOIN _broker_firm_aliases fa
  ON fa.firm_key = dt.firm_key
JOIN public.attorney_profiles ap
  ON ap.account_type = 'broker_lawyer'
 AND (
   regexp_replace(upper(coalesce(ap.firm_name, '')), '[^A-Z0-9]+', '', 'g') = fa.normalized_name
   OR regexp_replace(upper(coalesce(ap.full_name, '')), '[^A-Z0-9]+', '', 'g') = fa.normalized_name
 );

INSERT INTO _matched_broker_attorneys (firm_key, attorney_id, template_name, template_id, is_default, priority)
SELECT DISTINCT
  dt.firm_key,
  lr.attorney_id AS attorney_id,
  dt.template_name,
  dt.template_id,
  dt.is_default,
  dt.priority
FROM _desired_broker_templates dt
JOIN _broker_firm_aliases fa
  ON fa.firm_key = dt.firm_key
JOIN public.lawyer_requirements lr
  ON lr.attorney_id IS NOT NULL
 AND regexp_replace(upper(coalesce(lr.attorney_name, '')), '[^A-Z0-9]+', '', 'g') = fa.normalized_name
WHERE NOT EXISTS (
  SELECT 1
  FROM _matched_broker_attorneys mba
  WHERE mba.attorney_id = lr.attorney_id
    AND mba.template_id = dt.template_id
);

CREATE TEMP TABLE _matched_broker_requirements ON COMMIT DROP AS
SELECT DISTINCT
  dt.firm_key,
  lr.id AS lawyer_requirement_id,
  dt.template_name,
  dt.template_id,
  dt.is_default,
  dt.priority
FROM _desired_broker_templates dt
JOIN _broker_firm_aliases fa
  ON fa.firm_key = dt.firm_key
JOIN public.lawyer_requirements lr
  ON regexp_replace(upper(coalesce(lr.attorney_name, '')), '[^A-Z0-9]+', '', 'g') = fa.normalized_name
WHERE lr.attorney_id IS NULL
   OR lr.attorney_id NOT IN (
     SELECT attorney_id
     FROM _matched_broker_attorneys
   );

UPDATE public.docusign_template_mappings dtm
SET is_default = false,
    updated_at = now()
WHERE dtm.state_code IS NULL
  AND dtm.is_active = true
  AND dtm.attorney_id IN (
    SELECT attorney_id
    FROM _matched_broker_attorneys
    WHERE is_default = true
  )
  AND dtm.template_id NOT IN (
    SELECT template_id
    FROM _matched_broker_attorneys
    WHERE is_default = true
  );

UPDATE public.docusign_template_mappings dtm
SET is_default = false,
    updated_at = now()
WHERE dtm.state_code IS NULL
  AND dtm.is_active = true
  AND dtm.lawyer_requirement_id IN (
    SELECT lawyer_requirement_id
    FROM _matched_broker_requirements
    WHERE is_default = true
  )
  AND dtm.template_id NOT IN (
    SELECT template_id
    FROM _matched_broker_requirements
    WHERE is_default = true
  );

UPDATE public.docusign_template_mappings dtm
SET template_name = mba.template_name,
    template_type = 'retainer',
    is_default = mba.is_default,
    priority = mba.priority,
    is_active = true,
    updated_at = now()
FROM _matched_broker_attorneys mba
WHERE dtm.attorney_id = mba.attorney_id
  AND dtm.lawyer_requirement_id IS NULL
  AND dtm.state_code IS NULL
  AND dtm.template_id = mba.template_id;

INSERT INTO public.docusign_template_mappings (
  attorney_id,
  lawyer_requirement_id,
  state_code,
  template_id,
  template_name,
  template_type,
  is_default,
  priority,
  is_active
)
SELECT
  mba.attorney_id,
  NULL,
  NULL,
  mba.template_id,
  mba.template_name,
  'retainer',
  mba.is_default,
  mba.priority,
  true
FROM _matched_broker_attorneys mba
WHERE NOT EXISTS (
  SELECT 1
  FROM public.docusign_template_mappings dtm
  WHERE dtm.attorney_id = mba.attorney_id
    AND dtm.lawyer_requirement_id IS NULL
    AND dtm.state_code IS NULL
    AND dtm.template_id = mba.template_id
);

UPDATE public.docusign_template_mappings dtm
SET template_name = mbr.template_name,
    template_type = 'retainer',
    is_default = mbr.is_default,
    priority = mbr.priority,
    is_active = true,
    updated_at = now()
FROM _matched_broker_requirements mbr
WHERE dtm.lawyer_requirement_id = mbr.lawyer_requirement_id
  AND dtm.attorney_id IS NULL
  AND dtm.state_code IS NULL
  AND dtm.template_id = mbr.template_id;

INSERT INTO public.docusign_template_mappings (
  attorney_id,
  lawyer_requirement_id,
  state_code,
  template_id,
  template_name,
  template_type,
  is_default,
  priority,
  is_active
)
SELECT
  NULL,
  mbr.lawyer_requirement_id,
  NULL,
  mbr.template_id,
  mbr.template_name,
  'retainer',
  mbr.is_default,
  mbr.priority,
  true
FROM _matched_broker_requirements mbr
WHERE NOT EXISTS (
  SELECT 1
  FROM public.docusign_template_mappings dtm
  WHERE dtm.lawyer_requirement_id = mbr.lawyer_requirement_id
    AND dtm.attorney_id IS NULL
    AND dtm.state_code IS NULL
    AND dtm.template_id = mbr.template_id
);

DO $$
DECLARE
  mw_attorney_count integer;
  mw_requirement_count integer;
  dm_attorney_count integer;
  dm_requirement_count integer;
BEGIN
  SELECT count(*)
  INTO mw_attorney_count
  FROM _matched_broker_attorneys
  WHERE firm_key = 'mcdonald_worley';

  SELECT count(*)
  INTO mw_requirement_count
  FROM _matched_broker_requirements
  WHERE firm_key = 'mcdonald_worley';

  SELECT count(*)
  INTO dm_attorney_count
  FROM _matched_broker_attorneys
  WHERE firm_key = 'dworkin_maciariello';

  SELECT count(*)
  INTO dm_requirement_count
  FROM _matched_broker_requirements
  WHERE firm_key = 'dworkin_maciariello';

  RAISE NOTICE
    'Broker DocuSign template mappings matched. McDonald Worley attorneys: %, requirements: %; Dworkin & Maciariello attorneys: %, requirements: %',
    mw_attorney_count,
    mw_requirement_count,
    dm_attorney_count,
    dm_requirement_count;
END $$;
