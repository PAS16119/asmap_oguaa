-- ASMaP LOCKDOWN. Run ONLY AFTER the portal-data function is deployed and the new portal.html is live.
-- Closes every data table to the public key and limits each table to the roles that need it.
-- Student payment records: admin sees all; a coordinator sees only the classes assigned to them;
-- a viewer (superintendent/monitor) sees payments only if given a payment permission.
create or replace function public.my_role() returns text language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() and is_active $$;
create or replace function public.my_classes() returns text[] language sql stable security definer set search_path = public as
$$ select coalesce(assigned_classes, '{}') from public.profiles where id = auth.uid() and is_active $$;
create or replace function public.can_see_money() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and is_active and role = 'viewer'
                  and permissions && array['et','tm','project','totals','ledger']) $$;
revoke all on function public.my_role() from public, anon;
revoke all on function public.my_classes() from public, anon;
revoke all on function public.can_see_money() from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.my_classes() to authenticated;
grant execute on function public.can_see_money() to authenticated;

do $$
declare t text; p record; r record; rd text;
begin
  foreach t in array array['students','app_config','payments','payment_allocations','payment_installments','allowances','attendance','scores','behaviour_records','prefect_reports','pta_meetings','pta_attendance','audit_log'] loop
    if to_regclass('public.' || t) is not null then
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
      end loop;
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;

  -- Student money tables: class-scoped
  foreach t in array array['payments','payment_allocations','payment_installments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('create policy r_money on public.%I for select to authenticated using (public.my_role() = ''admin'' or (public.my_role() = ''coordinator'' and class_name = any(public.my_classes())) or public.can_see_money())', t);
      execute format('create policy w_money on public.%I for all to authenticated using (public.my_role() = ''admin'' or (public.my_role() = ''coordinator'' and class_name = any(public.my_classes()))) with check (public.my_role() = ''admin'' or (public.my_role() = ''coordinator'' and class_name = any(public.my_classes())))', t);
    end if;
  end loop;

  -- Everything else: role-based
  for r in select * from (values
    ('students',          null::text[], array['admin','coordinator','form_master','house_master','sr_house_master']),
    ('app_config',        null, array['admin','coordinator','supervisor','hod','critical_friend','form_master','house_master','sr_house_master','pta_executive']),
    ('allowances',        array['admin','viewer'], array['admin']),
    ('attendance',        array['admin','coordinator','supervisor','hod','critical_friend','viewer'], array['admin','coordinator','supervisor','hod','critical_friend']),
    ('scores',            array['admin','form_master','hod','viewer'], array['admin','form_master']),
    ('behaviour_records', array['admin','house_master','sr_house_master','form_master'], array['admin','house_master','sr_house_master','form_master']),
    ('prefect_reports',   array['admin','class_prefect','hod','critical_friend','supervisor','coordinator'], array['admin','class_prefect','hod','critical_friend','supervisor','coordinator']),
    ('pta_meetings',      array['admin','pta_prefect','pta_executive','coordinator'], array['admin','pta_prefect','pta_executive','coordinator']),
    ('pta_attendance',    array['admin','pta_prefect','pta_executive','coordinator'], array['admin','pta_prefect','pta_executive','coordinator']),
    ('audit_log',         array['admin','viewer'], array['admin'])
  ) as v(tbl, read_roles, write_roles) loop
    if to_regclass('public.' || r.tbl) is null then continue; end if;
    rd := case when r.read_roles is null then 'public.my_role() is not null' else format('public.my_role() = any(%L::text[])', r.read_roles) end;
    execute format('create policy r_%s on public.%I for select to authenticated using (%s)', r.tbl, r.tbl, rd);
    execute format('create policy w_%s on public.%I for all to authenticated using (public.my_role() = any(%L::text[])) with check (public.my_role() = any(%L::text[]))', r.tbl, r.tbl, r.write_roles, r.write_roles);
  end loop;
  if to_regclass('public.audit_log') is not null then
    create policy audit_insert on public.audit_log for insert to authenticated with check (public.my_role() is not null);
  end if;
end $$;
