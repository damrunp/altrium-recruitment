import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------
// WHAT THIS ENDPOINT DOES NOW
//
// It used to create the account with email_confirm: true, which skipped
// email verification entirely. With OTP verification turned on, account
// creation moved to the browser (supabase.auth.signUp), because that is
// what makes Supabase generate and email the 6-digit code.
//
// So this is now a PRE-FLIGHT CHECK. It runs before signUp and does the
// two things the browser can't be trusted to do:
//   1. Enforce the password and phone rules server-side (client-side
//      validation is trivially bypassed by POSTing directly).
//   2. Give a clear "email already registered" message. Supabase's signUp
//      deliberately hides whether an email exists, which leaves the user
//      at a dead end wondering why no code arrived.
//
// It deliberately creates nothing. Nothing here needs changing when you
// swap SMTP providers.
// ---------------------------------------------------------------------

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LK_PHONE_REGEX = /^(?:\+94|0)7\d{8}$/;

// ---------------------------------------------------------------------
// Password policy — KEEP IN SYNC with src/lib/passwordPolicy.js
// Duplicated rather than imported so this function has no dependency on
// the client bundle.
// ---------------------------------------------------------------------
const MIN_PASSWORD_LENGTH = 8;
const MIN_CHARACTER_TYPES = 3;

function passwordError(password) {
  const value = String(password || "");

  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  const types = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
  const met = types.filter((re) => re.test(value)).length;

  if (met < MIN_CHARACTER_TYPES) {
    return `Password needs at least ${MIN_CHARACTER_TYPES} of: a capital letter, a lowercase letter, a number, a symbol.`;
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, password, firstName, lastName, phone } = req.body || {};

  if (!email || !password || !firstName || !lastName || !phone) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  if (!LK_PHONE_REGEX.test(phone)) {
    return res.status(400).json({ error: "Invalid Sri Lankan phone number." });
  }

  const pwError = passwordError(password);
  if (pwError) {
    return res.status(400).json({ error: pwError });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Check the profiles table first — cheap, and covers anyone who has
    // completed signup.
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (existingProfile) {
      return res.status(409).json({
        error: "An account with this email already exists. Please log in instead.",
      });
    }

    // Also check auth.users, since someone who registered but never
    // entered their code has an auth row and (depending on trigger
    // timing) may already have a profile. If they exist but are still
    // unconfirmed, let them through — signUp will resend the code rather
    // than erroring, which is exactly what that person needs.
    const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = userList?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    if (existingUser?.email_confirmed_at) {
      return res.status(409).json({
        error: "An account with this email already exists. Please log in instead.",
      });
    }

    return res.status(200).json({ ok: true, pendingVerification: Boolean(existingUser) });
  } catch (err) {
    console.error("register pre-flight failed", err);
    return res.status(500).json({ error: "Could not check that email. Please try again." });
  }
}