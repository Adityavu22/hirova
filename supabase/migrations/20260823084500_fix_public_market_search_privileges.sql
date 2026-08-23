-- 1. Keep the privileged implementation outside the exposed Data API schema.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.search_public_job_market_v2_impl(
  p_query text default '', p_location text default '', p_mode text default 'All',
  p_company text default '', p_category text default 'All', p_career_level text default 'All',
  p_employment_type text default 'All', p_posted_within_days integer default 30,
  p_sort text default 'relevance', p_limit integer default 60, p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select
      j.id, j.title, j.company, j.location, j.salary, j.mode, j.experience, j.match,
      j.logo, j.color, j.posted, j.posted_at, j.skills, j.missing, j.why,
      j.description, j.responsibilities, j.benefits, j.applicants, j.source,
      j.employment_type, j.ingested_at, j.origin, j.expires_at, j.category,
      j.min_experience_years, j.max_experience_years, j.career_level,
      j.experience_confidence, j.application_method,
      case when nullif(trim(p_query), '') is null then 0
        else ts_rank(j.search_document, websearch_to_tsquery('simple', trim(p_query))) end as relevance
    from public.job_market j
    where j.active
      and (j.origin = 'recruiter' or j.last_seen_at >= now() - interval '72 hours')
      and (j.expires_at is null or j.expires_at > now())
      and j.posted_at >= now() - make_interval(days => least(greatest(p_posted_within_days, 1), 30))
      and (nullif(trim(p_query), '') is null or j.search_document @@ websearch_to_tsquery('simple', trim(p_query)))
      and (
        nullif(trim(p_location), '') is null or j.location ilike '%' || trim(p_location) || '%'
        or (lower(trim(p_location)) in ('in', 'india') and j.location ~* '(india|bengaluru|bangalore|mumbai|delhi|noida|gurugram|gurgaon|hyderabad|pune|chennai|kolkata|ahmedabad|jaipur|kochi|cochin|chandigarh|indore)')
        or (lower(trim(p_location)) like '%remote%' and j.mode = 'Remote')
      )
      and (p_mode = 'All' or j.mode = p_mode)
      and (nullif(trim(p_company), '') is null or j.company ilike trim(p_company))
      and (p_category = 'All' or j.category = p_category)
      and (p_career_level = 'All' or j.career_level = p_career_level)
      and (p_employment_type = 'All' or j.employment_type = p_employment_type)
  ),
  paged as (
    select * from filtered
    order by case when p_sort = 'relevance' then relevance else 0 end desc, posted_at desc
    limit least(greatest(p_limit, 1), 250) offset greatest(p_offset, 0)
  ),
  active_market as (
    select j.company, j.category, j.ingested_at
    from public.job_market j
    where j.active and (j.origin = 'recruiter' or j.last_seen_at >= now() - interval '72 hours')
      and (j.expires_at is null or j.expires_at > now())
      and j.posted_at >= now() - interval '30 days'
  )
  select jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(to_jsonb(p) - 'relevance') from paged p), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'marketTotal', (select count(*) from active_market),
    'companies', coalesce((select jsonb_agg(company order by count desc, company) from (select company, count(*) from active_market group by company order by count(*) desc limit 100) c), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(category order by count desc, category) from (select category, count(*) from active_market group by category order by count(*) desc) c), '[]'::jsonb),
    'updatedAt', (select max(ingested_at) from active_market)
  );
$$;

revoke all on function private.search_public_job_market_v2_impl(text, text, text, text, text, text, text, integer, text, integer, integer) from public;
grant execute on function private.search_public_job_market_v2_impl(text, text, text, text, text, text, text, integer, text, integer, integer) to anon, authenticated;

-- 2. Expose an invoker wrapper only; the backing table remains unavailable to anon.
create or replace function public.search_public_job_market_v2(
  p_query text default '', p_location text default '', p_mode text default 'All',
  p_company text default '', p_category text default 'All', p_career_level text default 'All',
  p_employment_type text default 'All', p_posted_within_days integer default 30,
  p_sort text default 'relevance', p_limit integer default 60, p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.search_public_job_market_v2_impl(
    p_query, p_location, p_mode, p_company, p_category, p_career_level,
    p_employment_type, p_posted_within_days, p_sort, p_limit, p_offset
  );
$$;

revoke all on public.job_market from anon;
revoke all on function public.search_public_job_market_v2(text, text, text, text, text, text, text, integer, text, integer, integer) from public;
grant execute on function public.search_public_job_market_v2(text, text, text, text, text, text, text, integer, text, integer, integer) to anon, authenticated;
