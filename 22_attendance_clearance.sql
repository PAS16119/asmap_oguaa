-- ASMaP clearance, part 4: some coordinators ONLY collect money and must not touch teacher attendance.
-- Run AFTER 18 (it needs has_perm / has_any_perm). Safe: it only replaces the two attendance policies.
-- NOT tested against your real database: run on a copy first, then log in as a money-only coordinator and
-- confirm the Attendance tab is gone, and as a normal coordinator and confirm Attendance still works.
-- To undo: re-run 18_clearance.sql (it rebuilds r_attendance) and, for write access, 09_lockdown.sql's w_attendance line.
--
-- The admin marks a coordinator "Money collector only" in the user form; that stores the permission 'no_attendance'.
-- A coordinator without that permission keeps attendance exactly as before.

drop policy if exists r_attendance on public.attendance;
create policy r_attendance on public.attendance for select to authenticated using (
  public.my_role() = any(array['admin','supervisor','hod','critical_friend'])
  or (public.my_role() = 'coordinator' and not public.has_perm('no_attendance'))
  or (public.my_role() = 'viewer' and public.has_any_perm(array['attendance','payroll','reports'])));

drop policy if exists w_attendance on public.attendance;
create policy w_attendance on public.attendance for all to authenticated
  using (public.my_role() = any(array['admin','supervisor','hod','critical_friend'])
         or (public.my_role() = 'coordinator' and not public.has_perm('no_attendance')))
  with check (public.my_role() = any(array['admin','supervisor','hod','critical_friend'])
         or (public.my_role() = 'coordinator' and not public.has_perm('no_attendance')));
