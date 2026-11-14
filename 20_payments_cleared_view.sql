-- ASMaP clearance, part 3a: a "cleared" view of payments. SAFE to run: it only adds things, it changes no existing rule.
-- Run AFTER 19, and BEFORE deploying index.html build 11Nov-d (or after; the app falls back to the old table until this exists).
--
-- Coordinators and superintendents will read payments through public.payments_cleared instead of public.payments.
-- For them the view shows, per payment, only the amount that sits in the fee purposes they are cleared for
-- (taken from the recorded allocation lines), never the payment's whole amount. Admins see everything, as before.
-- Exceptions that keep the app working:
--   * a superintendent with the 'ledger' permission sees whole amounts (that permission is "all purposes");
--   * a coordinator sees the whole amount of a PENDING payment he recorded himself (he typed it); once the admin
--     confirms it he sees only his cleared share.
-- A confirmed payment with no cleared share is hidden from that person completely.

create or replace function public.my_legacy_id() returns text language sql stable security definer set search_path = public as
$$ select legacy_id::text from public.profiles where id = auth.uid() and is_active $$;
revoke all on function public.my_legacy_id() from public, anon;
grant execute on function public.my_legacy_id() to authenticated;

create or replace function public.money_full() returns boolean language sql stable security definer set search_path = public as
$$ select public.my_role() = 'admin' or (public.my_role() = 'viewer' and public.has_perm('ledger')) $$;
revoke all on function public.money_full() from public, anon;
grant execute on function public.money_full() to authenticated;

create or replace function public.my_money_purposes() returns text[] language sql stable security definer set search_path = public as
$$ select case when public.my_role() = 'coordinator' then public.coord_purposes()
               when public.my_role() = 'viewer' then public.my_purposes()
               else '{}'::text[] end $$;
revoke all on function public.my_money_purposes() from public, anon;
grant execute on function public.my_money_purposes() to authenticated;

drop view if exists public.payments_cleared;
create view public.payments_cleared as
select p.id, p.student_name, p.class_name,
       case when x.raw then p.purpose else ''::text end                 as purpose,
       case when x.raw then p.amount else x.amt end                     as amount,
       case when x.raw then p.raw_amount else x.amt end                 as raw_amount,
       case when x.raw then p.unallocated else 0::numeric end           as unallocated,
       case when x.raw then p.allocation_status else 'settled'::text end as allocation_status,
       p.period, p.date, p.recorded_by, p.recorded_by_name,
       p.approval_status, p.approved_by, p.approval_note, p.created_at
from public.payments p
cross join lateral (
  select (public.money_full() or (p.approval_status <> 'confirmed' and p.recorded_by = public.my_legacy_id())) as raw,
         (select coalesce(sum(a.amount), 0) from public.payment_allocations a
           where a.payment_id = p.id and p.approval_status = 'confirmed'
             and (public.money_full() or a.purpose = any(public.my_money_purposes()))) as amt
) x
where (public.my_role() = 'admin'
       or (public.my_role() = 'viewer' and public.can_see_money())
       or (public.my_role() = 'coordinator' and p.class_name = any(public.my_classes())))
  and (x.raw or p.approval_status <> 'confirmed' or x.amt > 0);

revoke all on public.payments_cleared from public, anon;
grant select on public.payments_cleared to authenticated;
