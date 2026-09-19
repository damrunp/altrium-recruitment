import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import GradientBackdrop from "../components/GradientBackdrop";
import { formatDateTime } from "../lib/interviews";

// Shared glass treatment, matching the job listings.
const GLASS = "rounded-2xl border border-white/70 bg-white/55 backdrop-blur-xl";

export default function CandidateStatus() {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(job_id, title)")
        .eq("candidate_id", user.id)
        .order("applied_at", { ascending: false });

      if (!error) setApplications(data || []);

      // RLS lets candidates read their own interviews, which is how the
      // date, time and meeting link get here.
      const ids = (data || []).map((a) => a.application_id);
      if (ids.length > 0) {
        const { data: interviewData } = await supabase
          .from("interviews")
          .select("*, interview_stages(code, name, sort_order)")
          .in("application_id", ids)
          .order("scheduled_at");
        setInterviews(interviewData || []);
      }

      setLoading(false);
    })();
  }, [user]);

  const interviewsFor = (applicationId) =>
    interviews
      .filter((i) => i.application_id === applicationId)
      .sort(
        (a, b) => (a.interview_stages?.sort_order ?? 0) - (b.interview_stages?.sort_order ?? 0)
      );

  return (
    <div className="relative min-h-[80vh]">
      {/* Clipping box for the backdrop, so the page root never becomes a
          scroll container. */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <GradientBackdrop />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-5 py-12">
        <h1 className="font-display text-2xl font-bold mb-1">My Applications</h1>
        <p className="text-ink/50 mb-8">Track the status of every job you've applied for.</p>

        {loading && <p className="text-ink/50">Loading…</p>}

        {!loading && applications.length === 0 && (
          <div className={`${GLASS} p-10 text-center`}>
            <p className="text-ink/50 mb-4">You haven't applied to any jobs yet.</p>
            <Link to="/#open-positions" className="btn-primary">
              Browse Open Jobs
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {applications.map((app) => {
            const appInterviews = interviewsFor(app.application_id);

            return (
              <div key={app.application_id} className={`${GLASS} p-5`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="font-semibold">{app.jobs?.title || "Job"}</p>
                    <p className="text-sm text-ink/50">
                      Applied on {new Date(app.applied_at).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={app.status} />
                </div>

                {app.status === "blocked" && (
                  <p className="mt-3 text-sm text-ink/60 bg-white/50 backdrop-blur-sm border border-white/60 rounded-lg px-4 py-3">
                    You've accepted a role with us elsewhere, so this application is closed.
                    Congratulations.
                  </p>
                )}

                {appInterviews.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/60 space-y-3">
                    <p className="text-sm font-semibold">Your interviews</p>

                    {appInterviews.map((i) => {
                      const upcoming =
                        i.status === "scheduled" && new Date(i.scheduled_at) >= new Date();

                      return (
                        <div
                          key={i.interview_id}
                          className={`rounded-xl border backdrop-blur-sm px-4 py-3 ${
                            upcoming
                              ? "border-gold/50 bg-gold/10"
                              : "border-white/60 bg-white/40"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <p className="font-medium text-sm">{i.interview_stages?.name}</p>
                              <p className="text-sm text-ink/60 mt-0.5">
                                {formatDateTime(i.scheduled_at)} · {i.duration_minutes} min
                              </p>
                              {i.location && (
                                <p className="text-xs text-ink/40 mt-0.5">{i.location}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {i.status === "completed" ? (
                                <span className="badge bg-ink/5 text-ink/60">Completed</span>
                              ) : i.status === "cancelled" ? (
                                <span className="badge bg-gray-100 text-gray-600">Cancelled</span>
                              ) : (
                                <span className="badge bg-blue-100 text-blue-700">Scheduled</span>
                              )}

                              {i.meeting_link && i.status === "scheduled" && (
                                <a
                                  href={i.meeting_link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-primary !px-4 !py-1.5 text-sm"
                                >
                                  Join
                                </a>
                              )}
                            </div>
                          </div>

                          {upcoming && (
                            <p className="text-xs text-ink/40 mt-2">
                              The join link opens at the scheduled time. Add it to your calendar
                              so you don't miss it.
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {/* Deliberately no scores or interviewer feedback here —
                        evaluations are internal. */}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
