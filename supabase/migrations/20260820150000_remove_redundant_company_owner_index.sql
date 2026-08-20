-- The unique owner constraint already provides an index for company ownership lookups.
drop index if exists public.companies_owner_user_id_idx;
