-- ASMaP: coordinators see ONLY the purposes the admin allows (default: Extended Teaching).
-- OPTIONAL. Run AFTER 09_lockdown.sql. NOT tested against your database, so run it first on a copy if you can.
-- The admin chooses the purposes in Settings > Fee Schedule ("coordinators may collect"); this enforces it in the database.
create or replace function public.coord_purposes() returns text[] language sql stable security definer set search_path = public as
$$ select coalesce(
     (select array(select jsonb_array_elements_text((pay_settings::jsonb)->'coordPurposes'))
        from public.app_config where key = 'main' and (pay_settings::jsonb) ? 'coordPurposes'),
     array['Extended Teaching']) $$;
revoke all on function public.coord_purposes() from public, anon;
grant execute on function public.coord_purposes() to authenticated;

drop policy if exists r_money on public.payment_allocations;
create policy r_money on public.payment_allocations for select to authenticated using (
  public.my_role() = 'admin'
  or (public.my_role() = 'coordinator' and class_name = any(public.my_classes()) and purpose = any(public.coord_purposes()))
  or public.can_see_money());
