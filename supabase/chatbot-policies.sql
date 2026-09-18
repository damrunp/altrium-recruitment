-- ============================================================
-- Altrium — chatbot support policies
-- Run once in Supabase SQL Editor, after schema.sql
-- ============================================================

-- ------------------------------------------------------------
-- Problem this fixes
-- ------------------------------------------------------------
-- The existing jobs SELECT policy is:
--     using (status = 'open' or public.is_staff())
--
-- So when HR closes a job, candidates who already applied lose the
-- ability to read that job row. CandidateStatus.jsx already shows the
-- literal word "Job" instead of a title when this happens, and the
-- chatbot would hit the same blind spot when asked "what did I apply
-- for?".
--
-- This adds a narrow extra path: you may read a job if you have an
-- application against it. Nothing else opens up.
-- ------------------------------------------------------------

create policy "Candidates can view jobs they applied to"
  on public.jobs for select
  using (
    exists (
      select 1
      from public.applications a
      where a.job_id = jobs.job_id
        and a.candidate_id = auth.uid()
    )
  );

-- Note: Postgres ORs multiple permissive SELECT policies together, so
-- this sits alongside "Anyone can view open jobs" rather than replacing
-- it. Open jobs stay public; closed jobs become visible only to the
-- specific candidates who applied.

-- ------------------------------------------------------------
-- Index to keep that policy cheap
-- ------------------------------------------------------------
-- The policy runs a subquery on applications for every job row read,
-- so make sure the lookup is indexed. (The unique (job_id, candidate_id)
-- constraint already covers job_id-leading lookups, but candidate_id
-- alone is worth its own index for the status page.)

create index if not exists applications_candidate_id_idx
  on public.applications (candidate_id);
