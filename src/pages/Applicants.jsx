import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase, APPLICATION_STATUSES } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import FinalizeDecisionModal from "../components/FinalizeDecisionModal";
import { formatDateTime } from "../lib/interviews";

const STATUS_PROGRESS_ORDER = ["pending", "shortlisted", "interview", "hired", "rejected"];

// HR moves candidates through these by hand. 'hired' and 'rejected' are
// final outcomes and go through the finalize flow instead, so an email
// always accompanies them.
const MANUAL_STATUSES = ["pending", "shortlisted", "interview"];

function ScoreBadge({ score }) {
  if (score === null || score === undefined) {
    return <span className="badge bg-gray-100 text-gray-500">No score</span>;
  }
  let style = "bg-red-100 text-red-700";
  if (score >= 70) style = "bg-green-100 text-green-700";
  else if (score >= 40) style = "bg-gold-100 text-gold-800";
  return <span className={`badge ${style}`}>{score}% match</span>;
}

export default function Applicants() {
  const { jobId } = useParams();
  const { isHR } = useAuth();

  const [job, setJob] = useState(null);
  const [applications, setApplications] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");
  const [finalizing, setFinalizing] = useState(null);
  const [sortBy, setSortBy] = useState("score_desc");
  const [statusFilter, setStatusFilter] = useState("all");
  const [threshold, setThreshold] = useState(40);

  const load = async () => {
    setLoading(true);
    const { data: jobData } = await supabase.from("jobs").select("*").eq("job_id", jobId).single();
    setJob(jobData);

    const { data: appData } = await supabase
      .from("applications")
      .select("*, jobs(job_id, title)")
      .eq("job_id", jobId)
      .order("applied_at", { ascending: false });
    setApplications(appData || []);

    const ids = (appData || []).map((a) => a.application_id);
    if (ids.length > 0) {
      const [interviewRes, summaryRes] = await Promise.all([
        supabase
          .from("interviews")
          .select(
            "*, interview_stages(code, name, sort_order), profiles!interviews_interviewer_id_fkey(first_name, last_name)"
          )
          .in("application_id", ids),
        // Scores, so HR sees what they're deciding on. Only HR can read
        // this view's evaluation columns — RLS handles that.
        isHR
          ? supabase.from("candidate_evaluation_summary").select("*").in("application_id", ids)
          : Promise.resolve({ data: [] }),
      ]);
      setInterviews(interviewRes.data || []);
      setSummaries(summaryRes.data || []);
    } else {
      setInterviews([]);
      setSummaries([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [jobId, isHR]);

  const interviewsFor = (applicationId) =>
    interviews
      .filter((i) => i.application_id === applicationId)
      .sort(
        (a, b) => (a.interview_stages?.sort_order ?? 0) - (b.interview_stages?.sort_order ?? 0)
      );

  const summaryFor = (applicationId) =>
    summaries.find((s) => s.application_id === applicationId);

  // Ready to finalize once every scheduled stage is completed and passed,
  // and there are at least two of them.
  const readyToFinalize = (applicationId) => {
    const list = interviewsFor(applicationId);
    return (
      list.length >= 2 &&
      list.every((i) => i.status === "completed") &&
      list.every((i) => i.result === "pass")
    );
  };

  const anyInterviewFailed = (applicationId) =>
    interviewsFor(applicationId).some((i) => i.status === "completed" && i.result === "fail");

  const sortedApplications = useMemo(() => {
    let list =
      statusFilter === "all"
        ? [...applications]
        : applications.filter((a) => a.status === statusFilter);

    if (sortBy === "score_desc") {
      list.sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
    } else if (sortBy === "score_asc") {
      list.sort((a, b) => (a.match_score ?? 999) - (b.match_score ?? 999));
    } else if (sortBy === "status") {
      list.sort(
        (a, b) =>
          STATUS_PROGRESS_ORDER.indexOf(a.status) - STATUS_PROGRESS_ORDER.indexOf(b.status)
      );
    } else {
      list.sort((a, b) => new Date(b.applied_at) - new Date(a.applied_at));
    }
    return list;
  }, [applications, sortBy, statusFilter]);

  const belowThresholdCount = applications.filter(
    (a) => a.match_score !== null && a.match_score < threshold && a.status === "pending"
  ).length;

  const handleStatusChange = async (applicationId, status) => {
    setError("");
    setUpdatingId(applicationId);

    const { error: updateError } = await supabase
      .from("applications")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("application_id", applicationId);

    if (updateError) setError(updateError.message);

    await load();
    setUpdatingId(null);
  };

  const rejectBelowThreshold = async () => {
    if (belowThresholdCount === 0) return;
    if (
      !confirm(
        `Reject ${belowThresholdCount} pending applicant(s) scoring below ${threshold}%? No email is sent for these.`
      )
    )
      return;

    const ids = applications
      .filter((a) => a.match_score !== null && a.match_score < threshold && a.status === "pending")
      .map((a) => a.application_id);

    await supabase
      .from("applications")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .in("application_id", ids);
    await load();
  };

  const viewCv = async (cvPath) => {
    const { data, error: cvError } = await supabase.storage
      .from("cvs")
      .createSignedUrl(cvPath, 60 * 5);
    if (!cvError && data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="max-w-5xl mx-auto px-5 py-12">
      <Link to="/dashboard" className="text-sm text-ink/50 hover:text-gold-700">
        ← Back to dashboard
      </Link>

      <h1 className="font-display text-2xl font-bold mt-3 mb-1">
        Applicants {job ? `— ${job.title}` : ""}
      </h1>
      <p className="text-ink/50 mb-6">
        {statusFilter === "all"
          ? `${applications.length} total applicant(s)`
          : `${sortedApplications.length} of ${applications.length} applicant(s) — filtered to "${statusFilter}"`}
        {!isHR && " · read-only"}
      </p>

      {error && (
        <div className="mb-5 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {/* Controls */}
      <div className="card p-5 mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-ink/60">Sort by</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="input-field !py-2 text-sm w-auto"
          >
            <option value="score_desc">Best match first</option>
            <option value="score_asc">Worst match first</option>
            <option value="status">Status (progress)</option>
            <option value="recent">Most recent</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-ink/60">Filter status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field !py-2 text-sm w-auto"
          >
            <option value="all">All statuses</option>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {isHR && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-ink/60">Auto-reject below</label>
              <input
                type="number"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="input-field !py-2 text-sm w-20"
              />
              <span className="text-sm text-ink/50">% match</span>
            </div>

            <button
              onClick={rejectBelowThreshold}
              disabled={belowThresholdCount === 0}
              className="btn-secondary !py-2 text-sm ml-auto"
            >
              Reject {belowThresholdCount} low-match applicant
              {belowThresholdCount === 1 ? "" : "s"}
            </button>
          </>
        )}
      </div>

      {loading && <p className="text-ink/50">Loading…</p>}

      {!loading && applications.length === 0 && (
        <div className="card p-10 text-center text-ink/50">No applications yet for this job.</div>
      )}

      <div className="space-y-3">
        {sortedApplications.map((app) => {
          const appInterviews = interviewsFor(app.application_id);
          const canFinalize = isHR && readyToFinalize(app.application_id);
          const failed = anyInterviewFailed(app.application_id);
          const isFinal = app.status === "hired" || app.status === "rejected";

          return (
            <div key={app.application_id} className="card p-5">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{app.full_name}</p>
                    <ScoreBadge score={app.match_score} />
                  </div>
                  <p className="text-sm text-ink/50">{app.email}</p>
                  <p className="text-sm text-ink/50">NIC: {app.nic}</p>
                  <p className="text-xs text-ink/40 mt-1">
                    Applied {new Date(app.applied_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => viewCv(app.cv_path)}
                    className="btn-outline !px-4 !py-2 text-sm"
                  >
                    View CV
                  </button>

                  {isHR && app.status === "interview" && (
                    <Link
                      to={`/dashboard/applications/${app.application_id}/schedule`}
                      className="btn-outline !px-4 !py-2 text-sm"
                    >
                      {appInterviews.length === 0 ? "Schedule interview" : "Manage interviews"}
                    </Link>
                  )}

                  {isHR && !isFinal && (canFinalize || failed) && (
                    <button
                      onClick={() => setFinalizing(app)}
                      className="btn-primary !px-4 !py-2 text-sm"
                    >
                      Finalize decision
                    </button>
                  )}

                  {/* Only the in-progress statuses are hand-editable.
                      Hiring and rejecting go through Finalize so the
                      candidate always gets told. */}
                  {isHR && !isFinal && (
                    <select
                      disabled={updatingId === app.application_id}
                      value={app.status}
                      onChange={(e) => handleStatusChange(app.application_id, e.target.value)}
                      className="input-field !py-2 text-sm w-auto"
                    >
                      {MANUAL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  )}

                  <StatusBadge status={app.status} />
                </div>
              </div>

              {/* Interview progress */}
              {appInterviews.length > 0 && (
                <div className="mt-4 pt-4 border-t border-ink/10 flex flex-wrap gap-3 items-center">
                  {appInterviews.map((i) => (
                    <div
                      key={i.interview_id}
                      className="rounded-lg border border-ink/10 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{i.interview_stages?.name}</span>
                        <span
                          className={`badge ${
                            i.status === "completed"
                              ? i.result === "pass"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {i.status === "completed" ? i.result || "completed" : i.status}
                        </span>
                      </div>
                      <p className="text-ink/50 mt-1">
                        {formatDateTime(i.scheduled_at)} · {i.profiles?.first_name}{" "}
                        {i.profiles?.last_name}
                      </p>
                    </div>
                  ))}

                  {canFinalize && (
                    <span className="text-xs text-green-700 font-medium">
                      Both stages passed — ready to finalize
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {finalizing && (
        <FinalizeDecisionModal
          application={finalizing}
          summary={summaryFor(finalizing.application_id)}
          onClose={() => setFinalizing(null)}
          onDone={load}
        />
      )}
    </div>
  );
}
