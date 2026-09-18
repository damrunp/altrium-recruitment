import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------
// Finalizes a hiring decision and emails the candidate.
//
// Runs server-side for three reasons:
//   1. The Brevo API key must never reach the browser.
//   2. The caller's role is verified here, so the endpoint can't be
//      used by a candidate poking at it directly.
//   3. The status update happens BEFORE the email. If the database
//      rejects the change (the hire-eligibility trigger), no email
//      goes out — nobody gets told they're hired when they aren't.
//
// Env vars needed in Vercel:
//   BREVO_API_KEY     Brevo -> SMTP & API -> API Keys tab (NOT the SMTP key)
//   SENDER_EMAIL      must be a verified sender in Brevo
//   SENDER_NAME       optional, defaults to "Altrium Careers"
// ---------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

const SENDER_EMAIL = process.env.SENDER_EMAIL || "altriumcareer@gmail.com";
const SENDER_NAME = process.env.SENDER_NAME || "Altrium Careers";
const REPLY_TO = process.env.REPLY_TO_EMAIL || SENDER_EMAIL;

// ---------------------------------------------------------------------
// EDIT ME — email copy. {{name}} and {{role}} are filled in per candidate.
// ---------------------------------------------------------------------
const TEMPLATES = {
  hired: {
    subject: "Your application for {{role}} at Altrium",
    heading: "Congratulations, {{name}}",
    body: [
      "We're delighted to offer you the position of <strong>{{role}}</strong> at Altrium.",
      "Your interviews were a pleasure, and the team is looking forward to working with you. Someone from HR will be in touch shortly with your offer letter, start date and onboarding details.",
      "If you have questions in the meantime, just reply to this email.",
    ],
    accent: "#1a7f37",
  },
  rejected: {
    subject: "Update on your application for {{role}} at Altrium",
    heading: "Thank you, {{name}}",
    body: [
      "Thank you for taking the time to interview for the <strong>{{role}}</strong> position at Altrium.",
      "After careful consideration we've decided to move forward with another candidate for this role. This was a difficult decision — the standard of applicants was high.",
      "We'd genuinely welcome an application from you for future openings, and we hope you'll keep an eye on our careers page.",
    ],
    accent: "#6b7280",
  },
};

function fill(text, values) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
}

function buildHtml(template, values) {
  const heading = fill(template.heading, values);
  const paragraphs = template.body
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444444;">${fill(p, values)}</p>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:40px 32px;">
        <tr><td>
          <div style="height:4px;width:48px;background:${template.accent};border-radius:2px;margin-bottom:24px;"></div>
          <h1 style="margin:0 0 20px;font-size:22px;color:#111111;">${heading}</h1>
          ${paragraphs}
          <p style="margin:28px 0 0;font-size:15px;color:#444444;">— The Altrium Recruitment Team</p>
        </td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:12px;color:#999999;">Altrium Careers</p>
    </td></tr>
  </table>
</body></html>`;
}

// ---------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!BREVO_API_KEY) {
    return res.status(500).json({
      error: "Email isn't configured. Set BREVO_API_KEY in Vercel, then redeploy.",
    });
  }

  const { applicationId, decision } = req.body || {};

  if (!applicationId || !TEMPLATES[decision]) {
    return res.status(400).json({ error: "Missing application, or unknown decision." });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not signed in." });
  }

  // Everything below runs as the calling user, so RLS applies.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    // --- 1. Only HR may finalize -------------------------------------
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return res.status(401).json({ error: "Not signed in." });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, first_name, last_name")
      .eq("id", userId)
      .single();

    if (profile?.role !== "hr") {
      return res.status(403).json({ error: "Only HR can finalize a hiring decision." });
    }

    // --- 2. Load the application and the role they applied for --------
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("application_id, full_name, email, status, jobs(title)")
      .eq("application_id", applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: "Application not found." });
    }

    const roleTitle = application.jobs?.title || "the role";

    // --- 3. Update the status FIRST ------------------------------------
    // The hire-eligibility trigger lives in the database. If it refuses,
    // we stop here and no email is sent.
    const { error: updateError } = await supabase
      .from("applications")
      .update({ status: decision, updated_at: new Date().toISOString() })
      .eq("application_id", applicationId);

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // --- 4. Send the email ---------------------------------------------
    const template = TEMPLATES[decision];
    const values = { name: application.full_name, role: roleTitle };

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: application.email, name: application.full_name }],
        replyTo: { email: REPLY_TO, name: SENDER_NAME },
        subject: fill(template.subject, values),
        htmlContent: buildHtml(template, values),
      }),
    });

    if (!brevoRes.ok) {
      const detail = await brevoRes.text();
      console.error("Brevo send failed", brevoRes.status, detail);

      // The status change already went through, so say so plainly rather
      // than implying nothing happened. HR can email manually.
      return res.status(502).json({
        error: `Status updated to "${decision}", but the email could not be sent. Contact ${application.email} directly.`,
        statusUpdated: true,
      });
    }

    return res.status(200).json({
      ok: true,
      emailedTo: application.email,
      role: roleTitle,
    });
  } catch (err) {
    console.error("send-decision failed", err);
    return res.status(500).json({ error: "Something went wrong finalizing this decision." });
  }
}