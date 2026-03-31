begin;

with ranked as (
  select
    ddf.submission_id,
    ddf.status,
    ddf.call_result,
    ddf.updated_at,
    ddf.created_at,
    ddf.date,
    ddf.id,
    row_number() over (
      partition by ddf.submission_id
      order by
        case
          when lower(trim(coalesce(ddf.call_result, ''))) = 'qualified' then 0
          else 1
        end,
        ddf.updated_at desc nulls last,
        ddf.created_at desc nulls last,
        ddf.date desc nulls last,
        ddf.id desc
    ) as rn
  from daily_deal_flow ddf
  join (
    select submission_id
    from daily_deal_flow
    where submission_id is not null
    group by submission_id
    having count(*) > 1
  ) dup
    on dup.submission_id = ddf.submission_id
),
chosen as (
  select
    r.submission_id,
    case
      when coalesce(
        (
          select ps.key
          from portal_stages ps
          where ps.label = r.status
          order by ps.is_active desc, ps.display_order asc
          limit 1
        ),
        r.status
      ) = 'document_signed_api' then 'retainer_signed'
      else coalesce(
        (
          select ps.key
          from portal_stages ps
          where ps.label = r.status
          order by ps.is_active desc, ps.display_order asc
          limit 1
        ),
        r.status
      )
    end as normalized_status
  from ranked r
  where r.rn = 1
)
update leads l
set status = c.normalized_status
from chosen c
where l.submission_id = c.submission_id
  and l.submission_id is not null;

commit;
