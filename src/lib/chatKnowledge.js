// ---------------------------------------------------------------------
// Rule-based answer layer for the candidate chatbot.
//
// Runs in the browser against data already fetched from Supabase. No API
// key, no rate limit, no cost.
//
// Design note: this matches on WORD STEMS, not exact phrases. "how do I
// apply", "need steps of applying", "application process" and "wanna
// apply" all hit the same intent. Phrase lists break the moment someone
// words a question their own way.
//
// matchIntent() returns a reply object, or null meaning "hand to the AI".
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// EDIT ME — the facts the bot is allowed to state.
// ---------------------------------------------------------------------
export const COMPANY_FACTS = {
  contactEmail: "hello@altrium.io",
  cvNote:
    "Only PDF files are accepted. Scanned or image-only PDFs still upload fine, but they can't be read by our screening step, so a text-based PDF is better.",
  nicFormat:
    "Sri Lankan NIC — either 12 digits (200012345678) or 9 digits followed by V or X (991234567V).",
  oneApplicationRule:
    "You can submit one application per job. To apply for another role, open that job and apply separately.",
  responseTime:
    "Applications are reviewed on a rolling basis. Timelines vary by role, so there isn't a fixed turnaround.",
  salaryNote:
    "Salary and benefits aren't listed on the job pages. The team can tell you more once you're in the process.",
};

export const APPLY_STEPS = [
  "1. Create an account or log in.",
  "2. Open the role you want from the jobs list.",
  "3. Click “Apply for this role”.",
  "4. Fill in your full name, NIC and email.",
  "5. Upload your CV as a PDF.",
  "6. Submit — then track it under My Applications.",
].join("\n");

export const STATUS_EXPLANATIONS = {
  pending: "Your application has been received and is waiting to be reviewed. Nothing needed from you.",
  shortlisted: "You've been picked out for closer review. The team may be in touch about next steps.",
  interview: "You've reached the interview stage. Someone from Altrium will contact you to arrange it.",
  rejected: "This application wasn't taken forward. You're welcome to apply for other open roles.",
  hired: "You've been offered the role. Congratulations — the team will follow up with details.",
};

// ---------------------------------------------------------------------
// Stems. Matched anywhere in the message, so word endings don't matter.
// ---------------------------------------------------------------------
const RE = {
  apply: /\bappl(y|ies|ying|ication|ications|icant)\b/,
  job: /\b(jobs?|roles?|positions?|vacanc(y|ies)|openings?|opening|hiring|careers?|employment)\b/,
  mine: /\b(my|mine|i've|ive|i)\b/,
  cv: /\b(cv|cvs|resume|resumes|curriculum)\b/,
  nic: /\b(nic|identity|id)\b/,
  salary: /\b(salary|salaries|pay|wage|wages|compensation|benefits|package|lkr)\b/,
  timeline: /\b(long|soon|when|wait|waiting|timeline|duration|hear|response|revert|reply)\b/,
  contact: /\b(contact|email|phone|call|reach|human|person|recruiter|hr)\b/,
  location: /\b(remote|onsite|on-site|hybrid|colombo|location|located|where|office|wfh)\b/,
  requirement: /\b(require|requires|requirement|requirements|qualification|qualifications|skill|skills|need|needs|experience|eligible|eligibility)\b/,
  greeting: /^(hi+|hey+|hello+|yo|sup|good (morning|afternoon|evening)|ayubowan)\b/,
  thanks: /^(thanks|thank you|thx|ty|cheers|ok|okay|got it|cool|nice|great)\b/,
  help: /\b(help|do|can|capable|able)\b/,
};

const STOP_WORDS = new Set([
  "a", "about", "am", "an", "and", "any", "are", "as", "at", "be", "been",
  "can", "could", "do", "does", "for", "from", "get", "give", "has", "have",
  "how", "i", "if", "in", "is", "it", "just", "know", "like", "looking",
  "me", "much", "need", "needs", "of", "on", "or", "please", "should",
  "show", "some", "steps", "step", "tell", "that", "the", "there", "they",
  "this", "to", "want", "wanna", "was", "what", "when", "where", "which",
  "who", "will", "with", "would", "you", "your", "my",
]);

export function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

// ---------------------------------------------------------------------
// Job search — token overlap against the live jobs list
// ---------------------------------------------------------------------
function searchJobs(query, jobs) {
  // Strip generic words first so "developer roles" searches "developer",
  // not every job containing the word "role".
  const cleaned = normalize(query)
    .replace(RE.job, " ")
    .replace(RE.apply, " ")
    .replace(RE.requirement, " ");

  const tokens = tokenize(cleaned);
  if (tokens.length === 0) return [];

  const scored = jobs.map((job) => {
    const title = normalize(job.title);
    const reqs = normalize(`${job.requirements || ""} ${job.responsibilities || ""}`);
    const rest = normalize(`${job.description || ""} ${job.location || ""}`);

    let score = 0;
    for (const t of tokens) {
      if (title.includes(t)) score += 3;
      else if (reqs.includes(t)) score += 2;
      else if (rest.includes(t)) score += 1;
    }
    return { job, score };
  });

  return scored
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.job);
}

