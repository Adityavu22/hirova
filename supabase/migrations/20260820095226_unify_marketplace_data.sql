-- 1. Candidate-owned structured data is consolidated in Supabase.
create table public.candidate_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  phone text not null default '',
  headline text not null default '',
  location text not null default '',
  career_level text not null default 'early'
    check (career_level in ('intern', 'early', 'mid', 'senior')),
  experience_years text not null default '',
  bio text not null default '',
  skills text[] not null default '{}',
  preferred_roles text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  expected_salary text not null default '',
  notice_period text not null default '',
  open_to_work boolean not null default true,
  profile_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.saved_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table public.resume_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_key text not null unique,
  filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  score smallint not null check (score between 0 and 100),
  skills text[] not null default '{}',
  uploaded_at timestamptz not null default now()
);

create index resume_records_user_uploaded_idx
on public.resume_records (user_id, uploaded_at desc);

-- 2. Recruiter jobs support native applications and normalized discovery fields.
alter table public.recruiter_jobs
  alter column apply_url drop not null,
  add column category text not null default 'Other',
  add column min_experience_years smallint,
  add column max_experience_years smallint,
  add column career_level text not null default 'early'
    check (career_level in ('intern', 'early', 'mid', 'senior')),
  add column application_method text not null default 'native'
    check (application_method in ('native', 'external', 'both')),
  add column closing_at timestamptz;

alter table public.recruiter_jobs
  drop constraint if exists recruiter_jobs_apply_url_check;

alter table public.recruiter_jobs
  add constraint recruiter_jobs_experience_range_check
    check (
      (min_experience_years is null or min_experience_years between 0 and 60)
      and (max_experience_years is null or max_experience_years between 0 and 60)
      and (min_experience_years is null or max_experience_years is null or min_experience_years <= max_experience_years)
    ),
  add constraint recruiter_jobs_application_destination_check
    check (
      (application_method = 'native' and apply_url is null)
      or (application_method in ('external', 'both') and apply_url ~ '^https://')
    );

alter table public.job_market
  add column category text not null default 'Other',
  add column min_experience_years smallint,
  add column max_experience_years smallint,
  add column career_level text not null default 'early'
    check (career_level in ('intern', 'early', 'mid', 'senior')),
  add column experience_confidence text not null default 'low'
    check (experience_confidence in ('low', 'medium', 'high')),
  add column application_method text not null default 'external'
    check (application_method in ('native', 'external', 'both'));

update public.job_market
set
  min_experience_years = case
    when experience ~* '[0-9]+' then ((regexp_match(experience, '([0-9]+)'))[1])::smallint
    when title ~* '\m(intern|internship|trainee)\M' then 0
    else null
  end,
  max_experience_years = case
    when experience ~* '[0-9]+\s*[-–]\s*[0-9]+' then ((regexp_match(experience, '[0-9]+\s*[-–]\s*([0-9]+)'))[1])::smallint
    else null
  end,
  career_level = case
    when employment_type = 'Internship' or title ~* '\m(intern|internship|trainee)\M' then 'intern'
    when title ~* '\m(principal|director|head|staff|lead|vp|vice president)\M' then 'senior'
    when title ~* '\m(senior|manager)\M' then 'mid'
    when experience ~* '([1-4])\s*(?:\+|[-–]|to|years)' then 'early'
    when experience ~* '([5-9]|10)\s*(?:\+|[-–]|to|years)' then 'mid'
    when experience ~* '(1[1-9]|[2-9][0-9])\s*(?:\+|[-–]|to|years)' then 'senior'
    else 'early'
  end,
  experience_confidence = case
    when experience ~* '[0-9]+' then 'high'
    when title ~* '\m(intern|internship|trainee|junior|associate|senior|manager|lead|staff|principal|director|head|vp)\M' then 'medium'
    else 'low'
  end,
  category = case
    when title ~* '(software|developer|engineer|devops|cloud|security|data|machine learning|ai)' then 'Technology'
    when title ~* '(product manager|product owner)' then 'Product'
    when title ~* '(designer|design|ux|ui)' then 'Design'
    when title ~* '(sales|business development|account executive)' then 'Sales'
    when title ~* '(marketing|growth|content|brand)' then 'Marketing'
    when title ~* '(finance|accountant|audit|tax)' then 'Finance'
    when title ~* '(human resources|recruiter|talent|people)' then 'Human Resources'
    when title ~* '(operations|supply chain|customer support|customer success)' then 'Operations'
    else 'Other'
  end;

