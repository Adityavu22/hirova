-- 1. Keep scheduler telemetry service-only while making the deny rule explicit.
create policy "Deny public access to job sync telemetry"
on public.job_sync_runs
for all
to anon, authenticated
using (false)
with check (false);
