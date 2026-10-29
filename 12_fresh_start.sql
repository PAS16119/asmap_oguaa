-- ASMaP FRESH START. Deletes ALL students, teachers (the app's teacher list) and ALL money, attendance,
-- score, conduct, PTA and lesson records. It cannot be undone. Take your backups first.
-- KEEPS: staff logins, school profile and settings, payment purposes, periods, academic years,
--        the timetable, archives, the audit log, and everything about how the app works.
do $$
declare t text;
begin
  -- 1. money and records that belong to students (children first)
  foreach t in array array['payment_allocations','payment_installments','payments','allowances','student_charges',
                           'lesson_attendance','ext_decisions','attendance','prefect_reports',
                           'scores','behaviour_records','pta_attendance','pta_meetings'] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where true', t);
    end if;
  end loop;
  -- 2. the students
  if to_regclass('public.students') is not null then delete from public.students where true; end if;
  -- 3. the app's teacher list (the timetable is untouched; use Lesson Log > Sync teachers to refill it)
  update public.app_config set teachers = '[]'::jsonb where key = 'main';
end $$;

-- Check: every number below must be 0
select
  (select count(*) from public.students)           as students,
  (select count(*) from public.payments)           as payments,
  (select count(*) from public.attendance)         as attendance,
  (select count(*) from public.lesson_attendance)  as lesson_records,
  (select jsonb_array_length(teachers) from public.app_config where key = 'main') as teachers;
