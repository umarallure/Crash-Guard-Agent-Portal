-- The production project authorizes portal users exclusively through
-- public.app_users. Replace the recordings RPC to remove the stale
-- public.user_roles dependency while keeping authorization fail-closed.

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

comment on function public.get_lead_call_recordings_page(text, timestamp with time zone, uuid, integer) is
  'Admin-only, keyset-paginated Aloware recording access authorized by app_users.';
