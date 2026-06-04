-- Add a non-payable attorney decision stage after Attorney Approved.
-- This is metadata-only: it never touches lead statuses or other business data.
-- If the next display_order slot is occupied, later active submission stages move
-- forward by one while preserving their existing relative order.
do $$
declare
  v_pipeline constant text := 'submission_portal';
  v_approved_key constant text := 'attorney_approved';
  v_dropped_key constant text := 'attorney_dropped';
  v_payable_key constant text := 'qualified_payable';
  v_approved_order integer;
  v_payable_order integer;
  v_target_order integer;
begin
  perform pg_advisory_xact_lock(hashtext('portal_stages:submission_portal:attorney_dropped'));

  select display_order
  into v_approved_order
  from public.portal_stages
  where pipeline = v_pipeline
    and key = v_approved_key
    and is_active = true
  limit 1;

  select display_order
  into v_payable_order
  from public.portal_stages
  where pipeline = v_pipeline
    and key = v_payable_key
    and is_active = true
  limit 1;

  if v_approved_order is null then
    raise exception 'Cannot add %. Missing active % stage in %.', v_dropped_key, v_approved_key, v_pipeline;
  end if;

  if v_payable_order is null then
    raise exception 'Cannot add %. Missing active % stage in %.', v_dropped_key, v_payable_key, v_pipeline;
  end if;

  if v_payable_order <= v_approved_order then
    raise exception 'Cannot add %. % must be ordered before % in %.', v_dropped_key, v_approved_key, v_payable_key, v_pipeline;
  end if;

  v_target_order := v_approved_order + 1;

  if exists (
    select 1
    from public.portal_stages
    where pipeline = v_pipeline
      and key <> v_dropped_key
      and is_active = true
      and display_order = v_target_order
  ) then
    update public.portal_stages
    set
      display_order = display_order + 1,
      updated_at = now()
    where pipeline = v_pipeline
      and key <> v_dropped_key
      and is_active = true
      and display_order >= v_target_order;
  end if;

  insert into public.portal_stages (
    pipeline,
    key,
    label,
    display_order,
    column_class,
    header_class,
    is_active,
    publisher_portal_stage_view
  )
  values (
    v_pipeline,
    v_dropped_key,
    'Attorney Dropped',
    v_target_order,
    null,
    null,
    true,
    true
  )
  on conflict (pipeline, key) do update
  set
    label = excluded.label,
    display_order = excluded.display_order,
    is_active = true,
    publisher_portal_stage_view = true,
    updated_at = now();
end $$;
