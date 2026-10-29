-- ASMaP: lesson activity/assessment fields and admin-assigned recorders. Run once in Supabase > SQL Editor (after 06_lessons.sql).
alter table public.lesson_attendance add column if not exists activity text not null default 'taught';
alter table public.lesson_attendance add column if not exists assess_type text not null default '';
drop policy if exists la_ins on public.lesson_attendance;
create policy la_ins on public.lesson_attendance for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active
          and (p.role in ('admin','class_prefect') or 'lesson_log' = any(p.permissions))));
