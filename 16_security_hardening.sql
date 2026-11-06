-- ASMaP security hardening. Run AFTER 09_lockdown.sql and 14_coordinator_visibility.sql.
-- NOT tested against your database: run it first on a copy if you can, then log in as each role and try the normal jobs.
-- Each numbered part is independent. To undo any part, re-run 09_lockdown.sql (it rebuilds the original policies).

-- 1. COORDINATORS CAN RECORD PAYMENTS BUT CANNOT APPROVE, EDIT, DELETE OR ALLOCATE THEM.
--    (Before this, the approval step was only enforced in the app screen, not in the database.)
do $$
declare t text;
begin
  foreach t in array array['payments','payment_allocations','payment_installments'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists w_money on public.%I', t);
    execute format('drop policy if exists w_money_admin on public.%I', t);
    execute format('create policy w_money_admin on public.%I for all to authenticated using (public.my_role() = ''admin'') with check (public.my_role() = ''admin'')', t);
  end loop;
end $$;
drop policy if exists w_pay_coord_ins on public.payments;
create policy w_pay_coord_ins on public.payments for insert to authenticated
  with check (public.my_role() = 'coordinator' and class_name = any(public.my_classes()) and approval_status = 'pending');
drop policy if exists w_inst_coord_ins on public.payment_installments;
create policy w_inst_coord_ins on public.payment_installments for insert to authenticated
  with check (public.my_role() = 'coordinator' and class_name = any(public.my_classes()));

-- 2. ONLY THE ADMIN CAN DELETE STUDENTS (other staff can still add and edit them).
drop policy if exists w_students on public.students;
drop policy if exists w_students_ins on public.students;
drop policy if exists w_students_upd on public.students;
drop policy if exists w_students_del on public.students;
create policy w_students_ins on public.students for insert to authenticated
  with check (public.my_role() = any(array['admin','coordinator','form_master','house_master','sr_house_master']));
create policy w_students_upd on public.students for update to authenticated
  using (public.my_role() = any(array['admin','coordinator','form_master','house_master','sr_house_master']))
  with check (public.my_role() = any(array['admin','coordinator','form_master','house_master','sr_house_master']));
create policy w_students_del on public.students for delete to authenticated using (public.my_role() = 'admin');

-- 3. THE AUDIT LOG CANNOT BE EDITED OR ERASED BY ANYONE (it can only be added to).
--    Side effect: "Go live" in the app can no longer clear the audit log. Clear it from the SQL Editor if you want it empty.
drop policy if exists w_audit_log on public.audit_log;
