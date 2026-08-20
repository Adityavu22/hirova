-- Company identity changes are propagated to every active recruiter listing.
create or replace function public.refresh_company_market_listings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    update public.recruiter_jobs
    set updated_at = now()
    where company_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_company_market_listings() from public, anon, authenticated;

create trigger companies_market_refresh
after update of name on public.companies
for each row execute function public.refresh_company_market_listings();
