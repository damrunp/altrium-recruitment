# Altrium — Recruitment Management System

A full recruitment/careers web app for **Altrium**, built with **React + Vite**,
**Supabase** (database, auth, file storage) and deployed on **Vercel**.

Brand colors: Gold `#fbb401`, White, Black.

---

## What's included

| Page | Route | Who can see it |
|---|---|---|
| Home — list of open jobs | `/` | Everyone |
| Job details | `/jobs/:jobId` | Everyone |
| Login / Register | `/auth` | Everyone |
| Apply for a job (Full Name, NIC, CV PDF, Email) | `/apply/:jobId` | Logged-in candidates |
| My Applications (status tracker) | `/status` | Logged-in candidates |
| Dashboard — manage jobs | `/dashboard` | HR / Management / Interviewer |
| Post / Edit a job | `/dashboard/jobs/new`, `/dashboard/jobs/:id/edit` | HR / Management |
| View & update applicants for a job | `/dashboard/jobs/:id/applicants` | HR / Management / Interviewer |

Roles: `candidate` (default on signup), `hr`, `management`, `interviewer`.
Staff roles are **not** self-assignable at signup (for security) — you promote
a user to staff by running one SQL command in Supabase (see Part 3 below).

---

## Part 1 — Set up Supabase (your database)

1. Go to https://supabase.com → sign up / log in → **New project**.
   - Name it `altrium-recruitment`, pick a strong database password, pick a region close to Pakistan, click **Create**.
   - Wait ~2 minutes while it provisions.

2. Open your new project → left sidebar → **SQL Editor** → **New query**.
   - Open the file `supabase/schema.sql` from this project, copy **all** of it,
     paste it into the SQL editor, and click **Run**.
   - This creates all 3 tables (`profiles`, `jobs`, `applications`), the security
     rules (so candidates only see their own data, and staff can manage everything),
     and a private file storage bucket called `cvs` for uploaded CVs.

3. Get your API keys:
   - Left sidebar → **Project Settings** → **API**.
   - Copy the **Project URL** and the **anon public** key. You'll need these next.

---

## Part 2 — Run the app on your computer

1. Install **Node.js** (version 18 or newer) from https://nodejs.org if you don't have it.

2. Open a terminal inside this project folder and run:

   ```bash
   npm install
   ```

3. Create your environment file:
   - Copy `.env.example` and rename the copy to `.env`
   - Open `.env` and paste in your Supabase values:

     ```
     VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
     VITE_SUPABASE_ANON_KEY=your-anon-public-key
     ```

4. Start the app:

   ```bash
   npm run dev
   ```

   Open the URL shown in the terminal (usually `http://localhost:5173`).

---

## Part 3 — Create your first HR / staff account

1. On the running site, click **Login / Register → Register**, and sign up
   normally with your own email (you'll be created as a `candidate` by default).
2. In Supabase → **Table Editor** → `profiles` table, find your row, and change
   the `role` column from `candidate` to `hr` (or `management` / `interviewer`).
   Alternatively, run this in the SQL Editor:

   ```sql
   update public.profiles set role = 'hr' where email = 'you@altrium.com';
   ```

3. Log out and log back in on the site. You'll now see a **Dashboard** link in
   the navbar where you can post jobs and manage applicants. Repeat this step
   for every staff member (HR, Management, Interviewers) you want to add.

---

## Part 4 — Deploy

### Deploy the app to Vercel
1. Push this project to a GitHub repository (create a new repo, then in the
   project folder run `git init`, `git add .`, `git commit -m "Altrium app"`,
   and push it — or use GitHub Desktop if you prefer a visual tool).
2. Go to https://vercel.com → **Add New Project** → import your GitHub repo.
3. In **Environment Variables**, add the same two values from your `.env` file:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. Vercel will build and host the app automatically
   (the included `vercel.json` makes sure page refreshes/deep links work).

### Confirm Supabase auth redirect URL
In Supabase → **Authentication** → **URL Configuration**, add your Vercel
domain (e.g. `https://altrium.vercel.app`) to **Site URL** and **Redirect URLs**,
so login/signup emails work correctly in production.

---

## How the pieces fit together

- **Home page** reads all jobs where `status = 'open'` from the `jobs` table — public, no login needed.
- **Register/Login** creates a Supabase Auth user, then inserts a row into `profiles`
  with `role = 'candidate'` by default.
- **Apply page** requires login. It uploads the CV PDF to the private `cvs` storage
  bucket (inside a folder named after the candidate's user ID) and inserts a row
  into `applications` linked to that job and candidate.
- **My Applications** shows the logged-in candidate their own rows from `applications`,
  joined with the job title, with a colored status badge.
- **Dashboard** is only reachable by staff roles (`hr`, `management`, `interviewer`).
  HR/Management can create, edit, close, and delete jobs. All staff can view
  applicants and change an applicant's status (`pending`, `shortlisted`,
  `interview`, `rejected`, `hired`) — this instantly updates what the candidate
  sees on their status page.
- All of this is protected by **Row Level Security** rules in `supabase/schema.sql`,
  so even if someone tampers with the app, the database itself blocks candidates
  from seeing other people's applications or staff-only actions.

---

## Project structure

```
src/
  pages/          -> one file per page (Home, JobDetail, AuthPage, ApplicationForm,
                     CandidateStatus, Dashboard, JobFormPage, Applicants, NotFound)
  components/      -> Navbar, StatusBadge, ProtectedRoute
  context/         -> AuthContext (tracks logged-in user + role app-wide)
  lib/             -> supabaseClient.js (connection + shared constants)
supabase/
  schema.sql       -> run once in Supabase SQL Editor to set up the whole database
```

## Tech stack
React 18 + Vite, React Router, Tailwind CSS, Supabase (Postgres + Auth + Storage), Vercel.
