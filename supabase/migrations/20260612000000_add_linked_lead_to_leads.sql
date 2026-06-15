-- Link leads to each other (e.g. a passenger lead created from a driver lead)
-- so driver + passenger retainers from the same accident can be tracked together.
alter table public.leads
  add column if not exists linked_lead_id uuid null
    references public.leads(id) on delete set null,
  add column if not exists linked_relationship text null;

-- Both columns are brand new (all rows null), so the check is safe to add directly.
alter table public.leads
  add constraint leads_linked_relationship_check
  check (linked_relationship is null or linked_relationship in ('passenger', 'driver'));

-- Reverse lookups: find all leads linked to a given lead.
create index if not exists idx_leads_linked_lead_id
  on public.leads using btree (linked_lead_id)
  where linked_lead_id is not null;

comment on column public.leads.linked_lead_id is
  'Self-reference to the originating lead (e.g. the driver lead this passenger lead was created from). NULL when standalone.';
comment on column public.leads.linked_relationship is
  'Role of THIS lead relative to the linked lead: passenger | driver.';
