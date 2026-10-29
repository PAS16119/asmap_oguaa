-- ASMaP: extended teaching decisions (admin chooses between prefect and monitor records). Run once.
create table if not exists public.ext_decisions (
  id text primary key, att_date date, teacher text, chosen text not null,
  decided_by text not null default '', decided_at timestamptz not null default now());
alter table public.ext_decisions enable row level security;
drop policy if exists ext_read on public.ext_decisions; drop policy if exists ext_admin on public.ext_decisions;
create policy ext_read on public.ext_decisions for select to authenticated using (true);
create policy ext_admin on public.ext_decisions for all to authenticated using (public.is_admin()) with check (public.is_admin());
