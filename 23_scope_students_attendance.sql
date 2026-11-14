-- ASMaP clearance, part 5: the database now limits (a) who can read student records and (b) who can read teacher attendance.
-- Run AFTER 18, 20 and 22. It REPLACES the two attendance policies from 22 with class-aware ones.
-- NOT tested against your real database: run on a copy first. Then log in as each kind of person and confirm the
-- checklist at the bottom of this file. Rollback (paste if anything breaks) is also at the bottom.
--
-- Before this, any logged-in role could read EVERY student record, including date of birth, health notes, parent
-- phone numbers and portal PINs, and a supervisor could read every teacher-attendance row in the school.
--
-- Student records, who can read which rows:
--   admin                                        all
--   coordinator, form master, class prefect,
--   PTA prefect                                  students in their assigned classes
--   house master, senior house master            students in their own house
--   superintendent                               all, but only if ticked for money or Reports and charts
--   anyone given the PTA permission              all (the PTA screen needs the whole roll)
--   everyone else (supervisor, HOD, critical friend, PTA executive without the permission)   none
-- Updating a student follows the same rows. Adding students is unchanged. Deleting is admin only (unchanged).
--
-- Teacher attendance, who can read and write which rows:
--   admin, HOD                                   all
--   coordinator                                  all, unless marked "Money collector only" (from 22)
--   supervisor                                   only their assigned classes
--   critical friend                              only the records they recorded themselves
--   superintendent                               all, if ticked for Attendance records, Payroll summary or Reports

create or replace function public.my_house() returns text language sql stable security definer set search_path = public as
$$ select house from public.profiles where id = auth.uid() and is_active $$;
revoke all on function public.my_house() from public, anon;
grant execute on function public.my_house() to authenticated;

create or replace function public.can_read_student(cls text, hse text) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(
     case public.my_role()
       when 'admin'           then true
       when 'coordinator'     then cls = any(public.my_classes())
       when 'form_master'     then cls = any(public.my_classes())
       when 'class_prefect'   then cls = any(public.my_classes())
       when 'pta_prefect'     then cls = any(public.my_classes())
       when 'house_master'    then hse is not null and hse = public.my_house()
       when 'sr_house_master' then hse is not null and hse = public.my_house()
       when 'viewer'          then public.can_see_money() or public.has_perm('reports')
       else false end, false)
   or public.has_perm('pta_manage') $$;
revoke all on function public.can_read_student(text, text) from public, anon;
grant execute on function public.can_read_student(text, text) to authenticated;

drop policy if exists r_students on public.students;
create policy r_students on public.students for select to authenticated
  using (public.can_read_student(class_name, house));

drop policy if exists w_students_upd on public.students;
create policy w_students_upd on public.students for update to authenticated
  using (public.my_role() = 'admin'
         or (public.my_role() = any(array['coordinator','form_master','house_master','sr_house_master']) and public.can_read_student(class_name, house)))
  with check (public.my_role() = 'admin'
         or (public.my_role() = any(array['coordinator','form_master','house_master','sr_house_master']) and public.can_read_student(class_name, house)));

drop policy if exists r_attendance on public.attendance;
create policy r_attendance on public.attendance for select to authenticated using (
  public.my_role() = any(array['admin','hod'])
  or (public.my_role() = 'supervisor' and class_name = any(public.my_classes()))
  or (public.my_role() = 'critical_friend' and recorded_by = public.my_legacy_id())
  or (public.my_role() = 'coordinator' and not public.has_perm('no_attendance'))
  or (public.my_role() = 'viewer' and public.has_any_perm(array['attendance','payroll','reports'])));

drop policy if exists w_attendance on public.attendance;
create policy w_attendance on public.attendance for all to authenticated
  using (public.my_role() = any(array['admin','hod'])
         or (public.my_role() = 'supervisor' and class_name = any(public.my_classes()))
         or (public.my_role() = 'critical_friend' and recorded_by = public.my_legacy_id())
         or (public.my_role() = 'coordinator' and not public.has_perm('no_attendance')))
  with check (public.my_role() = any(array['admin','hod'])
         or (public.my_role() = 'supervisor' and class_name = any(public.my_classes()))
         or (public.my_role() = 'critical_friend' and recorded_by = public.my_legacy_id())
         or (public.my_role() = 'coordinator' and not public.has_perm('no_attendance')));

-- CHECKLIST after running (log in as each):
--   form master      Scores and Conduct list only their own class's students
--   house master     Conduct lists only their own house
--   coordinator      Payments, Ledger and the student picker show only their classes
--   superintendent   Ledger lists students (money tick or Reports tick); one with neither sees none
--   supervisor       Attendance shows only their classes and the Mark form offers only their classes
--   HOD              Attendance shows every record
--   critical friend  Attendance shows only the records they recorded
--
-- ROLLBACK (paste if anything breaks):
--   drop policy if exists r_students on public.students;
--   create policy r_students on public.students for select to authenticated using (public.my_role() is not null);
--   drop policy if exists w_students_upd on public.students;
--   create policy w_students_upd on public.students for update to authenticated
--     using (public.my_role() = any(array['admin','coordinator','form_master','house_master','sr_house_master']))
--     with check (public.my_role() = any(array['admin','coordinator','form_master','house_master','sr_house_master']));
--   then re-run 22_attendance_clearance.sql