create index job_market_discovery_idx
on public.job_market (active, posted_at desc, career_level, category);

-- 3. One application record supports native Hirova applications and external tracking.
create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references auth.users(id) on delete cascade,
  recruiter_job_id uuid references public.recruiter_jobs(id) on delete cascade,
  external_job_id text not null,
  status text not null default 'Applied'
    check (status in ('Applied', 'Screening', 'Interview', 'Offer', 'Rejected', 'Withdrawn')),
  cover_note text not null default '' check (char_length(cover_note) <= 3000),
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, external_job_id)
);

create index job_applications_candidate_applied_idx
on public.job_applications (candidate_id, applied_at desc);

create index job_applications_recruiter_job_status_idx
on public.job_applications (recruiter_job_id, status, applied_at desc)
where recruiter_job_id is not null;

create table public.application_notes (
  application_id uuid primary key references public.job_applications(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 2000),
  updated_at timestamptz not null default now()
);

create index application_notes_candidate_idx on public.application_notes (candidate_id);

create table public.job_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  query text not null default '',
  location text not null default '',
  company text not null default '',
  category text not null default '',
  career_level text not null default 'All',
  work_mode text not null default 'All',
  employment_type text not null default 'All',
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index job_alerts_user_enabled_idx on public.job_alerts (user_id, enabled);

-- 4. Every exposed table uses owner- or relationship-scoped RLS.
alter table public.candidate_profiles enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.resume_records enable row level security;
alter table public.job_applications enable row level security;
alter table public.application_notes enable row level security;
alter table public.job_alerts enable row level security;

revoke all on public.candidate_profiles, public.saved_jobs, public.resume_records,
  public.job_applications, public.application_notes, public.job_alerts
from public, anon, authenticated;

grant select, insert, update on public.candidate_profiles to authenticated;
grant select, insert, delete on public.saved_jobs to authenticated;
grant select, insert, delete on public.resume_records to authenticated;
grant select, insert, update on public.job_applications to authenticated;
grant select, insert, update, delete on public.application_notes to authenticated;
grant select, insert, update, delete on public.job_alerts to authenticated;

create policy "Candidates read their profile or applicants are visible to the receiving recruiter"
on public.candidate_profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.job_applications a
    join public.recruiter_jobs j on j.id = a.recruiter_job_id
    where a.candidate_id = candidate_profiles.user_id
      and j.recruiter_id = (select auth.uid())
  )
);

create policy "Candidates create their profile"
on public.candidate_profiles for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Candidates update their profile"
on public.candidate_profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Candidates manage their saved jobs"
on public.saved_jobs for select to authenticated
using (user_id = (select auth.uid()));
create policy "Candidates save jobs"
on public.saved_jobs for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "Candidates remove saved jobs"
on public.saved_jobs for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Resume owners and receiving recruiters read resume metadata"
on public.resume_records for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.job_applications a
    join public.recruiter_jobs j on j.id = a.recruiter_job_id
    where a.candidate_id = resume_records.user_id
      and j.recruiter_id = (select auth.uid())
  )
);
create policy "Candidates add resume metadata"
on public.resume_records for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "Candidates remove resume metadata"
on public.resume_records for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Candidates and receiving recruiters read applications"
on public.job_applications for select to authenticated
using (
  candidate_id = (select auth.uid())
  or exists (
    select 1 from public.recruiter_jobs j
    where j.id = job_applications.recruiter_job_id
      and j.recruiter_id = (select auth.uid())
  )
);

