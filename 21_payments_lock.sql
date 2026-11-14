-- ASMaP clearance, part 3b: THE LOCK. Run this LAST, and only when ALL of these are true:
--   1. 19 and 20 have been run.
--   2. index.html build 11Nov-d (or later) is live.
--   3. In Settings > Clearance the readiness line says every confirmed payment has its split recorded
--      (otherwise those payments would show as nothing to coordinators and superintendents).
--   4. You have logged in as a coordinator and as a superintendent and their Payments, Ledger and Home all load
--      (they now read through payments_cleared), and a coordinator can still record a payment.
-- NOT tested against your real database. Run on a copy first.
--
-- What it does: only the admin can read the payments and payment_installments tables, where each payment's WHOLE
-- amount lives. Coordinators and superintendents read the cleared view (20) instead. Coordinators can still record
-- payments: the app saves them without reading them back.
--
-- ROLLBACK (paste if anything breaks):
--   drop policy if exists r_money on public.payments;
--   create policy r_money on public.payments for select to authenticated using (
--     public.my_role() = 'admin' or (public.my_role() = 'coordinator' and class_name = any(public.my_classes())) or public.can_see_money());
--   drop policy if exists r_money on public.payment_installments;
--   create policy r_money on public.payment_installments for select to authenticated using (
--     public.my_role() = 'admin' or (public.my_role() = 'coordinator' and class_name = any(public.my_classes())) or public.can_see_money());

drop policy if exists r_money on public.payments;
create policy r_money on public.payments for select to authenticated using (public.my_role() = 'admin');

drop policy if exists r_money on public.payment_installments;
create policy r_money on public.payment_installments for select to authenticated using (public.my_role() = 'admin');
