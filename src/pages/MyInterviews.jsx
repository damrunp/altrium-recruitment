import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { formatDateTime } from "../lib/interviews";
import GradientBackdrop from "../components/GradientBackdrop";

// Shared glass treatment, matching the dashboard and applicants pages.
const GLASS = "rounded-2xl border border-white/70 bg-white/55 backdrop-blur-xl";

export default function MyInterviews() {
  const { user, profile } = useAuth();
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("time_asc");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("interviews")
        .select(
          `*,
           interview_stages(code, name),
           applications(application_id, full_name, email, jobs(title)),
           evaluations(evaluation_id, is_draft, total_score, max_total)`
        )
        .eq("interviewer_id", user.id)
        .order("scheduled_at", { ascending: true });

      setInterviews(data || []);
      setLoading(false);
    })();
  }, [user]);

  // Sorting applies within each group below, so "soonest first" still
  // means soonest within upcoming, completed and so on.
  const sorted = useMemo(() => {
    const list = [...interviews];

    if (sortBy === "time_desc") {
      list.sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
    } else if (sortBy === "job") {
      list.sort((a, b) => {
        const jobA = a.applications?.jobs?.title || "";
        const jobB = b.applications?.jobs?.title || "";
        const byJob = jobA.localeCompare(jobB);
        // Same job, soonest first — otherwise the order within a job
        // would be whatever the database happened to return.
        return byJob !== 0 ? byJob : new Date(a.scheduled_at) - new Date(b.scheduled_at);
      });
    } else {
      list.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    }

    return list;
  }, [interviews, sortBy]);

  const now = new Date();
  const upcoming = sorted.filter(
    (i) => i.status === "scheduled" && new Date(i.scheduled_at) >= now
  );
  const needsFeedback = sorted.filter(
    (i) => i.status === "scheduled" && new Date(i.scheduled_at) < now
  );
  const done = sorted.filter((i) => i.status === "completed");

  return (
    <div className="relative overflow-hidden min-h-[80vh]">
      <GradientBackdrop />

      <div className="relative z-10 max-w-4xl mx-auto px-5 py-12">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-8">
          <div>
            <h1 className="font-display text-2xl font-bold mb-1">My Interviews</h1>
            <p className="text-ink/50">
              Interviews assigned to you
              {profile?.role === "management" ? " as department manager" : ""}.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-ink/60">Sort by</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="input-field bg-white/60 backdrop-blur-md border-white/70 !py-2 text-sm w-auto"
              >
                <option value="time_asc">Soonest first</option>
                <option value="time_desc">Latest first</option>
                <option value="job">Job</option>
              </select>
            </div>

            <Link to="/availability" className="btn-outline !px-4 !py-2 text-sm">
              Set my availability
            </Link>
          </div>
        </div>

        {loading && <p className="text-ink/50">Loading…</p>}

        {!loading && interviews.length === 0 && (
          <div className={`${GLASS} p-10 text-center`}>
            <p className="text-ink/50 mb-4">
              Nothing scheduled yet. HR books interviews inside the hours you've set.
            </p>
            <Link to="/availability" className="btn-primary">
              Set my availability
            </Link>
          </div>
        )}

        {needsFeedback.length > 0 && (
          <Section
            title="Waiting on your feedback"
            hint="These have already taken place. Submitting your evaluation marks them complete."
            interviews={needsFeedback}
            highlight
          />
        )}

        {upcoming.length > 0 && <Section title="Upcoming" interviews={upcoming} />}

        {done.length > 0 && <Section title="Completed" interviews={done} muted />}
      </div>
    </div>
  );
}

function Section({ title, hint, interviews, highlight, muted }) {
  return (
    <section className="mb-8">
      <h2 className="font-display font-semibold text-lg mb-1">{title}</h2>
      {hint && <p className="text-ink/50 text-sm mb-3">{hint}</p>}

      <div className="space-y-3 mt-3">
        {interviews.map((i) => {
          const evaluation = i.evaluations?.[0];
          const submitted = evaluation && !evaluation.is_draft;

          return (
            <div
              key={i.interview_id}
              className={`${GLASS} p-5 flex items-center justify-between gap-4 flex-wrap ${
                highlight ? "!border-gold/60" : ""
              } ${muted ? "opacity-70" : ""}`}
            >
              <div className="min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold">{i.applications?.full_name}</p>
                  <span className="badge bg-ink/5 text-ink/60">
                    {i.interview_stages?.name}
                  </span>
                  {i.status === "completed" && (
                    <span
                      className={`badge ${
                        i.result === "pass"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {i.result || "completed"}
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink/50 mt-0.5">{i.applications?.jobs?.title}</p>
                <p className="text-sm text-ink/60 mt-1">{formatDateTime(i.scheduled_at)}</p>
                {submitted && (
                  <p className="text-xs text-ink/40 mt-1">
                    Your score: {evaluation.total_score} / {evaluation.max_total}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {i.meeting_link && i.status !== "completed" && (
                  <a
                    href={i.meeting_link}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-outline !px-4 !py-2 text-sm"
                  >
                    Join meeting
                  </a>
                )}

                {i.status === "completed" ? (
                  <Link
                    to={`/interviews/${i.interview_id}/evaluate`}
                    className="btn-outline !px-4 !py-2 text-sm"
                  >
                    View evaluation
                  </Link>
                ) : (
                  <Link
                    to={`/interviews/${i.interview_id}/evaluate`}
                    className="btn-primary !px-4 !py-2 text-sm"
                  >
                    {evaluation ? "Continue evaluation" : "Evaluate"}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
