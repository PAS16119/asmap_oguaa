-- ASMaP: lets people ticked "can record" enter lessons for the last 14 days (for copying from paper logs).
-- Class prefects can still only enter today, and only for their own class.
drop policy if exists la_upd on public.lesson_attendance;
create policy la_upd on public.lesson_attendance for update to authenticated
  using (public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and (
          ('lesson_log' = any(p.permissions) and lesson_attendance.att_date >= current_date - 14)
       or (p.role = 'class_prefect' and lesson_attendance.att_date = current_date and ('ttclass:' || lesson_attendance.class_id) = any(p.permissions)))))
  with check (public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and (
          ('lesson_log' = any(p.permissions) and lesson_attendance.att_date >= current_date - 14)
       or (p.role = 'class_prefect' and lesson_attendance.att_date = current_date and ('ttclass:' || lesson_attendance.class_id) = any(p.permissions)))));