function listAllJobs(jobs) {
  if (jobs.length === 0) {
    return {
      source: "local",
      text: "There are no open roles listed right now. Worth checking back — new ones get posted as teams grow.",
    };
  }
  return {
    source: "local",
    text: `We have ${jobs.length} open ${jobs.length === 1 ? "role" : "roles"} right now:`,
    jobs: jobs.slice(0, 6),
  };
}

// ---------------------------------------------------------------------
// Main entry point
// ctx = { jobs, applications, isLoggedIn, firstName, lastName, email }
// ---------------------------------------------------------------------
export function matchIntent(message, ctx) {
  const {
    jobs = [],
    applications = [],
    isLoggedIn = false,
    firstName,
    lastName,
    email,
  } = ctx;

  const t = normalize(message);
  if (!t) return null;

  // --- 1. Greetings -----------------------------------------------------
  if (t.length <= 30 && RE.greeting.test(t)) {
    return {
      source: "local",
      text: firstName
        ? `Hi ${firstName}. Ask me about our open roles, or check where your applications stand.`
        : "Hi. Ask me about our open roles, what a job needs, or how applying works.",
    };
  }

  if (t.length <= 25 && RE.thanks.test(t)) {
    return { source: "local", text: "Anytime. Anything else about the roles?" };
  }

  // --- 2. Who am I --------------------------------------------------------
  if (/\b(my name|who am i|my profile|my details|my account)\b/.test(t)) {
    if (!isLoggedIn) {
      return {
        source: "local",
        text: "You're not logged in, so I don't know who you are. Log in and I can pull up your details and applications.",
        action: { label: "Log in", to: "/auth" },
      };
    }
    const name = [firstName, lastName].filter(Boolean).join(" ");
    return {
      source: "local",
      text: name
        ? `You're signed in as ${name}${email ? ` (${email})` : ""}.`
        : "You're signed in, but there's no name on your profile yet.",
    };
  }

  // --- 3. What can you do --------------------------------------------------
  if (/\b(what can you|who are you|what do you do|how can you help)\b/.test(t)) {
    return capabilityReply(isLoggedIn);
  }

  // --- 4. My applications ---------------------------------------------------
  // Needs a possessive: "my application", "have I applied", "my status".
  // Checked before the generic apply intent so it wins.
  const asksAboutOwn =
    (RE.mine.test(t) && (RE.apply.test(t) || /\bstatus\b/.test(t))) ||
    /\b(applied|my status|my application)\b/.test(t);

  if (asksAboutOwn && !/\b(how|steps|process|can i|do i|to apply)\b/.test(t)) {
    if (!isLoggedIn) {
      return {
        source: "local",
        text: "Log in and I can pull up your applications and where each one stands.",
        action: { label: "Log in", to: "/auth" },
      };
    }
    if (applications.length === 0) {
      return {
        source: "local",
        text: "You haven't applied to anything yet. Have a look at the open roles and apply from the job page.",
        action: { label: "Browse jobs", to: "/" },
      };
    }
    const lines = applications.map((a) => {
      const title = a.jobs?.title || "A role";
      const when = new Date(a.applied_at).toLocaleDateString();
      return `• ${title} — ${a.status} (applied ${when})`;
    });
    return {
      source: "local",
      text: `Here's where your ${applications.length === 1 ? "application stands" : "applications stand"}:\n${lines.join("\n")}\n\nAsk me what any of these statuses means.`,
      action: { label: "Open my applications", to: "/status" },
    };
  }

  // --- 5. Status meanings ----------------------------------------------------
  for (const key of Object.keys(STATUS_EXPLANATIONS)) {
    if (t.includes(key)) {
      return { source: "local", text: STATUS_EXPLANATIONS[key] };
    }
  }

  // --- 6. Can I apply to several jobs? ----------------------------------------
  if (RE.apply.test(t) && /\b(two|three|several|multiple|many|more than one|again|twice|other|another|different)\b/.test(t)) {
    return { source: "local", text: COMPANY_FACTS.oneApplicationRule };
  }

  // --- 7. How to apply --------------------------------------------------------
  // Any form of "apply" that isn't one of the cases above lands here.
  // This is the fix for "need steps of applying to job", which previously
  // fell through to the generic job list.
  if (RE.apply.test(t)) {
    const results = searchJobs(t, jobs);
    return {
      source: "local",
      text: `Here's how applying works:\n${APPLY_STEPS}\n\n${COMPANY_FACTS.oneApplicationRule}`,
      jobs: results.slice(0, 3),
      action: results.length === 0 ? { label: "Browse jobs", to: "/" } : undefined,
    };
  }

  // --- 8. CV / NIC --------------------------------------------------------------
  if (RE.cv.test(t)) {
    return { source: "local", text: COMPANY_FACTS.cvNote };
  }
  if (/\bnic\b/.test(t) || /\b(national identity|identity card|id number)\b/.test(t)) {
    return { source: "local", text: COMPANY_FACTS.nicFormat };
  }

  // --- 9. Salary ------------------------------------------------------------------
  if (RE.salary.test(t)) {
    return {
      source: "local",
      text: `${COMPANY_FACTS.salaryNote} You can reach them at ${COMPANY_FACTS.contactEmail}.`,
    };
  }

  // --- 10. Requirements for a specific role ----------------------------------------
  if (RE.requirement.test(t)) {
    const results = searchJobs(t, jobs);
    if (results.length > 0) {
      return {
        source: "local",
        text:
          results.length === 1
            ? "Open the role for the full requirements:"
            : "Open any of these for the full requirements:",
        jobs: results.slice(0, 3),
      };
    }
  }

  // --- 11. Timelines -----------------------------------------------------------------
  if (RE.timeline.test(t) && /\b(hear|back|reply|response|review|revert|long|soon|wait)\b/.test(t)) {
    return {
      source: "local",
      text: `${COMPANY_FACTS.responseTime} You can check your current status any time.`,
      action: { label: "My applications", to: "/status" },
    };
  }

  // --- 12. Contact ---------------------------------------------------------------------
  if (RE.contact.test(t) && /\b(contact|reach|talk|speak|human|person|recruiter)\b/.test(t)) {
    return { source: "local", text: `You can reach the team at ${COMPANY_FACTS.contactEmail}.` };
  }

  // --- 13. Specific job search ------------------------------------------------------------
  const results = searchJobs(t, jobs);
  if (results.length > 0) {
    return {
      source: "local",
      text: results.length === 1 ? "One role looks relevant:" : `${results.length} roles look relevant:`,
      jobs: results.slice(0, 4),
    };
  }

  // --- 14. Generic "show me the jobs" -------------------------------------------------------
  if (RE.job.test(t) || /\b(what is open|whats open|anything available|show me)\b/.test(t)) {
    return listAllJobs(jobs);
  }

  // Nothing matched — let the AI try.
  return null;
}

// ---------------------------------------------------------------------
// Used when the AI is unreachable, capped, or stumped.
// ---------------------------------------------------------------------
export function capabilityReply(isLoggedIn) {
  return {
    source: "local",
    text: [
      "I can help with:",
      "• what roles are open right now",
      "• finding roles that match a skill — try “Python” or “QA”",
      "• how applying works, CV format, NIC format",
      isLoggedIn ? "• where each of your applications stands" : "• your applications, once you're logged in",
      "• what a status like “shortlisted” means",
    ].join("\n"),
  };
}

export function fallbackReply(ctx = {}) {
  const reply = capabilityReply(ctx.isLoggedIn);
  return {
    ...reply,
    text: `I couldn't work that one out. ${reply.text}`,
    jobs: (ctx.jobs || []).slice(0, 3),
  };
}

// ---------------------------------------------------------------------
export function starterQuestions(isLoggedIn) {
  const base = [
    "What roles are open?",
    "How do I apply?",
    "What CV format do you accept?",
  ];
  return isLoggedIn ? ["Where are my applications?", ...base.slice(0, 2)] : base;
}