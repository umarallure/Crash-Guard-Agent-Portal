-- Fix lead assignment RPCs for databases that already applied the initial
-- assignment migration before the timestamp variable patch.

create or replace function public.current_user_is_super_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  has_role boolean := false;
begin
  if current_user_id is null then
    return false;
  end if;

  select exists (
    select 1
    from public.app_users au
    where au.user_id = current_user_id
      and (
        au.is_super_admin = true
        or au.role = 'super_admin'
      )
  )
  into has_role;

  if has_role then
    return true;
  end if;

  if to_regclass('public.user_roles') is not null then
    execute $query$
      select exists (
        select 1
        from public.user_roles ur
        where ur.user_id = $1
          and ur.role = 'super_admin'
          and coalesce(ur.is_active, true) = true
      )
    $query$
    into has_role
    using current_user_id;
  end if;

  return coalesce(has_role, false);
end;
$$;

create or replace function public.assign_lead_to_agent(
  p_lead_id uuid,
  p_agent_user_id uuid
)
returns table (
  lead_id uuid,
  assigned_agent_id uuid,
  assigned_agent_by uuid,
  assigned_agent_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_submission_id text;
  assignment_timestamp timestamp with time zone := now();
begin
  if actor_id is null or not public.current_user_is_super_admin() then
    raise exception 'Only super admin accounts can assign leads.'
      using errcode = '42501';
  end if;

  if p_agent_user_id is null then
    raise exception 'A licensed agent user_id is required.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.agent_status ast
    where ast.user_id = p_agent_user_id
      and ast.agent_type = 'licensed'
  ) then
    raise exception 'Target user is not a licensed agent.'
      using errcode = '22023';
  end if;

  update public.leads l
  set
    assigned_agent_id = p_agent_user_id,
    assigned_agent_by = actor_id,
    assigned_agent_at = assignment_timestamp
  where l.id = p_lead_id
  returning
    l.id,
    l.submission_id,
    l.assigned_agent_id,
    l.assigned_agent_by,
    l.assigned_agent_at
  into
    lead_id,
    target_submission_id,
    assigned_agent_id,
    assigned_agent_by,
    assigned_agent_at;

  if not found then
    raise exception 'Lead not found.'
      using errcode = 'P0002';
  end if;

  if target_submission_id is not null and btrim(target_submission_id) <> '' then
    with latest_row as (
      select ddf.id
      from public.daily_deal_flow ddf
      where ddf.submission_id = target_submission_id
      order by
        ddf.updated_at desc nulls last,
        ddf.created_at desc nulls last,
        ddf.date desc nulls last,
        ddf.id desc
      limit 1
    )
    update public.daily_deal_flow ddf
    set
      assigned_agent_id = p_agent_user_id,
      assigned_agent_by = actor_id,
      assigned_agent_at = assignment_timestamp
    where ddf.id in (select id from latest_row);
  end if;

  return next;
end;
$$;

grant execute on function public.current_user_is_super_admin() to authenticated;
grant execute on function public.assign_lead_to_agent(uuid, uuid) to authenticated;
