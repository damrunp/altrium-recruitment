import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------
// Emails a candidate when HR moves their application.
//
// Covers the in-progress statuses. Final outcomes (hired / rejected
// after interviews) go through /api/send-decision, which has the
// two-step confirmation and the offer wording.
//
// Env vars: BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME, SUPABASE_URL,
// SUPABASE_ANON_KEY — the same ones send-decision uses.
// ---------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

const SENDER_EMAIL = process.env.SENDER_EMAIL || "altriumcareer@gmail.com";
const SENDER_NAME = process.env.SENDER_NAME || "Altrium Careers";
const REPLY_TO = process.env.REPLY_TO_EMAIL || SENDER_EMAIL;

// ---------------------------------------------------------------------
// EDIT ME — wording per status. {{name}} and {{role}} are filled in.
// ---------------------------------------------------------------------
const TEMPLATES = {
  shortlisted: {
    subject: "You've been shortlisted for {{role}} at Altrium",
    heading: "Good news, {{name}}",
    body: [
      "Your application for <strong>{{role}}</strong> has been shortlisted.",
      "That means your CV stood out and the team wants to take a closer look. We'll be in touch about next steps shortly — there's nothing you need to do right now.",
    ],
    accent: "#2563eb",
  },
  interview: {
    subject: "Interview scheduled — {{role}} at Altrium",
    heading: "You're through to interview, {{name}}",
    body: [
      "We'd like to invite you to interview for <strong>{{role}}</strong>.",
      "Your interview details are below. Please add them to your calendar, and let us know as soon as possible if the time doesn't work.",
    ],
    accent: "#7c3aed",
  },
  rejected: {
    subject: "Update on your application for {{role}} at Altrium",
    heading: "Thank you, {{name}}",
    body: [
      "Thank you for your interest in the <strong>{{role}}</strong> position at Altrium.",
      "After reviewing your application we've decided not to take it further on this occasion. We know that's disappointing, and we're grateful for the time you put in.",
      "We'd genuinely welcome an application from you for future openings.",
    ],
    accent: "#6b7280",
  },
  pending: null, // no email — moving someone back to pending isn't news
};

function fill(text, values) {
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
}

function interviewBlock(interviews) {
  if (!interviews || interviews.length === 0) return "";

  const rows = interviews
    .map((i) => {
      const when = new Date(i.scheduled_at).toLocaleString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

      const interviewer = [i.profiles?.first_name, i.profiles?.last_name]
        .filter(Boolean)
        .join(" ");

      const line = (label, value) =>
        value
          ? `<tr>
               <td style="padding:5px 14px 5px 0;font-size:13px;color:#888888;white-space:nowrap;vertical-align:top;">${label}</td>
               <td style="padding:5px 0;font-size:14px;color:#111111;">${value}</td>
             </tr>`
          : "";

      const link = i.meeting_link
        ? `<a href="${i.meeting_link}" style="color:#b8860b;word-break:break-all;">${i.meeting_link}</a>`
        : "To be confirmed";

      return `
        <div style="background:#faf7f0;border:1px solid #e8dcc0;border-radius:10px;padding:18px;margin-bottom:12px;">
          <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111111;">
            ${i.interview_stages?.name || "Interview"}
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;">
            ${line("Date &amp; time", when)}
            ${line("Duration", i.duration_minutes ? `${i.duration_minutes} minutes` : "")}
            ${line("Interviewer", interviewer)}
            ${line("Location", i.location)}
            ${line("Join link", link)}
          </table>
        </div>`;
    })
    .join("");

  return `<div style="margin:24px 0;">${rows}</div>`;
}

function buildHtml(template, values, extraHtml = "") {
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
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:12px;padding:40px 32px;">
        <tr><td>
          <div style="height:4px;width:48px;background:${template.accent};border-radius:2px;margin-bottom:24px;"></div>
          <h1 style="margin:0 0 20px;font-size:22px;color:#111111;">${fill(template.heading, values)}</h1>
          ${paragraphs}
          ${extraHtml}
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

  const { applicationId, status } = req.body || {};

  if (!applicationId || !status) {
    return res.status(400).json({ error: "Missing application or status." });
  }

  const template = TEMPLATES[status];
  // Statuses with no template (pending) are a no-op rather than an error,
  // so the caller can fire this on every change without checking first.
  if (!template) {
    return res.status(200).json({ ok: true, skipped: true, reason: "No email for this status." });
  }

  if (!BREVO_API_KEY) {
    return res.status(500).json({ error: "Email isn't configured. Set BREVO_API_KEY in Vercel." });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not signed in." });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    // --- Only HR may trigger these -----------------------------------
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return res.status(401).json({ error: "Not signed in." });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profile?.role !== "hr") {
      return res.status(403).json({ error: "Only HR can notify candidates." });
    }

    // --- The application and the role ---------------------------------
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("application_id, full_name, email, jobs(title)")
      .eq("application_id", applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: "Application not found." });
    }

    // --- Interview details, when there are any --------------------------
    let extraHtml = "";
    if (status === "interview") {
      const { data: interviews } = await supabase
        .from("interviews")
        .select(
          `scheduled_at, duration_minutes, location, meeting_link,
           interview_stages(name, sort_order),
           profiles!interviews_interviewer_id_fkey(first_name, last_name)`
        )
        .eq("application_id", applicationId)
        .eq("status", "scheduled")
        .order("scheduled_at");

      extraHtml = interviewBlock(interviews);

      // Nothing booked yet — don't promise details that aren't there.
      if (!extraHtml) {
        extraHtml =
          '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444444;">' +
          "We'll follow up shortly with the date, time and joining details." +
          "</p>";
      }
    }

    const values = {
      name: application.full_name,
      role: application.jobs?.title || "the role",
    };

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
        htmlContent: buildHtml(template, values, extraHtml),
      }),
    });

    if (!brevoRes.ok) {
      const detail = await brevoRes.text();
      console.error("Brevo send failed", brevoRes.status, detail);
      return res.status(502).json({
        error: `Status saved, but the notification email could not be sent to ${application.email}.`,
      });
    }

    return res.status(200).json({ ok: true, emailedTo: application.email });
  } catch (err) {
    console.error("send-status failed", err);
    return res.status(500).json({ error: "Something went wrong sending the notification." });
  }
}