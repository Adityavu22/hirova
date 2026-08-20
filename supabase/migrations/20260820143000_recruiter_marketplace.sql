-- 1. Account type is stored in a protected table; client metadata is never trusted for authorization.
create table public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('job_seeker', 'recruiter')),
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_profiles enable row level security;
revoke all on public.account_profiles from public, anon, authenticated;
grant select, insert, update on public.account_profiles to authenticated;

create policy "Members read their account profile"
on public.account_profiles for select to authenticated
using (user_id = (select auth.uid()));

create policy "Members create their account profile"
on public.account_profiles for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Members update their account profile"
on public.account_profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- 2. A recruiter owns one company workspace in this release.
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  website text,
  industry text not null default '',
  location text not null default '',
  description text not null default '',
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_website_https check (website is null or website ~ '^https://')
);

create index companies_owner_user_id_idx on public.companies (owner_user_id);
alter table public.companies enable row level security;
revoke all on public.companies from public, anon, authenticated;
grant select, insert, update, delete on public.companies to authenticated;

create policy "Signed-in members read company profiles"
on public.companies for select to authenticated
using (true);

create policy "Recruiters create their company"
on public.companies for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and exists (
    select 1 from public.account_profiles p
    where p.user_id = (select auth.uid()) and p.account_type = 'recruiter'
  )
);

create policy "Recruiters update their company"
on public.companies for update to authenticated
using (owner_user_id = (select auth.uid()))
with check (
  owner_user_id = (select auth.uid())
  and exists (
    select 1 from public.account_profiles p
    where p.user_id = (select auth.uid()) and p.account_type = 'recruiter'
  )
);

create policy "Recruiters delete their company"
on public.companies for delete to authenticated
using (owner_user_id = (select auth.uid()));

-- 3. Recruiter jobs retain ownership and lifecycle data separate from imported listings.
create table public.recruiter_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  recruiter_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 160),
  location text not null check (char_length(trim(location)) between 2 and 160),
  mode text not null check (mode in ('Remote', 'Hybrid', 'On-site')),
  employment_type text not null default 'Full-time'
    check (employment_type in ('Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary')),
  experience text not null default 'See listing',
  salary text not null default 'Salary not disclosed',
  description text not null check (char_length(trim(description)) between 40 and 6000),
  responsibilities text[] not null default '{}',
  skills text[] not null default '{}',
  benefits text[] not null default '{}',
  apply_url text not null check (apply_url ~ '^https://'),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  published_at timestamptz,
  expires_at timestamptz not null default (now() + interval '45 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruiter_jobs_expiry_after_creation check (expires_at > created_at)
);

create index recruiter_jobs_recruiter_created_idx on public.recruiter_jobs (recruiter_id, created_at desc);
create index recruiter_jobs_company_status_idx on public.recruiter_jobs (company_id, status);
create index recruiter_jobs_published_idx on public.recruiter_jobs (published_at desc)
where status = 'published';

alter table public.recruiter_jobs enable row level security;
revoke all on public.recruiter_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.recruiter_jobs to authenticated;

create policy "Members read published jobs or their own drafts"
on public.recruiter_jobs for select to authenticated
using (
  (status = 'published' and expires_at > now())
  or recruiter_id = (select auth.uid())
);

create policy "Recruiters create company jobs"
on public.recruiter_jobs for insert to authenticated
with check (
  recruiter_id = (select auth.uid())
  and exists (
    select 1 from public.companies c
    join public.account_profiles p on p.user_id = c.owner_user_id
    where c.id = company_id
      and c.owner_user_id = (select auth.uid())
      and p.account_type = 'recruiter'
  )
);

create policy "Recruiters update their jobs"
on public.recruiter_jobs for update to authenticated
using (recruiter_id = (select auth.uid()))
with check (
  recruiter_id = (select auth.uid())
  and exists (
    select 1 from public.companies c
    join public.account_profiles p on p.user_id = c.owner_user_id
    where c.id = company_id
      and c.owner_user_id = (select auth.uid())
      and p.account_type = 'recruiter'
  )
);

create policy "Recruiters delete their jobs"
on public.recruiter_jobs for delete to authenticated
using (recruiter_id = (select auth.uid()));

-- 4. Published recruiter listings are mirrored into the same safe search index as employer feeds.
alter table public.job_market
  add column origin text not null default 'aggregated' check (origin in ('aggregated', 'recruiter')),
  add column recruiter_job_id uuid unique references public.recruiter_jobs(id) on delete cascade,
  add column expires_at timestamptz;

create index job_market_origin_active_idx on public.job_market (origin, active, posted_at desc);

