-- ASMaP RESET FOR A FRESH START (run in the Supabase SQL Editor)
-- Deletes ALL students and every record about them: payments, allocations, instalments, allowances, fines, attendance,
-- lesson-log records, scores, conduct, prefect reports, PTA meetings and attendance, and the parent-portal guess log.
-- It also clears the teacher list, carried-forward arrears and the automatic "PTA Fines" / "Arrears" payment purposes.
-- IT CANNOT BE UNDONE. Download a Full Backup from the app (Home or Settings -> "Full Backup") BEFORE running it.
--
-- KEEPS: staff logins, school profile and settings, fee schedule and payment purposes, classes, periods, academic years,
--        the timetable, archives, the audit log, and the teacher corrections and phone numbers you entered.
--        (To also clear those, remove the two "--" marks in PART 3.)

-- PART 1: records and students (one all-or-nothing step: if anything fails, nothing is deleted)
do $$
declare t text;
begin
  foreach t in array array['portal_attempts','payment_allocations','payment_installments','payments','allowances','student_charges',
                           'lesson_attendance','ext_decisions','attendance','prefect_reports',
                           'scores','behaviour_records','pta_attendance','pta_meetings'] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where true', t);
    end if;
  end loop;
  delete from public.students where true;
end $$;

-- PART 2: the app's teacher list (refill it later with Lesson Log -> Sync teachers) and money leftovers in the settings
update public.app_config set teachers = '[]'::jsonb where key = 'main';
update public.app_config
   set pay_settings = ((coalesce(pay_settings::jsonb, '{}'::jsonb)) - 'arrears' - 'carriedFines')
 where key = 'main';
update public.app_config
   set purposes = (select coalesce(jsonb_agg(p), '[]'::jsonb)
                     from jsonb_array_elements(purposes::jsonb) p
                    where p->>'name' not in ('PTA Fines', 'Arrears'))
 where key = 'main';

-- PART 3 (optional): also forget teacher phone numbers and name corrections. Leave these two lines alone to keep them.
-- update public.app_config set settings = ((settings::jsonb) - 'teacherInfo' - 'teacherAlias') where key = 'main';

-- CHECK: every number below must be 0
select
  (select count(*) from public.students)                                           as students,
  (select count(*) from public.payments)                                           as payments,
  (select count(*) from public.payment_allocations)                                as allocations,
  (select count(*) from public.attendance)                                         as attendance,
  (select count(*) from public.lesson_attendance)                                  as lesson_records,
  (select jsonb_array_length(teachers::jsonb) from public.app_config where key = 'main') as teachers;
