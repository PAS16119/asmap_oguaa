-- ASMaP Phase 1D: run ONLY after the new index.html is live and you have logged in
-- successfully as admin AND as at least one non-admin role.

-- 1. Lock the legacy users table (the new app no longer reads it).
alter table public.users enable row level security;

-- 2. Remove the plain-text passwords for good.
update public.users set password = null;
alter table public.users alter column password drop not null;

-- Check: should show rls_on = true for users
select relname, relrowsecurity as rls_on from pg_class
where relname in ('users','profiles') and relnamespace = 'public'::regnamespace;
