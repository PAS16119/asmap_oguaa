-- ASMaP: Lesson Log v3 (present/absent/not held, times, cover, ratings, class lock). Run once, after 06 and 07.
alter table public.lesson_attendance drop constraint if exists lesson_attendance_status_check;
alter table public.lesson_attendance add constraint lesson_attendance_status_check
  check (status in ('present','late','absent','cover','no_lesson','not_held'));
alter table public.lesson_attendance add column if not exists time_in text;
alter table public.lesson_attendance add column if not exists time_out text;
alter table public.lesson_attendance add column if not exists minutes_used int not null default 0;
alter table public.lesson_attendance add column if not exists covered boolean not null default false;
alter table public.lesson_attendance add column if not exists cover_in text;
alter table public.lesson_attendance add column if not exists cover_out text;
alter table public.lesson_attendance add column if not exists reason text not null default '';
alter table public.lesson_attendance add column if not exists reason_other text not null default '';
alter table public.lesson_attendance add column if not exists rating int check (rating between 1 and 5);
alter table public.lesson_attendance add column if not exists remark text not null default '';

-- Who can read: admin, anyone given 'lesson_reports', and each person's own entries
drop policy if exists la_read on public.lesson_attendance;
create policy la_read on public.lesson_attendance for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active
             and ('lesson_reports' = any(p.permissions) or p.full_name = lesson_attendance.recorded_by)));

-- Who can write: admin, anyone given 'lesson_log', and a class prefect ONLY for their own class (permission 'ttclass:<id>')
drop policy if exists la_ins on public.lesson_attendance;
create policy la_ins on public.lesson_attendance for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active
          and (p.role = 'admin' or 'lesson_log' = any(p.permissions)
               or (p.role = 'class_prefect' and ('ttclass:' || lesson_attendance.class_id) = any(p.permissions)))));
drop policy if exists la_upd on public.lesson_attendance;
create policy la_upd on public.lesson_attendance for update to authenticated
  using (public.is_admin() or (att_date = current_date and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active
          and ('lesson_log' = any(p.permissions) or (p.role = 'class_prefect' and ('ttclass:' || lesson_attendance.class_id) = any(p.permissions))))))
  with check (public.is_admin() or (att_date = current_date and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active
          and ('lesson_log' = any(p.permissions) or (p.role = 'class_prefect' and ('ttclass:' || lesson_attendance.class_id) = any(p.permissions))))));
