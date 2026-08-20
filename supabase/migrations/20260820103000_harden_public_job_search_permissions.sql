-- 1. Give anonymous search callers column-level access to job details, excluding source_url.
revoke all on public.job_market from anon;
grant select (
  id, title, company, location, salary, mode, experience, match, logo, color,
  posted, posted_at, skills, missing, why, description, responsibilities, benefits,
  applicants, source, employment_type, active, last_seen_at, ingested_at, search_document
) on public.job_market to anon;

-- 2. Run public search with the caller's privileges so RLS and the column grant both remain effective.
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
security invoker
set search_path = ''
as $$
  with filtered as (
    select
      j.id, j.title, j.company, j.location, j.salary, j.mode, j.experience, j.match,
      j.logo, j.color, j.posted, j.posted_at, j.skills, j.missing, j.why,
      j.description, j.responsibilities, j.benefits, j.applicants, j.source,
      j.employment_type, j.ingested_at
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
    'jobs', coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb),
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
