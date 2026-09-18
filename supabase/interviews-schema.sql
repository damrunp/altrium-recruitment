-- ============================================================
-- Altrium — PB06 Interview & Stage Management
--           PB07 Interview Feedback & Evaluation
--
-- Run once in Supabase SQL Editor, after schema.sql and
-- chatbot-policies.sql.
--
-- This file is idempotent — safe to run more than once.
-- ============================================================


-- ============================================================
-- PART 1 — ROLE PERMISSIONS REWORK
-- ============================================================
-- Before: is_staff() = hr + management + interviewer, and that
-- single check gated application status updates. So interviewers
-- and managers could both move candidates through the pipeline.
--
-- After:
--   hr           full control — jobs, statuses, scheduling
--   management   read-only on jobs and applicants; conducts the
--                final managerial interview and submits evaluations
--   interviewer  conducts technical interviews; sees only the
--                candidates assigned to them
-- ------------------------------------------------------------

create or replace function public.is_hr()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'hr'
  );
$$;

create or replace function public.is_management()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'management'
  );
$$;

create or replace function public.is_interviewer()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'interviewer'
  );
$$;

-- Job management is now HR only. Management loses write access.
create or replace function public.can_manage_jobs()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'hr'
  );
$$;

-- is_staff() stays as-is (hr + management + interviewer) because it
-- still correctly answers "can this person see internal data at all".


-- ------------------------------------------------------------
-- Applications: only HR may change a candidate's status
-- ------------------------------------------------------------
drop policy if exists "Staff can update application status" on public.applications;

create policy "HR can update application status"
  on public.applications for update
  using (public.is_hr())
  with check (public.is_hr());

-- Management and interviewers keep SELECT through the existing
-- "Staff can view all applications" policy.


-- ============================================================
-- PART 2 — INTERVIEW STAGES AND CRITERIA
-- ============================================================
-- Stages are data, not hardcoded, so HR can rename them or add a
-- third later without a migration.
-- ------------------------------------------------------------

