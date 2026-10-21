-- ASMaP: timetable + lesson attendance. Run once in Supabase > SQL Editor.
create table if not exists public.timetable (
  id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.lesson_attendance (
  id text primary key, att_date date not null, class_id text not null, subject_id text not null, period int not null,
  teacher_ids jsonb not null default '[]', status text not null check (status in ('present','late','absent','cover','no_lesson')),
  minutes_late int not null default 0, cover_teacher_id text, students_present int, students_total int,
  note text not null default '', recorded_by text not null default '', recorded_at timestamptz not null default now());
create index if not exists lesson_att_idx on public.lesson_attendance (att_date, class_id);
alter table public.timetable enable row level security;
alter table public.lesson_attendance enable row level security;
drop policy if exists tt_read on public.timetable; drop policy if exists tt_admin on public.timetable;
create policy tt_read on public.timetable for select to authenticated using (true);
create policy tt_admin on public.timetable for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists la_read on public.lesson_attendance; drop policy if exists la_ins on public.lesson_attendance;
drop policy if exists la_upd on public.lesson_attendance; drop policy if exists la_del on public.lesson_attendance;
create policy la_read on public.lesson_attendance for select to authenticated using (true);
create policy la_ins on public.lesson_attendance for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role in ('admin','class_prefect')));
create policy la_upd on public.lesson_attendance for update to authenticated
  using (public.is_admin() or att_date = current_date) with check (public.is_admin() or att_date = current_date);
create policy la_del on public.lesson_attendance for delete to authenticated using (public.is_admin());