create policy "Candidates create applications"
on public.job_applications for insert to authenticated
with check (
  candidate_id = (select auth.uid())
  and (
    recruiter_job_id is null
    or exists (
      select 1 from public.recruiter_jobs j
      where j.id = recruiter_job_id
        and j.status = 'published'
        and j.expires_at > now()
        and (j.closing_at is null or j.closing_at > now())
    )
  )
);

create policy "Candidates update external application tracking"
on public.job_applications for update to authenticated
using (candidate_id = (select auth.uid()) and recruiter_job_id is null)
with check (candidate_id = (select auth.uid()) and recruiter_job_id is null);

create policy "Recruiters update applications for their jobs"
on public.job_applications for update to authenticated
using (
  exists (
    select 1 from public.recruiter_jobs j
    where j.id = job_applications.recruiter_job_id
      and j.recruiter_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.recruiter_jobs j
    where j.id = job_applications.recruiter_job_id
      and j.recruiter_id = (select auth.uid())
  )
);

create policy "Candidates manage their application notes"
on public.application_notes for select to authenticated
using (candidate_id = (select auth.uid()));
create policy "Candidates add application notes"
on public.application_notes for insert to authenticated
with check (
  candidate_id = (select auth.uid())
  and exists (
    select 1 from public.job_applications a
    where a.id = application_id and a.candidate_id = (select auth.uid())
  )
);
create policy "Candidates update application notes"
on public.application_notes for update to authenticated
using (candidate_id = (select auth.uid()))
with check (candidate_id = (select auth.uid()));
create policy "Candidates delete application notes"
on public.application_notes for delete to authenticated
using (candidate_id = (select auth.uid()));

create policy "Members manage their alerts"
on public.job_alerts for select to authenticated
using (user_id = (select auth.uid()));
create policy "Members create alerts"
on public.job_alerts for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "Members update alerts"
on public.job_alerts for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy "Members delete alerts"
on public.job_alerts for delete to authenticated
using (user_id = (select auth.uid()));

-- 5. Recruiter listings are mirrored into the market with native-apply metadata.
create or replace function public.sync_recruiter_job_to_market()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_name text;
  effective_published_at timestamptz;
  effective_experience text;
begin
  if tg_op = 'DELETE' then
    delete from public.job_market where recruiter_job_id = old.id;
    return old;
  end if;

  select c.name into company_name from public.companies c where c.id = new.company_id;
  effective_published_at := coalesce(new.published_at, now());
  effective_experience := case
    when new.min_experience_years is null then new.experience
    when new.max_experience_years is null then new.min_experience_years::text || '+ yrs'
    else new.min_experience_years::text || '-' || new.max_experience_years::text || ' yrs'
  end;

  if new.status <> 'published' then
    delete from public.job_market where recruiter_job_id = new.id;
    return new;
  end if;

  insert into public.job_market (
    id, title, company, location, salary, mode, experience, match, logo, color,
    posted, posted_at, skills, missing, why, description, responsibilities,
    benefits, applicants, source, source_url, employment_type, active,
    last_seen_at, ingested_at, origin, recruiter_job_id, expires_at, category,
    min_experience_years, max_experience_years, career_level, experience_confidence,
    application_method
  ) values (
    'hirova:' || new.id::text, new.title, company_name, new.location, new.salary,
    new.mode, effective_experience, 70, upper(left(company_name, 1)), 'blue',
    'Today', effective_published_at, to_jsonb(new.skills), '[]'::jsonb,
    'This role matches your selected preferences and profile evidence.',
    new.description, to_jsonb(new.responsibilities), to_jsonb(new.benefits), 0,
    company_name || ' · Hirova', coalesce(new.apply_url, 'https://hirova.in'),
    new.employment_type,
    new.expires_at > now() and (new.closing_at is null or new.closing_at > now()),
    now(), now(), 'recruiter', new.id, least(new.expires_at, coalesce(new.closing_at, new.expires_at)),
    new.category, new.min_experience_years, new.max_experience_years,
    new.career_level, 'high', new.application_method
  )
  on conflict (id) do update set
    title = excluded.title, company = excluded.company, location = excluded.location,
    salary = excluded.salary, mode = excluded.mode, experience = excluded.experience,
    logo = excluded.logo, posted_at = excluded.posted_at, skills = excluded.skills,
    description = excluded.description, responsibilities = excluded.responsibilities,
    benefits = excluded.benefits, source = excluded.source, source_url = excluded.source_url,
    employment_type = excluded.employment_type, active = excluded.active,
    last_seen_at = excluded.last_seen_at, ingested_at = excluded.ingested_at,
    expires_at = excluded.expires_at, category = excluded.category,
    min_experience_years = excluded.min_experience_years,
    max_experience_years = excluded.max_experience_years,
    career_level = excluded.career_level,
    experience_confidence = excluded.experience_confidence,
    application_method = excluded.application_method;

  return new;
