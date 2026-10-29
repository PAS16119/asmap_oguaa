-- ASMaP ROLLBACK for 09_lockdown.sql. Run this ONLY if something breaks after the lockdown; it reopens the tables.
do $$
declare t text; p record;
begin
  foreach t in array array['students','app_config','payments','payment_allocations','payment_installments','allowances','attendance','scores','behaviour_records','prefect_reports','pta_meetings','pta_attendance','audit_log'] loop
    if to_regclass('public.' || t) is not null then
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
      end loop;
      execute format('create policy open_all on public.%I for all using (true) with check (true)', t);
    end if;
  end loop;
end $$;
