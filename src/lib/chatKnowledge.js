// ---------------------------------------------------------------------
// Rule layer for the candidate chatbot — deliberately small.
//
// It now handles ONLY things that need database precision or that the
// model can't know: the person's own applications, what a status means,
// and matching a stated skill against live job requirements.
//
// Everything else goes to the AI. The previous version answered far more
// from canned text, which is why asking about the company produced a
// bullet list of capabilities instead of an answer.
// ---------------------------------------------------------------------

export const STATUS_EXPLANATIONS = {
  pending: "Received and waiting to be reviewed. Nothing needed from you.",
  shortlisted: "You've been picked out for closer review. The team may be in touch soon.",
  interview: "You've reached the interview stage — someone will contact you to arrange it.",
  rejected: "This one wasn't taken forward. You're welcome to apply for other roles.",
  hired: "You've been offered the role. Congratulations.",
  blocked: "Closed because you accepted a different role with us.",
};

const STOP_WORDS = new Set([
  "a", "about", "am", "an", "and", "any", "are", "as", "at", "be", "been",
  "can", "could", "do", "does", "for", "from", "get", "give", "good", "got",
  "has", "have", "how", "i", "if", "in", "is", "it", "job", "jobs", "just",
  "know", "like", "looking", "me", "my", "need", "of", "on", "or", "position",
  "positions", "role", "roles", "show", "skill", "skills", "some", "suit",
  "suits", "tell", "that", "the", "there", "they", "this", "to", "want",
  "was", "what", "when", "where", "which", "who", "will", "with", "work",
  "would", "you", "your",
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
// Skill matching against live job data.
//
// Returns only genuine matches. An empty array means "nothing relevant",
// which is a useful answer — better than listing every job.
// ---------------------------------------------------------------------
export function searchJobs(query, jobs) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored = jobs.map((job) => {
    const title = normalize(job.title);
    const reqs = normalize(`${job.requirements || ""} ${job.responsibilities || ""}`);
    const rest = normalize(`${job.description || ""} ${job.location || ""}`);

    let score = 0;
    const hits = [];
    for (const t of tokens) {
      if (title.includes(t)) {
        score += 4;
        hits.push(t);
      } else if (reqs.includes(t)) {
        score += 3;
        hits.push(t);
      } else if (rest.includes(t)) {
        score += 1;
        hits.push(t);
      }
    }
    return { job, score, hits };
  });

  // Threshold of 3 means a title hit or a requirements hit. A passing
  // mention in the description alone isn't enough to call it a match.
  return scored
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .map((s) => ({ ...s.job, _hits: [...new Set(s.hits)] }));
}

const RE = {
  greeting: /^(hi+|hey+|hello+|yo|sup|good (morning|afternoon|evening)|ayubowan)\b/,
  thanks: /^(thanks|thank you|thx|ty|cheers|ok|okay|got it|cool|nice|great)\b/,
  ownApplication:
    /\b(my applications?|my status|have i applied|did i apply|applied yet|where.{0,12}my application)\b/,
  listJobs:
    /\b(what (jobs|roles|positions)|open (jobs|roles|positions)|list (jobs|roles)|all (jobs|roles)|vacanc(y|ies)|hiring|openings)\b/,
};

/**
 * ctx = { jobs, applications, isLoggedIn, firstName }
 * Returns a reply object, or null meaning "let the AI answer".
 */
export function matchIntent(message, ctx) {
  const { jobs = [], applications = [], isLoggedIn = false, firstName } = ctx;
  const t = normalize(message);
  if (!t) return null;

  // --- Greetings -------------------------------------------------------
  if (t.length <= 30 && RE.greeting.test(t)) {
    return {
      source: "local",
      text: firstName
        ? `Hi ${firstName}. What are you looking for?`
        : "Hi. What kind of role are you after?",
    };
  }

  if (t.length <= 25 && RE.thanks.test(t)) {
    return { source: "local", text: "Anytime." };
  }

  // --- The person's own applications (needs the database) --------------
  if (RE.ownApplication.test(t)) {
    if (!isLoggedIn) {
      return {
        source: "local",
        text: "Log in and I can pull up your applications.",
        action: { label: "Log in", to: "/auth" },
      };
    }
    if (applications.length === 0) {
      return {
        source: "local",
        text: "You haven't applied to anything yet.",
        action: { label: "Browse roles", to: "/#open-positions" },
      };
    }
    const lines = applications.map(
      (a) => `• ${a.jobs?.title || "A role"} — ${a.status}`
    );
    return {
      source: "local",
      text: lines.join("\n"),
      action: { label: "Open my applications", to: "/status" },
    };
  }

  // --- What a status means ---------------------------------------------
  for (const key of Object.keys(STATUS_EXPLANATIONS)) {
    if (t.includes(key) && /\b(mean|means|meaning|what is|what does)\b/.test(t)) {
      return { source: "local", text: STATUS_EXPLANATIONS[key] };
    }
  }

  // --- List everything --------------------------------------------------
  if (RE.listJobs.test(t)) {
    if (jobs.length === 0) {
      return { source: "local", text: "Nothing open right now. Worth checking back." };
    }
    return {
      source: "local",
      text: `${jobs.length} open right now:`,
      jobs: jobs.slice(0, 6),
    };
  }

  // Everything else — including skills, the company, benefits, culture,
  // process questions — goes to the AI.
  return null;
}

export function fallbackReply() {
  return {
    source: "local",
    text: "I can't reach my answer service right now. Try again in a moment, or email hello@altrium.io.",
  };
}

export function starterQuestions(isLoggedIn) {
  const base = [
    "What roles are open?",
    "I know Python and SQL — what suits me?",
    "What's the company like?",
  ];
  return isLoggedIn ? ["Where are my applications?", ...base.slice(0, 2)] : base;
}