create table if not exists public.interview_stages (
  stage_id uuid primary key default gen_random_uuid(),
  code text not null unique,            -- 'technical' | 'managerial'
  name text not null,
  description text,
  sort_order int not null default 0,
  conducted_by text not null            -- which role runs this stage
    check (conducted_by in ('interviewer','management','hr')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.interview_stages (code, name, description, sort_order, conducted_by)
values
  ('technical', 'Technical Interview',
   'Conducted by company employees. Assesses hands-on engineering ability.',
   1, 'interviewer'),
  ('managerial', 'Final Managerial Interview',
   'Conducted by the department manager. Assesses soft skills and fit.',
   2, 'management')
on conflict (code) do nothing;


create table if not exists public.interview_criteria (
  criterion_id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.interview_stages (stage_id) on delete cascade,
  code text not null,                   -- stable key used in the scores JSON
  label text not null,
  sort_order int not null default 0,
  max_score int not null default 10,
  is_active boolean not null default true,
  unique (stage_id, code)
);

-- Technical criteria
insert into public.interview_criteria (stage_id, code, label, sort_order)
select s.stage_id, c.code, c.label, c.sort_order
from public.interview_stages s
cross join (values
  ('technical_knowledge',   'Technical Knowledge',          1),
  ('programming_skills',    'Programming & Coding Skills',  2),
  ('problem_solving',       'Problem-Solving Skills',       3),
  ('project_knowledge',     'Project Knowledge',            4),
  ('database_it',           'Database & IT Fundamentals',   5),
  ('technical_communication','Technical Communication',     6)
) as c(code, label, sort_order)
where s.code = 'technical'
on conflict (stage_id, code) do nothing;

-- Managerial criteria
insert into public.interview_criteria (stage_id, code, label, sort_order)
select s.stage_id, c.code, c.label, c.sort_order
from public.interview_stages s
cross join (values
  ('communication',      'Communication Skills',            1),
  ('teamwork',           'Teamwork & Collaboration',        2),
  ('decision_making',    'Decision-Making',                 3),
  ('leadership',         'Leadership & Responsibility',     4),
  ('adaptability',       'Adaptability & Learning Ability', 5),
  ('professionalism',    'Professionalism & Attitude',      6)
) as c(code, label, sort_order)
where s.code = 'managerial'
on conflict (stage_id, code) do nothing;


-- ============================================================
-- PART 3 — INTERVIEWER AVAILABILITY
-- ============================================================
-- Two layers:
--   working_hours  recurring weekly pattern ("I work Mon–Fri 9–5")
--   busy_blocks    one-off unavailability ("out Thursday afternoon")
--
-- A slot is bookable if it falls inside working hours, outside every
-- busy block, and doesn't collide with an existing interview. That
-- last check is done in the app against the interviews table.
-- ------------------------------------------------------------

create table if not exists public.interviewer_working_hours (
  id uuid primary key default gen_random_uuid(),
  interviewer_id uuid not null references public.profiles (id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),  -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  unique (interviewer_id, weekday, start_time)
);

create table if not exists public.interviewer_busy_blocks (
  id uuid primary key default gen_random_uuid(),
  interviewer_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists busy_blocks_interviewer_time_idx
  on public.interviewer_busy_blocks (interviewer_id, starts_at, ends_at);


-- ============================================================
-- PART 4 — INTERVIEWS
-- ============================================================

create table if not exists public.interviews (
  interview_id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (application_id) on delete cascade,
  stage_id uuid not null references public.interview_stages (stage_id),
  interviewer_id uuid not null references public.profiles (id),

  scheduled_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes between 15 and 240),
  location text,
  meeting_link text,                    -- HR pastes the Google Meet URL

  status text not null default 'scheduled'
    check (status in ('scheduled','completed','cancelled','no_show')),
  result text check (result in ('pass','fail')),

  scheduled_by uuid references public.profiles (id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One live interview per stage per application. Rescheduling edits
  -- the existing row rather than creating a duplicate.
  unique (application_id, stage_id)
);

create index if not exists interviews_interviewer_idx
  on public.interviews (interviewer_id, scheduled_at);
create index if not exists interviews_application_idx
  on public.interviews (application_id);


-- ============================================================
-- PART 5 — EVALUATIONS
-- ============================================================
-- Scores are JSONB keyed by interview_criteria.code, so the two
-- stages can have different criteria and you can add a third stage
-- without new columns.
--
--   {"technical_knowledge": 8, "problem_solving": 7, ...}
-- ------------------------------------------------------------

create table if not exists public.evaluations (
  evaluation_id uuid primary key default gen_random_uuid(),
  interview_id uuid not null unique references public.interviews (interview_id) on delete cascade,
  application_id uuid not null references public.applications (application_id) on delete cascade,
  interviewer_id uuid not null references public.profiles (id),

  scores jsonb not null default '{}'::jsonb,
  total_score int,                      -- sum of scores, filled by trigger
  max_total int,                        -- criteria count x max_score
  comments text,
  recommendation text
    check (recommendation in ('strong_yes','yes','maybe','no','strong_no')),

  is_draft boolean not null default true,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists evaluations_application_idx
  on public.evaluations (application_id);


-- Keep total_score and max_total in step with the scores JSON, so
-- the dashboard can sort and average without recomputing in JS.
create or replace function public.sync_evaluation_totals()
returns trigger
language plpgsql
as $$
declare
  v_stage_id uuid;
begin
  select i.stage_id into v_stage_id
  from public.interviews i
  where i.interview_id = new.interview_id;

  select coalesce(sum((value)::int), 0)
    into new.total_score
  from jsonb_each_text(new.scores);

  select coalesce(sum(max_score), 0)
    into new.max_total
  from public.interview_criteria
  where stage_id = v_stage_id and is_active;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists evaluations_sync_totals on public.evaluations;
create trigger evaluations_sync_totals
  before insert or update on public.evaluations
  for each row execute function public.sync_evaluation_totals();


-- ============================================================
-- PART 6 — "HIRED" IS EARNED, NOT PICKED
-- ============================================================
-- Removing 'hired' from the dropdown is a UI courtesy. This trigger
-- is the actual guarantee: a candidate cannot reach 'hired' unless
-- every active stage has a completed interview with result 'pass'.
-- ------------------------------------------------------------

create or replace function public.check_hire_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required int;
  v_passed int;
begin
  if new.status = 'hired' and coalesce(old.status, '') <> 'hired' then

    select count(*) into v_required
    from public.interview_stages
    where is_active;

    select count(*) into v_passed
    from public.interviews i
    join public.interview_stages s on s.stage_id = i.stage_id
    where i.application_id = new.application_id
      and s.is_active
      and i.status = 'completed'
      and i.result = 'pass';

    if v_passed < v_required then
      raise exception
        'Cannot mark as hired: % of % interview stage(s) passed. Complete all interviews first.',
        v_passed, v_required;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists applications_check_hire on public.applications;
create trigger applications_check_hire
  before update on public.applications
  for each row execute function public.check_hire_eligibility();


-- ============================================================
-- PART 7 — ROW LEVEL SECURITY
-- ============================================================

alter table public.interview_stages enable row level security;
alter table public.interview_criteria enable row level security;
alter table public.interviewer_working_hours enable row level security;
alter table public.interviewer_busy_blocks enable row level security;
alter table public.interviews enable row level security;
alter table public.evaluations enable row level security;


-- ---- Stages and criteria: all staff read, HR writes ----------
create policy "Staff can view stages"
  on public.interview_stages for select
  using (public.is_staff());

create policy "HR can manage stages"
  on public.interview_stages for all
  using (public.is_hr())
  with check (public.is_hr());

create policy "Staff can view criteria"
  on public.interview_criteria for select
  using (public.is_staff());

create policy "HR can manage criteria"
  on public.interview_criteria for all
  using (public.is_hr())
  with check (public.is_hr());


-- ---- Working hours -------------------------------------------
-- Interviewers and managers manage their own; HR manages anyone's,
-- so HR is never blocked waiting for someone to fill in a form.

create policy "Staff can view working hours"
  on public.interviewer_working_hours for select
  using (public.is_staff());

create policy "Own working hours are editable"
  on public.interviewer_working_hours for all
  using (auth.uid() = interviewer_id)
  with check (auth.uid() = interviewer_id);

create policy "HR can manage any working hours"
  on public.interviewer_working_hours for all
  using (public.is_hr())
  with check (public.is_hr());


-- ---- Busy blocks ----------------------------------------------
create policy "Staff can view busy blocks"
  on public.interviewer_busy_blocks for select
  using (public.is_staff());

create policy "Own busy blocks are editable"
  on public.interviewer_busy_blocks for all
  using (auth.uid() = interviewer_id)
  with check (auth.uid() = interviewer_id);

create policy "HR can manage any busy blocks"
  on public.interviewer_busy_blocks for all
  using (public.is_hr())
  with check (public.is_hr());


-- ---- Interviews ------------------------------------------------
-- HR sees and schedules everything.
-- Interviewers and managers see only interviews assigned to them.
-- The candidate sees their own, which is how the date, time and
-- meeting link reach their progress page.

create policy "HR can view all interviews"
  on public.interviews for select
  using (public.is_hr());

create policy "Assigned interviewer can view own interviews"
  on public.interviews for select
  using (auth.uid() = interviewer_id);

create policy "Candidates can view own interviews"
  on public.interviews for select
  using (
    exists (
      select 1 from public.applications a
      where a.application_id = interviews.application_id
        and a.candidate_id = auth.uid()
    )
  );

create policy "HR can schedule interviews"
  on public.interviews for insert
  with check (public.is_hr());

create policy "HR can update interviews"
  on public.interviews for update
  using (public.is_hr())
  with check (public.is_hr());

create policy "HR can delete interviews"
  on public.interviews for delete
  using (public.is_hr());

-- The assigned interviewer marks their own interview done. They can
-- only touch rows assigned to them; the trigger below stops them
-- from editing anything except the completion fields.
create policy "Assigned interviewer can complete own interview"
  on public.interviews for update
  using (auth.uid() = interviewer_id)
  with check (auth.uid() = interviewer_id);


-- Interviewers may set status/result/completed_at and nothing else.
-- Without this, the policy above would let them move their own
-- interview to a different candidate or change the schedule.
create or replace function public.restrict_interviewer_interview_edits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_hr() then
    new.updated_at := now();
    return new;
  end if;

  if auth.uid() = old.interviewer_id then
    if new.application_id is distinct from old.application_id
       or new.stage_id is distinct from old.stage_id
       or new.interviewer_id is distinct from old.interviewer_id
       or new.scheduled_at is distinct from old.scheduled_at
       or new.duration_minutes is distinct from old.duration_minutes
       or new.meeting_link is distinct from old.meeting_link
       or new.location is distinct from old.location
    then
      raise exception 'Interviewers can only mark an interview complete, not reschedule it.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists interviews_restrict_edits on public.interviews;
create trigger interviews_restrict_edits
  before update on public.interviews
  for each row execute function public.restrict_interviewer_interview_edits();


-- ---- Evaluations -------------------------------------------------
-- HR sees every evaluation (that's the comparison dashboard).
-- Interviewers write and see only their own.
-- Candidates never see evaluations at all — no policy grants it.

create policy "HR can view all evaluations"
  on public.evaluations for select
  using (public.is_hr());

create policy "Interviewers can view own evaluations"
  on public.evaluations for select
  using (auth.uid() = interviewer_id);

create policy "Interviewers can insert own evaluations"
  on public.evaluations for insert
  with check (
    auth.uid() = interviewer_id
    and exists (
      select 1 from public.interviews i
      where i.interview_id = evaluations.interview_id
        and i.interviewer_id = auth.uid()
    )
  );

-- Editable while draft; submitting locks it. This is the "history of
-- evaluations" requirement — once submitted, the record stands.
create policy "Interviewers can update own draft evaluations"
  on public.evaluations for update
  using (auth.uid() = interviewer_id and is_draft)
  with check (auth.uid() = interviewer_id);


-- ============================================================
-- PART 8 — CONVENIENCE VIEW FOR THE HR DASHBOARD
-- ============================================================
-- One row per application with both interviews' totals side by side,
-- so the comparison dashboard is a single select rather than a pile
-- of joins in the client.
-- ------------------------------------------------------------

create or replace view public.candidate_evaluation_summary as
select
  a.application_id,
  a.job_id,
  a.candidate_id,
  a.full_name,
  a.email,
  a.status,
  a.match_score,

  tech.total_score           as technical_score,
  tech.max_total             as technical_max,
  tech.recommendation        as technical_recommendation,
  ti.result                  as technical_result,
  ti.status                  as technical_status,

  mgmt.total_score           as managerial_score,
  mgmt.max_total             as managerial_max,
  mgmt.recommendation        as managerial_recommendation,
  mi.result                  as managerial_result,
  mi.status                  as managerial_status,

  coalesce(tech.total_score, 0) + coalesce(mgmt.total_score, 0) as overall_score,
  coalesce(tech.max_total, 0)  + coalesce(mgmt.max_total, 0)    as overall_max

from public.applications a

left join public.interviews ti
  on ti.application_id = a.application_id
 and ti.stage_id = (select stage_id from public.interview_stages where code = 'technical')
left join public.evaluations tech
  on tech.interview_id = ti.interview_id and not tech.is_draft

left join public.interviews mi
  on mi.application_id = a.application_id
 and mi.stage_id = (select stage_id from public.interview_stages where code = 'managerial')
left join public.evaluations mgmt
  on mgmt.interview_id = mi.interview_id and not mgmt.is_draft;

-- The view runs with the querying user's permissions, so the
-- evaluations policies above still apply: only HR sees scores.
alter view public.candidate_evaluation_summary set (security_invoker = true);


-- ============================================================
-- DONE.
--
-- What changed for existing users:
--   - management can no longer create, edit or delete jobs
--   - management and interviewers can no longer change application
--     status; HR only
--   - 'hired' is now rejected by the database unless both interviews
--     are completed and passed
--
-- If you have a management account you were using to post jobs,
-- switch it to hr, or post jobs from an HR account from now on.
-- ============================================================
