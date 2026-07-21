-- Store Aloware recording metadata while keeping Aloware as the audio host.
-- Recording URLs are intentionally accessible only through an authenticated
-- Edge Function; browser clients receive no direct table privileges.

create table if not exists public.aloware_call_recordings (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique
    check (char_length(source_key) between 1 and 300),
  aloware_communication_id text
    check (aloware_communication_id is null or char_length(aloware_communication_id) <= 128),
  aloware_contact_id text
    check (aloware_contact_id is null or char_length(aloware_contact_id) <= 128),
  aloware_company_id text
    check (aloware_company_id is null or char_length(aloware_company_id) <= 128),
  phone_e164 text not null check (phone_e164 ~ '^\+1[0-9]{10}$'),
  recording_url text not null
    check (char_length(recording_url) <= 8192 and recording_url ~* '^https://'),
  direction text not null default 'unknown'
    check (direction in ('inbound', 'outbound', 'unknown')),
  status text check (status is null or char_length(status) <= 255),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  started_at timestamp with time zone not null,
  source_started_at text not null check (char_length(source_started_at) <= 64),
  source_timezone text not null check (char_length(source_timezone) <= 100),
  agent_id text check (agent_id is null or char_length(agent_id) <= 128),
  agent_name text check (agent_name is null or char_length(agent_name) <= 500),
  received_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_aloware_call_recordings_phone_started_at
  on public.aloware_call_recordings (phone_e164, started_at desc, id desc);

create index if not exists idx_aloware_call_recordings_communication_id
  on public.aloware_call_recordings (aloware_communication_id)
  where aloware_communication_id is not null;

alter table public.aloware_call_recordings enable row level security;

revoke all on table public.aloware_call_recordings from public, anon, authenticated;
-- PostgreSQL UPSERT requires SELECT on its conflict target in addition to
-- INSERT and UPDATE. These privileges remain server-only.
grant select, insert, update on table public.aloware_call_recordings to service_role;

-- Expose one narrowly scoped read path. The caller's Supabase JWT supplies
-- auth.uid(); the function verifies a portal admin role before reading
-- the service-only table. This keeps the browser-facing Edge Function off the
-- service role while retaining server-side phone matching and pagination.
create or replace function public.get_lead_call_recordings_page(
  p_submission_id text,
  p_cursor_started_at timestamp with time zone default null,
  p_cursor_id uuid default null,
  p_limit integer default 26
)
returns table (
  recording_id uuid,
  direction text,
  call_status text,
  duration_seconds integer,
  started_at timestamp with time zone,
  agent_name text,
  recording_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_submission_id text := btrim(coalesce(p_submission_id, ''));
  lead_phone text;
  phone_digits text;
  normalized_phone text;
  effective_limit integer;
  caller_is_admin boolean := false;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.app_users au
    where au.user_id = actor_id
      and (
        au.is_super_admin = true
        or lower(btrim(coalesce(au.role, ''))) in ('admin', 'super_admin')
      )
  )
  into caller_is_admin;

  if not caller_is_admin then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  if normalized_submission_id = '' or char_length(normalized_submission_id) > 200 then
    raise exception 'A valid submission ID is required.' using errcode = '22023';
  end if;

  if (p_cursor_started_at is null) <> (p_cursor_id is null) then
    raise exception 'Both cursor values are required.' using errcode = '22023';
  end if;

  effective_limit := least(greatest(coalesce(p_limit, 26), 1), 101);

  select l.phone_number
  into lead_phone
  from public.leads l
  where l.submission_id = normalized_submission_id;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  phone_digits := regexp_replace(coalesce(lead_phone, ''), '[^0-9]', '', 'g');
  if char_length(phone_digits) = 10 then
    normalized_phone := '+1' || phone_digits;
  elsif char_length(phone_digits) = 11 and left(phone_digits, 1) = '1' then
    normalized_phone := '+' || phone_digits;
  else
    raise exception 'Lead has no valid US phone number.' using errcode = '22023';
  end if;

  return query
  select
    r.id,
    r.direction,
    r.status,
    r.duration_seconds,
    r.started_at,
    r.agent_name,
    r.recording_url
  from public.aloware_call_recordings r
  where r.phone_e164 = normalized_phone
    and (
      p_cursor_started_at is null
      or (r.started_at, r.id) < (p_cursor_started_at, p_cursor_id)
    )
  order by r.started_at desc, r.id desc
  limit effective_limit;
end;
$$;

revoke execute on function public.get_lead_call_recordings_page(text, timestamp with time zone, uuid, integer)
  from public, anon;
grant execute on function public.get_lead_call_recordings_page(text, timestamp with time zone, uuid, integer)
  to authenticated;

comment on table public.aloware_call_recordings is
  'Service-only index of Aloware-hosted call recording metadata.';

comment on function public.get_lead_call_recordings_page(text, timestamp with time zone, uuid, integer) is
  'Admin-only, keyset-paginated access to Aloware recording metadata for one lead submission.';
