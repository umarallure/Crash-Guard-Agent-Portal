-- Seed Lerner & Rowe broker DocuSign retainer template mapping.
-- Uses the lawyer requirement directly because this broker row is not yet linked
-- to an attorney profile.

UPDATE public.docusign_template_mappings
SET is_default = false,
    updated_at = now()
WHERE lawyer_requirement_id = '55cae776-e7cf-4335-b960-a64682f73ae6'
  AND attorney_id IS NULL
  AND state_code IS NULL
  AND is_active = true
  AND is_default = true
  AND template_id <> '202b5740-5e33-4d1f-9915-9e58cde4d705';

UPDATE public.docusign_template_mappings
SET template_name = 'Retainer Contract - Lerner & Rowe',
    template_type = 'retainer',
    is_default = true,
    priority = 10,
    is_active = true,
    updated_at = now()
WHERE lawyer_requirement_id = '55cae776-e7cf-4335-b960-a64682f73ae6'
  AND attorney_id IS NULL
  AND state_code IS NULL
  AND template_id = '202b5740-5e33-4d1f-9915-9e58cde4d705';

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
  '55cae776-e7cf-4335-b960-a64682f73ae6',
  NULL,
  '202b5740-5e33-4d1f-9915-9e58cde4d705',
  'Retainer Contract - Lerner & Rowe',
  'retainer',
  true,
  10,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.docusign_template_mappings dtm
  WHERE dtm.lawyer_requirement_id = '55cae776-e7cf-4335-b960-a64682f73ae6'
    AND dtm.attorney_id IS NULL
    AND dtm.state_code IS NULL
    AND dtm.template_id = '202b5740-5e33-4d1f-9915-9e58cde4d705'
);
