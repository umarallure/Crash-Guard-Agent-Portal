create or replace function public.normalize_portal_status(raw_status text)
returns text
language plpgsql
as $$
declare
  normalized text;
begin
  if raw_status is null or btrim(raw_status) = '' then
    return null;
  end if;

  select ps.key
  into normalized
  from public.portal_stages ps
  where ps.label = raw_status
  order by ps.is_active desc, ps.display_order asc
  limit 1;

  return coalesce(normalized, raw_status);
end;
$$;

create or replace function public.pick_lead_status_for_submission(target_submission_id text)
returns text
language plpgsql
as $$
declare
  chosen_status text;
begin
  if target_submission_id is null or btrim(target_submission_id) = '' then
    return null;
  end if;

  select public.normalize_portal_status(ddf.status)
  into chosen_status
  from public.daily_deal_flow ddf
  where ddf.submission_id = target_submission_id
  order by
    case
      when lower(trim(coalesce(ddf.call_result, ''))) = 'qualified' then 0
      else 1
    end,
    ddf.updated_at desc nulls last,
    ddf.created_at desc nulls last,
    ddf.date desc nulls last,
    ddf.id desc
  limit 1;

  if chosen_status is not null then
    return chosen_status;
  end if;

  select public.normalize_portal_status(cr.status)
  into chosen_status
  from public.call_results cr
  where cr.submission_id = target_submission_id
  order by
    cr.updated_at desc nulls last,
    cr.created_at desc nulls last,
    cr.id desc
  limit 1;

  return chosen_status;
end;
$$;

create or replace function public.sync_leads_status_for_submission(target_submission_id text)
returns void
language plpgsql
as $$
declare
  chosen_status text;
begin
  if target_submission_id is null or btrim(target_submission_id) = '' then
    return;
  end if;

  chosen_status := public.pick_lead_status_for_submission(target_submission_id);

  update public.leads
  set status = chosen_status
  where submission_id = target_submission_id;
end;
$$;

create or replace function public.handle_daily_deal_flow_status_sync()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_leads_status_for_submission(coalesce(new.submission_id, old.submission_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_leads_status_from_daily_deal_flow on public.daily_deal_flow;

create trigger trg_sync_leads_status_from_daily_deal_flow
after insert or update or delete
on public.daily_deal_flow
for each row
execute function public.handle_daily_deal_flow_status_sync();

create or replace function public.handle_call_results_status_sync()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_leads_status_for_submission(coalesce(new.submission_id, old.submission_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_leads_status_from_call_results on public.call_results;

create trigger trg_sync_leads_status_from_call_results
after insert or update or delete
on public.call_results
for each row
execute function public.handle_call_results_status_sync();
