-- Shared "paid once" record for the ASMaP parent portal and the transcript system (GHS 12 per semester, charged once).
-- Safe to run more than once. Run in Supabase -> SQL Editor AFTER 09_lockdown.sql (it uses my_role()).
--   key      = child's name (words sorted, capitals) + "|" + date of birth (YYYY-MM-DD). Same child -> same key in both systems.
--   semester = same label the portal uses, e.g. 2026_2027_T1
create table if not exists public.portal_access (
  id bigserial primary key,
  key text not null,
  semester text not null,
  source text not null default 'office',      -- office | transcript | asmap
  reference text not null default '',
  amount_ghs numeric not null default 0,
  student_ref text not null default '',
  created_at timestamptz not null default now(),
  unique (key, semester)
);
alter table public.portal_access enable row level security;
drop policy if exists portal_access_admin on public.portal_access;
create policy portal_access_admin on public.portal_access for all to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');
revoke all on table public.portal_access from anon;
grant select, insert, update on table public.portal_access to authenticated;
grant usage, select on sequence public.portal_access_id_seq to authenticated;
-- The transcript app (database owner) and the portal-data function (service key) bypass these rules by design.
