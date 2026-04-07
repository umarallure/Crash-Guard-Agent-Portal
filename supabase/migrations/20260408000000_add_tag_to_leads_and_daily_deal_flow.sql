alter table public.leads
add column if not exists tag text;

alter table public.daily_deal_flow
add column if not exists tag text;

create index if not exists idx_leads_tag on public.leads using btree (tag);
create index if not exists idx_daily_deal_flow_tag on public.daily_deal_flow using btree (tag);
