-- ASMaP clearance, part 2: clearance is per person, set by the admin, and the database enforces it on payment_allocations.
-- Run AFTER 09, 14, 16 and 18. NOT tested against your database: run it on a copy first, then log in as a coordinator
-- and as a superintendent and check that each sees only the fee purposes ticked for them.
-- To undo: re-run 14_coordinator_visibility.sql (it rebuilds the allocation policy and the old coord_purposes()).
--
-- What the ticks mean (set by the admin in the user form, "Money clearance"):
--   et / tm / project / others  = Extended Teaching / Teacher Motivation / PTA Project / Others
--   pur:<name>                  = any other purpose, e.g. pur:Anniversary Levy
-- A coordinator with NO ticks keeps the school default (Fee Schedule: "coordinators may collect"), as before.
-- A superintendent with NO ticks sees no allocation lines. The 'ledger' permission opens every purpose.
--
-- NOT covered yet: the payments and payment_installments tables hold each payment's WHOLE amount, so a person
-- with any money clearance can still read those rows through the API. Closing that needs the Extended Teaching
-- calculation moved into the database (a function that returns only the permitted lines). That is the next job.

create or replace function public.my_purposes() returns text[] language sql stable security definer set search_path = public as
$$ select array(
     select case t when 'et' then 'Extended Teaching' when 'tm' then 'Teacher Motivation'
                   when 'project' then 'PTA Project' when 'others' then 'Others' else substr(t, 5) end
       from public.profiles p cross join lateral unnest(p.permissions) as t
      where p.id = auth.uid() and p.is_active
        and (t in ('et','tm','project','others') or t like 'pur:%')) $$;
revoke all on function public.my_purposes() from public, anon;
grant execute on function public.my_purposes() to authenticated;

-- Coordinator purposes: the person's own ticks, else the school default
create or replace function public.coord_purposes() returns text[] language sql stable security definer set search_path = public as
$$ select case when cardinality(public.my_purposes()) > 0 then public.my_purposes()
     else coalesce(
       (select array(select jsonb_array_elements_text((pay_settings::jsonb)->'coordPurposes'))
          from public.app_config where key = 'main' and (pay_settings::jsonb) ? 'coordPurposes'),
       array['Extended Teaching']) end $$;
revoke all on function public.coord_purposes() from public, anon;
grant execute on function public.coord_purposes() to authenticated;

-- A superintendent counts as "money" if any purpose, totals or ledger is ticked
create or replace function public.can_see_money() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role = 'viewer'
                  and (p.permissions && array['et','tm','project','others','totals','ledger']
                       or exists (select 1 from unnest(p.permissions) t where t like 'pur:%'))) $$;

-- Allocation lines: admin all; coordinator = own classes + own purposes; superintendent = own purposes (or ledger = all)
drop policy if exists r_money on public.payment_allocations;
create policy r_money on public.payment_allocations for select to authenticated using (
  public.my_role() = 'admin'
  or (public.my_role() = 'coordinator' and class_name = any(public.my_classes()) and purpose = any(public.coord_purposes()))
  or (public.my_role() = 'viewer' and (public.has_perm('ledger') or purpose = any(public.my_purposes()))));
