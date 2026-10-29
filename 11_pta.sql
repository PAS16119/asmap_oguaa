-- ASMaP: PTA targeting, absence fines, admin-picked PTA access. Run once.
create or replace function public.has_perm(p text) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and is_active and p = any(permissions)) $$;
revoke all on function public.has_perm(text) from public, anon;
grant execute on function public.has_perm(text) to authenticated;

alter table public.pta_meetings add column if not exists target_classes text[] not null default '{}';
alter table public.pta_meetings add column if not exists fine_amount numeric not null default 0;
alter table public.pta_meetings add column if not exists fines_applied boolean not null default false;

create table if not exists public.student_charges (
  id text primary key, student_id text, student_name text not null, class_name text not null default '',
  kind text not null default 'pta_fine', meeting_id text, amount numeric not null default 0, note text not null default '',
  waived boolean not null default false, waived_by text, created_by text not null default '', created_at timestamptz not null default now());
create index if not exists student_charges_student_idx on public.student_charges (student_name, class_name);
alter table public.student_charges enable row level security;
drop policy if exists sc_read on public.student_charges; drop policy if exists sc_ins on public.student_charges; drop policy if exists sc_upd on public.student_charges;
create policy sc_read on public.student_charges for select to authenticated using (
  public.is_admin() or public.has_perm('pta_manage')
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active
       and ((p.role = 'coordinator' and student_charges.class_name = any(p.assigned_classes))
         or (p.role = 'viewer' and p.permissions && array['et','tm','project','totals','ledger']))));
create policy sc_ins on public.student_charges for insert to authenticated with check (public.is_admin() or public.has_perm('pta_manage'));
create policy sc_upd on public.student_charges for update to authenticated using (public.is_admin()) with check (public.is_admin());
