-- The URL and JWT are provisioned separately in Supabase Vault and never committed.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'hirova-daily-job-sync';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

-- 01:15 UTC = 06:45 IST every day.
select cron.schedule(
  'hirova-daily-job-sync',
  '15 1 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'hirova_project_url') || '/functions/v1/sync-jobs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'hirova_anon_jwt')
      ),
      body := jsonb_build_object('scheduled', true, 'requested_at', now()),
      timeout_milliseconds := 120000
    ) as request_id;
  $job$
);
