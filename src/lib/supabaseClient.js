import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Missing Supabase env vars. Create a .env file based on .env.example."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Roles used across the app
export const ROLES = {
  CANDIDATE: "candidate",
  HR: "hr",
  MANAGEMENT: "management",
  INTERVIEWER: "interviewer",
};

export const STAFF_ROLES = [ROLES.HR, ROLES.MANAGEMENT, ROLES.INTERVIEWER];

export const APPLICATION_STATUSES = [
  "pending",
  "shortlisted",
  "interview",
  "rejected",
  "hired",
];
