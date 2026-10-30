-- ASMaP: keep each graduate's alumni year and last class. Safe to run more than once.
-- The Close year wizard works without this, but then the alumni year is only kept in the class label ("ALUMNI 2027").
alter table public.students add column if not exists alumni_year text;
alter table public.students add column if not exists last_class text;
