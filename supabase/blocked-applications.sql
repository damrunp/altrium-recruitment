-- ============================================================
-- Altrium — blocked applications
--
-- A candidate may apply for several roles. The moment they're hired
-- for one, their other applications are blocked: locked, visible, and
-- untouchable by anyone.
--
-- Run once in Supabase SQL Editor, after interviews-schema.sql.
-- Safe to run more than once.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Allow the new status
-- ------------------------------------------------------------
do $$
begin
  alter table public.applications drop constraint if exists applications_status_check;
exception when others then
  null;
end $$;

alter table public.applications
  add constraint applications_status_check
  check (status in ('pending','shortlisted','interview','rejected','hired','blocked'));


-- ------------------------------------------------------------
-- 2. Blocked rows are frozen
-- ------------------------------------------------------------
-- Nothing may change a blocked application except the unblocking
-- routine below, which announces itself with a session flag. That
-- includes HR: the whole point is that the row stops moving.
-- ------------------------------------------------------------

create or replace function public.freeze_blocked_applications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'blocked'
     and coalesce(current_setting('app.unblocking', true), '') <> '1'
  then
    raise exception
      'This application is blocked because the candidate was hired for another role. It cannot be changed.';
  end if;

  return new;
end;
$$;

-- Runs before the hire-eligibility check, so a blocked row is refused
-- outright rather than being evaluated first.
drop trigger if exists applications_freeze_blocked on public.applications;
create trigger applications_freeze_blocked
  before update on public.applications
  for each row execute function public.freeze_blocked_applications();


-- ------------------------------------------------------------
-- 3. Hiring blocks the candidate's other applications
-- ------------------------------------------------------------
-- And reversing a hire unblocks them again, back to pending — HR can
-- then take them wherever they should go. Without this, undoing a hire
-- would leave the other applications frozen forever.
-- ------------------------------------------------------------

create or replace function public.sync_blocked_applications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Newly hired: freeze everything else that's still in play.
  if new.status = 'hired' and coalesce(old.status, '') <> 'hired' then
    perform set_config('app.unblocking', '1', true);

    update public.applications
    set status = 'blocked',
        updated_at = now()
    where candidate_id = new.candidate_id
      and application_id <> new.application_id
      and status not in ('hired', 'blocked', 'rejected');

    perform set_config('app.unblocking', '0', true);
  end if;

  -- Hire reversed: release the others.
  if old.status = 'hired' and new.status <> 'hired' then
    perform set_config('app.unblocking', '1', true);

    update public.applications
    set status = 'pending',
        updated_at = now()
    where candidate_id = new.candidate_id
      and application_id <> new.application_id
      and status = 'blocked';

    perform set_config('app.unblocking', '0', true);
  end if;

  return null;
end;
$$;

drop trigger if exists applications_sync_blocked on public.applications;
create trigger applications_sync_blocked
  after update of status on public.applications
  for each row execute function public.sync_blocked_applications();


-- ------------------------------------------------------------
-- 4. No interviews on a blocked application
-- ------------------------------------------------------------
-- Stops HR scheduling someone who has already taken a job elsewhere in
-- the company, and stops an in-flight interview being completed against
-- a frozen application.
-- ------------------------------------------------------------

create or replace function public.block_interviews_on_blocked_applications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.applications
  where application_id = new.application_id;

  if v_status = 'blocked' then
    raise exception
      'This candidate was hired for another role, so this application is blocked. No interviews can be scheduled or updated against it.';
  end if;

  return new;
end;
$$;

drop trigger if exists interviews_block_when_application_blocked on public.interviews;
create trigger interviews_block_when_application_blocked
  before insert or update on public.interviews
  for each row execute function public.block_interviews_on_blocked_applications();


-- ------------------------------------------------------------
-- 5. Backfill
-- ------------------------------------------------------------
-- Anyone already hired should have their other applications blocked
-- retroactively, so existing data matches the new rule.
-- ------------------------------------------------------------

do $$
begin
  perform set_config('app.unblocking', '1', true);

  update public.applications a
  set status = 'blocked',
      updated_at = now()
  where a.status not in ('hired', 'blocked', 'rejected')
    and exists (
      select 1 from public.applications h
      where h.candidate_id = a.candidate_id
        and h.status = 'hired'
        and h.application_id <> a.application_id
    );

  perform set_config('app.unblocking', '0', true);
end $$;


-- ============================================================
-- Result:
--   - hiring a candidate blocks their other live applications
--   - blocked applications reject every update, from anyone
--   - no interview can be scheduled against a blocked application
--   - reversing a hire releases them back to pending
-- ============================================================
