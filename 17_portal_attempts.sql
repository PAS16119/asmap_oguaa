-- ASMaP parent portal: remembers wrong date-of-birth guesses so they can be limited for each student.
-- Safe to run more than once. Nobody can read or write this table from the browser; only the portal-data function can.
create table if not exists public.portal_attempts (
  id bigserial primary key,
  student_id text not null,
  ip text not null default '',
  kind text not null default 'dob_fail',
  ts timestamptz not null default now()
);
create index if not exists portal_attempts_student_idx on public.portal_attempts (student_id, kind, ts);
alter table public.portal_attempts enable row level security;   -- no policies on purpose
-- Optional tidy-up of old rows (run now and then):  delete from public.portal_attempts where ts < now() - interval '3 days';
