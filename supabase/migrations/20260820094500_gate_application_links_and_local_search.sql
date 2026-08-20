-- 1. Anonymous visitors search listings through a restricted RPC and cannot read application URLs directly.
revoke select on public.job_market from anon;
grant select on public.job_market to authenticated;
revoke execute on function public.search_job_market(text, text, text, integer, integer) from anon;
grant execute on function public.search_job_market(text, text, text, integer, integer) to authenticated;

-- 2. Signed-in search returns the full listing and recognises common Indian city names for an India search.
create or replace function public.search_job_market(
  p_query text default '',
  p_location text default '',
  p_mode text default 'All',
  p_limit integer default 60,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select j.*
    from public.job_market j
    where j.active
      and j.last_seen_at >= now() - interval '72 hours'
      and (
        nullif(trim(p_query), '') is null
        or j.search_document @@ websearch_to_tsquery('simple', trim(p_query))
      )
      and (
        nullif(trim(p_location), '') is null
        or j.location ilike '%' || trim(p_location) || '%'
        or (
          lower(trim(p_location)) in ('in', 'india')
          and j.location ~* '(india|bengaluru|bangalore|mumbai|delhi|noida|gurugram|gurgaon|hyderabad|pune|chennai|kolkata|ahmedabad|jaipur|kochi|cochin|chandigarh|indore)'
        )
        or (lower(trim(p_location)) like '%remote%' and j.mode = 'Remote')
      )
      and (p_mode = 'All' or j.mode = p_mode)
  ),
  paged as (
    select * from filtered
    order by posted_at desc
    limit least(greatest(p_limit, 1), 250)
    offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(to_jsonb(p) - 'search_document') from paged p), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'marketTotal', (
      select count(*) from public.job_market
      where active and last_seen_at >= now() - interval '72 hours'
    ),
    'updatedAt', (select max(ingested_at) from public.job_market)
  );
$$;

-- 3. Public search exposes useful job details but deliberately omits source_url.
create or replace function public.search_public_job_market(
  p_query text default '',
  p_location text default '',
  p_mode text default 'All',
  p_limit integer default 60,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select j.*
    from public.job_market j
    where j.active
      and j.last_seen_at >= now() - interval '72 hours'
      and (
        nullif(trim(p_query), '') is null
        or j.search_document @@ websearch_to_tsquery('simple', trim(p_query))
      )
      and (
        nullif(trim(p_location), '') is null
        or j.location ilike '%' || trim(p_location) || '%'
        or (
          lower(trim(p_location)) in ('in', 'india')
          and j.location ~* '(india|bengaluru|bangalore|mumbai|delhi|noida|gurugram|gurgaon|hyderabad|pune|chennai|kolkata|ahmedabad|jaipur|kochi|cochin|chandigarh|indore)'
        )
        or (lower(trim(p_location)) like '%remote%' and j.mode = 'Remote')
      )
      and (p_mode = 'All' or j.mode = p_mode)
  ),
  paged as (
    select * from filtered
    order by posted_at desc
    limit least(greatest(p_limit, 1), 250)
    offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(to_jsonb(p) - 'search_document' - 'source_url') from paged p), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'marketTotal', (
      select count(*) from public.job_market
      where active and last_seen_at >= now() - interval '72 hours'
    ),
    'updatedAt', (select max(ingested_at) from public.job_market)
  );
$$;

revoke all on function public.search_public_job_market(text, text, text, integer, integer) from public;
grant execute on function public.search_public_job_market(text, text, text, integer, integer) to anon, authenticated;
