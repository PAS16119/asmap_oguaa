-- ASMaP Phase 1A: profiles table for Supabase Auth login
-- Run once in Supabase > SQL Editor. Safe to re-run.
-- Nothing in the live app reads this table until the new index.html is deployed.

create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  legacy_id            text unique not null,   -- the old users.id; other tables (recorded_by, prefect_id...) point to this
  username             text unique not null,
  full_name            text not null default '',
  role                 text not null default 'viewer',
  assigned_classes     text[] not null default '{}',
  permissions          text[] not null default '{}',
  phone                text not null default '',
  dept                 text not null default '',
  house                text not null default '',
  teacher_link         text not null default '',
  is_active            boolean not null default true,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Helper used by policies (security definer so it can read profiles without recursion)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Everyone signed in can read their own profile; admins can read all.
-- No insert/update/delete policies on purpose: changes go through the admin-users Edge Function.
drop policy if exists "profiles read own"       on public.profiles;
drop policy if exists "profiles admin read all" on public.profiles;
create policy "profiles read own"       on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles admin read all" on public.profiles for select to authenticated using (public.is_admin());

-- Lets a user clear their own "must change password" flag, and nothing else.
create or replace function public.clear_must_change()
returns void
language sql security definer set search_path = public
as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;
revoke all on function public.clear_must_change() from public, anon;
grant execute on function public.clear_must_change() to authenticated;
