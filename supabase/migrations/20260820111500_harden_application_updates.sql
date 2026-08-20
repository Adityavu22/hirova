-- Keep application identity immutable and evaluate one UPDATE policy per request.
create or replace function public.protect_job_application_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.candidate_id <> old.candidate_id
    or new.recruiter_job_id is distinct from old.recruiter_job_id
    or new.external_job_id <> old.external_job_id then
    raise exception 'Application identity cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_job_application_identity on public.job_applications;
create trigger protect_job_application_identity
before update on public.job_applications
for each row execute function public.protect_job_application_identity();

drop policy if exists "Candidates update external application tracking" on public.job_applications;
drop policy if exists "Recruiters update applications for their jobs" on public.job_applications;

create policy "Candidates or receiving recruiters update applications"
on public.job_applications for update to authenticated
using (
  (candidate_id = (select auth.uid()) and recruiter_job_id is null)
  or exists (
    select 1 from public.recruiter_jobs j
    where j.id = job_applications.recruiter_job_id
      and j.recruiter_id = (select auth.uid())
  )
)
with check (
  (candidate_id = (select auth.uid()) and recruiter_job_id is null)
  or exists (
    select 1 from public.recruiter_jobs j
    where j.id = job_applications.recruiter_job_id
      and j.recruiter_id = (select auth.uid())
  )
);
