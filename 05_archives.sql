-- ASMaP: academic-year archives. Run once in Supabase > SQL Editor, BEFORE using Year Rollover.
create table if not exists public.archives (
  id         text primary key,
  year_name  text not null,
  created_at timestamptz not null default now(),
  created_by text not null default '',
  counts     jsonb not null default '{}',
  data       jsonb not null default '{}'
);
alter table public.archives enable row level security;
drop policy if exists "archives admin all" on public.archives;
create policy "archives admin all" on public.archives for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
