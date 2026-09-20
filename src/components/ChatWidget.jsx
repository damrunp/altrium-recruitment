import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { matchIntent, fallbackReply, starterQuestions } from "../lib/chatKnowledge";

// Hard caps. These keep a public endpoint from becoming a runaway bill.
const MAX_INPUT_CHARS = 500;
const MAX_HISTORY_TURNS = 10;
const MAX_AI_CALLS_PER_SESSION = 20;

const STORAGE_KEY = "altrium_chat_v1";

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.9-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 12 16-8-5.5 16-3-6.5L4 12z" />
    </svg>
  );
}

export default function ChatWidget() {
  const { session, profile, isStaff } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [aiCalls, setAiCalls] = useState(0);

  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // The panel has to stay in the DOM while it animates shut, so opening
  // and "is it rendered" are two separate things.
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    // Matches the longest CSS transition below.
    const timer = setTimeout(() => setRendered(false), 300);
    return () => clearTimeout(timer);
  }, [open]);

  const isLoggedIn = Boolean(session);

  // Everything the rule-based layer needs to answer.
  const ctx = {
    jobs,
    applications,
    isLoggedIn,
    firstName: profile?.first_name,
    lastName: profile?.last_name,
    email: profile?.email,
  };

  // --- Restore the thread across page navigations ---------------------
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setMessages(parsed.messages || []);
        setAiCalls(parsed.aiCalls || 0);
      }
    } catch {
      // Corrupt or blocked storage — start fresh.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, aiCalls }));
    } catch {
      // Storage full or blocked — chat still works, it just won't persist.
    }
  }, [messages, aiCalls]);

  // --- Fresh data every time the panel opens ---------------------------
  // This is what keeps the bot current: a job posted a minute ago shows
  // up, one just closed disappears. Nothing is cached.
  const loadContext = useCallback(async () => {
    const { data: jobData } = await supabase
      .from("jobs")
      .select("job_id, title, location, description, requirements, responsibilities")
      .eq("status", "open")
      .order("created_at", { ascending: false });
    setJobs(jobData || []);

    if (session?.user) {
      const { data: appData } = await supabase
        .from("applications")
        .select("application_id, status, applied_at, job_id, jobs(title)")
        .eq("candidate_id", session.user.id)
        .order("applied_at", { ascending: false });
      setApplications(appData || []);
    } else {
      setApplications([]);
    }
  }, [session]);

  useEffect(() => {
    if (open) loadContext();
  }, [open, loadContext]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Staff don't need a candidate-facing bot.
  if (isStaff) return null;

  const pushMessage = (msg) =>
    setMessages((prev) => [...prev, { ...msg, id: crypto.randomUUID() }]);

  // --- AI fallback -------------------------------------------------------
  // Returns a reply object, or null meaning "AI unavailable — degrade".
  const askAI = async (question, history) => {
    if (aiCalls >= MAX_AI_CALLS_PER_SESSION) return null;

    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The user's own token, so the server reads their data through
        // RLS. No service-role key is involved anywhere.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message: question.slice(0, MAX_INPUT_CHARS),
        history: history.slice(-MAX_HISTORY_TURNS).map((m) => ({
          role: m.role,
          text: m.text,
        })),
      }),
    });

    setAiCalls((n) => n + 1);

    // If /api isn't running (plain `npm run dev` serves index.html here),
    // this is not JSON. Treat it as "AI unavailable" rather than an error.
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.warn(
        "/api/chat did not return JSON. Use `vercel dev` locally, or check the deployment."
      );
      return null;
    }

    const payload = await res.json();
    if (!res.ok || !payload.reply) return null;

    return { text: payload.reply, jobs: payload.jobs || [] };
  };

  // --- Send ---------------------------------------------------------------
  const send = async (raw) => {
    const question = (raw ?? input).trim();
    if (!question || thinking) return;

    setInput("");
    const userMsg = { role: "user", text: question };
    pushMessage(userMsg);

    // Free local layer first. Handles most real questions.
    const local = matchIntent(question, ctx);
    if (local) {
      pushMessage({ role: "assistant", ...local });
      return;
    }

    setThinking(true);
    try {
      const reply = await askAI(question, [...messages, userMsg]);
      pushMessage(
        reply
          ? { role: "assistant", source: "ai", ...reply }
          : { role: "assistant", ...fallbackReply() }
      );
    } catch (err) {
      console.warn("chat request failed", err);
      pushMessage({ role: "assistant", ...fallbackReply() });
    } finally {
      setThinking(false);
    }
  };

  const starters = starterQuestions(isLoggedIn);

  return (
    <>
      {/* Launcher */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
        {/* A label that fades away once someone has opened the chat, so
            the button is findable without hunting the corners. */}
        {!open && messages.length === 0 && (
          <span className="hidden sm:block bg-ink text-white text-sm font-medium px-3.5 py-2 rounded-xl shadow-lg">
            Need help?
          </span>
        )}

        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close chat" : "Open chat"}
          aria-expanded={open}
          className="relative w-16 h-16 rounded-full bg-gold text-ink shadow-[0_8px_24px_-6px_rgba(0,0,0,0.45)] hover:shadow-[0_12px_32px_-6px_rgba(0,0,0,0.5)] flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
        >
          {/* Slow halo so the button registers in peripheral vision. */}
          {!open && (
            <>
              <span className="absolute inset-0 rounded-full bg-gold animate-ping opacity-20" style={{ animationDuration: "2.5s" }} />
              <span className="absolute inset-0 rounded-full ring-4 ring-gold/30" />
            </>
          )}

          <span
            className="relative transition-transform duration-300"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            {open ? <CloseIcon /> : <ChatIcon />}
          </span>
        </button>
      </div>

      {/* Panel */}
      {rendered && (
        <div
          role="dialog"
          aria-label="Careers assistant"
          className="fixed bottom-28 right-6 z-50 flex flex-col w-[min(384px,calc(100vw-3rem))] h-[min(560px,calc(100vh-10rem))] rounded-2xl bg-white border border-ink/10 shadow-2xl overflow-hidden"
          style={{
            // Grows out of the launcher and collapses back into it. The
            // origin sits on the launcher's centre, so it genuinely
            // expands from the icon rather than from the panel's corner.
            transformOrigin: "calc(100% - 2rem) calc(100% + 3.5rem)",
            opacity: open ? 1 : 0,
            transform: open
              ? "scale(1) translateY(0)"
              : "scale(0.2) translateY(8px)",
            transition: open
              ? "opacity 180ms ease-out, transform 420ms cubic-bezier(0.16,1,0.3,1)"
              : "opacity 160ms ease-in, transform 260ms cubic-bezier(0.4,0,1,1)",
            pointerEvents: open ? "auto" : "none",
            willChange: "transform, opacity",
          }}
        >
          <div className="flex items-center justify-between px-5 py-4 bg-ink text-white shrink-0">
            <div>
              <p className="font-display font-semibold">Careers assistant</p>
              <p className="text-white/50 text-xs">
                {jobs.length} open {jobs.length === 1 ? "role" : "roles"}
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="text-white/50 hover:text-gold text-xs font-medium transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <p className="text-ink/60 text-sm mb-5">
                  Ask about our open roles, what a job needs, or how applying works.
                </p>
                <div className="flex flex-col gap-2">
                  {starters.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="text-sm text-left px-3.5 py-2.5 rounded-lg border border-ink/10 hover:border-gold hover:bg-gold/5 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id}>
                <div
                  className={
                    m.role === "user"
                      ? "ml-auto w-fit max-w-[85%] bg-ink text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm"
                      : "mr-auto w-fit max-w-[90%] bg-ink/5 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm whitespace-pre-line"
                  }
                >
                  {m.text}
                </div>

                {m.jobs?.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {m.jobs.map((job) => (
                      <Link
                        key={job.job_id}
                        to={`/jobs/${job.job_id}`}
                        onClick={() => setOpen(false)}
                        className="block rounded-xl border border-ink/10 hover:border-gold hover:bg-gold/5 px-4 py-3 transition-colors"
                      >
                        <p className="font-semibold text-sm">{job.title}</p>
                        {job.location && (
                          <p className="text-ink/50 text-xs mt-0.5">{job.location}</p>
                        )}
                      </Link>
                    ))}
                  </div>
                )}

                {m.action && (
                  <Link
                    to={m.action.to}
                    onClick={() => setOpen(false)}
                    className="inline-block mt-2 text-gold-700 font-semibold text-sm hover:underline"
                  >
                    {m.action.label}
                  </Link>
                )}
              </div>
            ))}

            {thinking && (
              <div className="mr-auto w-fit bg-ink/5 rounded-2xl rounded-bl-sm px-4 py-3">
                <span className="flex gap-1.5" aria-label="Thinking">
                  <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-ink/10 p-3 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={MAX_INPUT_CHARS}
                placeholder="Ask about a role…"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                className="flex-1 resize-none input-field !py-2.5 text-sm max-h-24"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || thinking}
                aria-label="Send message"
                className="w-10 h-10 shrink-0 rounded-lg bg-gold text-ink flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                <SendIcon />
              </button>
            </div>
            <p className="text-ink/30 text-[11px] mt-2 text-center">
              Answers come from our live job listings and may not be complete.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
