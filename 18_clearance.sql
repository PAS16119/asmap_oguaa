-- ASMaP clearance, part 1: the database itself enforces the ticks the admin gives a superintendent (viewer).
-- Run AFTER 09_lockdown.sql, 14 and 16. NOT tested against your database: run it on a copy first, then log in as
-- a viewer with only "Extended Teaching" ticked and confirm Payments, Ledger and Attendance still open.
-- To undo: re-run 09_lockdown.sql, then 14 and 16 (they rebuild the policies).
-- Before this, any viewer could read allowances, the audit log, scores and attendance whatever was ticked,
-- because the database checked only the role "viewer", not the ticks.

create or replace function public.has_perm(p text) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and is_active and p = any(permissions)) $$;
revoke all on function public.has_perm(text) from public, anon;
grant execute on function public.has_perm(text) to authenticated;

create or replace function public.has_any_perm(p text[]) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and is_active and permissions && p) $$;
revoke all on function public.has_any_perm(text[]) from public, anon;
grant execute on function public.has_any_perm(text[]) to authenticated;

-- Allowances (teacher pay): admin, or a viewer ticked for Payroll summary
drop policy if exists r_allowances on public.allowances;
create policy r_allowances on public.allowances for select to authenticated
  using (public.my_role() = 'admin' or (public.my_role() = 'viewer' and public.has_perm('payroll')));

-- Audit log: admin, or a viewer ticked for Audit trail
drop policy if exists r_audit_log on public.audit_log;
create policy r_audit_log on public.audit_log for select to authenticated
  using (public.my_role() = 'admin' or (public.my_role() = 'viewer' and public.has_perm('audit')));

-- Scores: a viewer needs Reports & charts
drop policy if exists r_scores on public.scores;
create policy r_scores on public.scores for select to authenticated
  using (public.my_role() = any(array['admin','form_master','hod'])
         or (public.my_role() = 'viewer' and public.has_perm('reports')));

-- Teacher attendance: a viewer needs Attendance records, Payroll summary or Reports & charts
drop policy if exists r_attendance on public.attendance;
create policy r_attendance on public.attendance for select to authenticated
  using (public.my_role() = any(array['admin','coordinator','supervisor','hod','critical_friend'])
         or (public.my_role() = 'viewer' and public.has_any_perm(array['attendance','payroll','reports'])));