end;
$$;

revoke all on function public.sync_recruiter_job_to_market() from public, anon, authenticated;

-- 6. Versioned search functions expose production filters while keeping application URLs private for guests.
create or replace function public.search_job_market_v2(
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
  with filtered as (
    select j.*,
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
    select * from public.job_market j
    where j.active and (j.origin = 'recruiter' or j.last_seen_at >= now() - interval '72 hours')
      and (j.expires_at is null or j.expires_at > now()) and j.posted_at >= now() - interval '30 days'
  )
  select jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(to_jsonb(p) - 'search_document' - 'relevance') from paged p), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'marketTotal', (select count(*) from active_market),
    'companies', coalesce((select jsonb_agg(company order by count desc, company) from (select company, count(*) from active_market group by company order by count(*) desc limit 100) c), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(category order by count desc, category) from (select category, count(*) from active_market group by category order by count(*) desc) c), '[]'::jsonb),
    'updatedAt', (select max(ingested_at) from active_market)
  );
$$;

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
  with filtered as (
    select
      j.id, j.title, j.company, j.location, j.salary, j.mode, j.experience, j.match,
      j.logo, j.color, j.posted, j.posted_at, j.skills, j.missing, j.why,
      j.description, j.responsibilities, j.benefits, j.applicants, j.source,
      j.employment_type, j.ingested_at, j.origin, j.recruiter_job_id, j.expires_at,
      j.category, j.min_experience_years, j.max_experience_years, j.career_level,
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
    select * from public.job_market j
    where j.active and (j.origin = 'recruiter' or j.last_seen_at >= now() - interval '72 hours')
      and (j.expires_at is null or j.expires_at > now()) and j.posted_at >= now() - interval '30 days'
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

revoke all on function public.search_job_market_v2(text, text, text, text, text, text, text, integer, text, integer, integer) from public;
grant execute on function public.search_job_market_v2(text, text, text, text, text, text, text, integer, text, integer, integer) to authenticated;
revoke all on function public.search_public_job_market_v2(text, text, text, text, text, text, text, integer, text, integer, integer) from public;
grant execute on function public.search_public_job_market_v2(text, text, text, text, text, text, text, integer, text, integer, integer) to anon, authenticated;

grant select (
  id, title, company, location, salary, mode, experience, match, logo, color,
  posted, posted_at, skills, missing, why, description, responsibilities, benefits,
  applicants, source, employment_type, active, last_seen_at, ingested_at,
  search_document, origin, recruiter_job_id, expires_at, category,
  min_experience_years, max_experience_years, career_level, experience_confidence,
  application_method
) on public.job_market to anon;
