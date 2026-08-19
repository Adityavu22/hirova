-- 1. Current, source-attributed market jobs. Only the sync worker can mutate rows.
create table public.job_market (
  id text primary key,
  title text not null,
  company text not null,
  location text not null default 'See listing',
  salary text not null default 'Salary not disclosed',
  mode text not null check (mode in ('Remote', 'Hybrid', 'On-site')),
  experience text not null default 'See listing',
  match smallint not null default 70 check (match between 0 and 100),
  logo text not null,
  color text not null,
  posted text not null,
  posted_at timestamptz not null,
  skills jsonb not null default '[]'::jsonb,
  missing jsonb not null default '[]'::jsonb,
  why text not null,
  description text not null,
  responsibilities jsonb not null default '[]'::jsonb,
  benefits jsonb not null default '[]'::jsonb,
  applicants integer not null default 0,
  source text not null,
  source_url text not null,
  employment_type text not null default 'Full-time',
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  search_document tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(company, '') || ' ' ||
      coalesce(location, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(skills::text, '')
    )
  ) stored
);

create index job_market_posted_at_idx on public.job_market (posted_at desc);
create index job_market_source_idx on public.job_market (source);
create index job_market_active_seen_idx on public.job_market (active, last_seen_at desc);
create index job_market_search_idx on public.job_market using gin (search_document);

alter table public.job_market enable row level security;
grant select on public.job_market to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.job_market from anon, authenticated;

create policy "Public can read current job listings"
on public.job_market
for select
to anon, authenticated
using (active and last_seen_at >= now() - interval '72 hours');

-- 2. Sync telemetry is service-only and intentionally has no public RLS policy.
create table public.job_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running', 'succeeded', 'partial', 'failed')),
  jobs_seen integer not null default 0,
  sources_succeeded integer not null default 0,
  sources_failed integer not null default 0,
  error_summary text
);

alter table public.job_sync_runs enable row level security;
revoke all on public.job_sync_runs from anon, authenticated;

-- 3. Public search executes as the caller, so the job_market RLS policy still applies.
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
        or (lower(trim(p_location)) like '%remote%' and j.mode = 'Remote')
      )
      and (p_mode = 'All' or j.mode = p_mode)
  ),
  paged as (
    select *
    from filtered
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

revoke all on function public.search_job_market(text, text, text, integer, integer) from public;
grant execute on function public.search_job_market(text, text, text, integer, integer) to anon, authenticated;