create or replace function public.sync_recruiter_job_to_market()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_name text;
  effective_published_at timestamptz;
begin
  if tg_op = 'DELETE' then
    delete from public.job_market where recruiter_job_id = old.id;
    return old;
  end if;

  select c.name into company_name from public.companies c where c.id = new.company_id;
  effective_published_at := coalesce(new.published_at, now());

  if new.status <> 'published' then
    delete from public.job_market where recruiter_job_id = new.id;
    return new;
  end if;

  insert into public.job_market (
    id, title, company, location, salary, mode, experience, match, logo, color,
    posted, posted_at, skills, missing, why, description, responsibilities,
    benefits, applicants, source, source_url, employment_type, active,
    last_seen_at, ingested_at, origin, recruiter_job_id, expires_at
  ) values (
    'hirova:' || new.id::text, new.title, company_name, new.location, new.salary,
    new.mode, new.experience, 70, upper(left(company_name, 1)), 'blue',
    'Today', effective_published_at, to_jsonb(new.skills), '[]'::jsonb,
    'Direct listing published by a recruiter on Hirova. Review the complete role requirements before applying.',
    new.description, to_jsonb(new.responsibilities), to_jsonb(new.benefits), 0,
    company_name || ' · Hirova', new.apply_url, new.employment_type, new.expires_at > now(),
    now(), now(), 'recruiter', new.id, new.expires_at
  )
  on conflict (id) do update set
    title = excluded.title,
    company = excluded.company,
    location = excluded.location,
    salary = excluded.salary,
    mode = excluded.mode,
    experience = excluded.experience,
    logo = excluded.logo,
    posted_at = excluded.posted_at,
    skills = excluded.skills,
    description = excluded.description,
    responsibilities = excluded.responsibilities,
    benefits = excluded.benefits,
    source = excluded.source,
    source_url = excluded.source_url,
    employment_type = excluded.employment_type,
    active = excluded.active,
    last_seen_at = excluded.last_seen_at,
    ingested_at = excluded.ingested_at,
    expires_at = excluded.expires_at;

  return new;
end;
$$;

revoke all on function public.sync_recruiter_job_to_market() from public, anon, authenticated;

create trigger recruiter_jobs_market_sync
after insert or update or delete on public.recruiter_jobs
for each row execute function public.sync_recruiter_job_to_market();

-- 5. Search includes fresh imported jobs and unexpired recruiter listings, while guest results omit application URLs.
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
      and (j.origin = 'recruiter' or j.last_seen_at >= now() - interval '72 hours')
      and (j.expires_at is null or j.expires_at > now())
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
    select * from filtered order by posted_at desc
    limit least(greatest(p_limit, 1), 250) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(to_jsonb(p) - 'search_document') from paged p), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'marketTotal', (
      select count(*) from public.job_market
      where active
        and (origin = 'recruiter' or last_seen_at >= now() - interval '72 hours')
        and (expires_at is null or expires_at > now())
    ),
    'updatedAt', (select max(ingested_at) from public.job_market)
  );
$$;

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
      and (j.origin = 'recruiter' or j.last_seen_at >= now() - interval '72 hours')
      and (j.expires_at is null or j.expires_at > now())
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
    select * from filtered order by posted_at desc
    limit least(greatest(p_limit, 1), 250) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'marketTotal', (
      select count(*) from public.job_market
      where active
        and (origin = 'recruiter' or last_seen_at >= now() - interval '72 hours')
        and (expires_at is null or expires_at > now())
    ),
    'updatedAt', (select max(ingested_at) from public.job_market)
  );
$$;

revoke all on function public.search_job_market(text, text, text, integer, integer) from public;
grant execute on function public.search_job_market(text, text, text, integer, integer) to authenticated;
revoke all on function public.search_public_job_market(text, text, text, integer, integer) from public;
grant execute on function public.search_public_job_market(text, text, text, integer, integer) to anon, authenticated;

-- 6. Anonymous search can read only non-sensitive indexed columns; source_url stays unavailable.
revoke all on public.job_market from anon;
grant select (
  id, title, company, location, salary, mode, experience, match, logo, color,
  posted, posted_at, skills, missing, why, description, responsibilities, benefits,
  applicants, source, employment_type, active, last_seen_at, ingested_at,
  search_document, origin, expires_at
) on public.job_market to anon;

drop policy if exists "Public can read current job listings" on public.job_market;
create policy "Public can read current job listings"
on public.job_market for select to anon, authenticated
using (
  active
  and (origin = 'recruiter' or last_seen_at >= now() - interval '72 hours')
  and (expires_at is null or expires_at > now())
);
