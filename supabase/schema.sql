-- ============================================================
-- Altrium Recruitment Management System — Supabase Schema
-- Run this whole file once in Supabase SQL Editor
-- (Project -> SQL Editor -> New query -> paste -> Run)
-- ============================================================

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. PROFILES  (extends auth.users with app-specific fields)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  role text not null default 'candidate'
    check (role in ('candidate','hr','management','interviewer')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. JOBS
-- ------------------------------------------------------------
create table if not exists public.jobs (
  job_id uuid primary key default gen_random_uuid(),
  title text not null,
  location text,
  description text not null,
  requirements text,
  responsibilities text,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. APPLICATIONS
-- ------------------------------------------------------------
create table if not exists public.applications (
  application_id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (job_id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  full_name text not null,
  nic text not null,
  email text not null,
  cv_path text not null,          -- path inside the "cvs" storage bucket
  status text not null default 'pending'
    check (status in ('pending','shortlisted','interview','rejected','hired')),
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, candidate_id)   -- one application per candidate per job
);

-- ------------------------------------------------------------
-- 4. Helper function: is the current user a staff member?
--    (SECURITY DEFINER avoids infinite RLS recursion on profiles)
-- ------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('hr','management','interviewer')
  );
$$;

create or replace function public.can_manage_jobs()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('hr','management')
  );
$$;

-- ------------------------------------------------------------
-- 5. Row Level Security
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;

-- PROFILES policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Staff can view all profiles"
  on public.profiles for select
  using (public.is_staff());

create policy "Users can insert own profile on signup"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- JOBS policies
create policy "Anyone can view open jobs"
  on public.jobs for select
  using (status = 'open' or public.is_staff());

create policy "HR/Management can insert jobs"
  on public.jobs for insert
  with check (public.can_manage_jobs());

create policy "HR/Management can update jobs"
  on public.jobs for update
  using (public.can_manage_jobs());

create policy "HR/Management can delete jobs"
  on public.jobs for delete
  using (public.can_manage_jobs());

-- APPLICATIONS policies
create policy "Candidates can view own applications"
  on public.applications for select
  using (auth.uid() = candidate_id);

create policy "Staff can view all applications"
  on public.applications for select
  using (public.is_staff());

create policy "Candidates can insert own applications"
  on public.applications for insert
  with check (auth.uid() = candidate_id);

create policy "Staff can update application status"
  on public.applications for update
  using (public.is_staff());

-- ------------------------------------------------------------
-- 6. Storage bucket for CVs (private — accessed via signed URLs)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

-- Candidates can upload into their own folder: cvs/{their-user-id}/...
create policy "Candidates can upload own CV"
  on storage.objects for insert
  with check (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Candidates can view own CV"
  on storage.objects for select
  using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Staff can view all CVs"
  on storage.objects for select
  using (bucket_id = 'cvs' and public.is_staff());

-- ============================================================
-- 7. (Optional) Promote a user to staff — run manually per person
-- After someone registers normally (as a candidate), turn them into
-- HR / Management / Interviewer by running, e.g.:
--
--   update public.profiles set role = 'hr' where email = 'someone@altrium.com';
--
-- ============================================================

-- ============================================================
-- 8. Auto-create a profile row whenever a new auth user signs up
--    (runs server-side, so it never depends on RLS/session timing)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    'candidate'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 9. CV screening / matching support
-- ============================================================
alter table public.applications
  add column if not exists match_score int,
  add column if not exists matched_keywords text[],
  add column if not exists missing_keywords text[];

-- ============================================================
-- 10. Profile photos
-- ============================================================
alter table public.profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone can view avatars (they're public profile photos, shown in a public bucket)
create policy "Avatars are publicly viewable"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Users can only upload/replace their own avatar (stored as {user_id}/avatar.ext)
create policy "Users can upload own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
