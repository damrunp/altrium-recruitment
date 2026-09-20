import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import FinalizeDecisionModal from "../components/FinalizeDecisionModal";
import StatusBadge from "../components/StatusBadge";
import GradientBackdrop from "../components/GradientBackdrop";
import { formatDateTime, scorePercent, scoreStyle, RECOMMENDATIONS } from "../lib/interviews";

const RECOMMENDATION_LABELS = Object.fromEntries(
  RECOMMENDATIONS.map((r) => [r.value, r.label])
);

// The order statuses are ranked in when sorting by outcome — decided
// hires first, then people still in play, with rejections last.
const STATUS_ORDER = ["hired", "interview", "shortlisted", "pending", "blocked", "rejected"];

// Shared glass treatment, matching the job listings and dashboard.
const GLASS = "rounded-2xl border border-white/70 bg-white/55 backdrop-blur-xl";

export default function EvaluationDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const jobFilter = searchParams.get("job") || "all";

  const [rows, setRows] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [details, setDetails] = useState({});
  const [finalizing, setFinalizing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("overall_desc");

  const load = async () => {
    setLoading(true);
    const [summary, jobList] = await Promise.all([
      supabase.from("candidate_evaluation_summary").select("*"),
      supabase.from("jobs").select("job_id, title").order("created_at", { ascending: false }),
    ]);
    setRows(summary.data || []);
    setJobs(jobList.data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const jobTitle = (jobId) => jobs.find((j) => j.job_id === jobId)?.title || "the role";

  const loadDetails = async (applicationId) => {
    if (details[applicationId]) return;

    const { data } = await supabase
      .from("evaluations")
      .select(
        `*,
         interviews(interview_id, result, completed_at,
           interview_stages(code, name, interview_criteria(code, label, sort_order, max_score))),
         profiles!evaluations_interviewer_id_fkey(first_name, last_name)`
      )
      .eq("application_id", applicationId)
      .eq("is_draft", false);

    setDetails((prev) => ({ ...prev, [applicationId]: data || [] }));
  };

  const toggle = (applicationId) => {
    if (expanded === applicationId) {
      setExpanded(null);
      return;
    }
    setExpanded(applicationId);
    loadDetails(applicationId);
  };

  const readyToFinalize = (r) =>
    r.technical_status === "completed" &&
    r.managerial_status === "completed" &&
    r.technical_result === "pass" &&
    r.managerial_result === "pass";

  const anyFailed = (r) => r.technical_result === "fail" || r.managerial_result === "fail";

  const isFinal = (r) =>
    r.status === "hired" || r.status === "rejected" || r.status === "blocked";

  const visible = useMemo(() => {
    let list = jobFilter === "all" ? [...rows] : rows.filter((r) => r.job_id === jobFilter);

    list = list.filter(
      (r) => r.technical_status || r.managerial_status || r.status === "interview"
    );

    if (sortBy === "overall_desc") {
      list.sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));
    } else if (sortBy === "technical_desc") {
      list.sort((a, b) => (b.technical_score ?? -1) - (a.technical_score ?? -1));
    } else if (sortBy === "managerial_desc") {
      list.sort((a, b) => (b.managerial_score ?? -1) - (a.managerial_score ?? -1));
    } else if (sortBy === "status") {
      list.sort((a, b) => {
        const rank = (s) => {
          const i = STATUS_ORDER.indexOf(s);
          return i === -1 ? STATUS_ORDER.length : i;
        };
        const diff = rank(a.status) - rank(b.status);
        // Within a status, best overall score first.
        return diff !== 0 ? diff : (b.overall_score ?? 0) - (a.overall_score ?? 0);
      });
    }
    return list;
  }, [rows, jobFilter, sortBy]);

  return (
    <div className="relative overflow-hidden min-h-[80vh]">
      <GradientBackdrop />

      <div className="relative z-10 max-w-6xl mx-auto px-5 py-12">
        <Link to="/dashboard" className="text-sm text-ink/50 hover:text-gold-700">
          ← Back to dashboard
        </Link>

        <h1 className="font-display text-2xl font-bold mt-3 mb-1">Candidate Evaluations</h1>
        <p className="text-ink/50 mb-6">
          Scores from both interview stages. Open a row for the per-criterion breakdown.
        </p>

        {/* Filters */}
        <div className={`${GLASS} p-5 mb-6 flex flex-wrap items-center gap-4`}>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-ink/60">Job</label>
            <select
              value={jobFilter}
              onChange={(e) =>
                setSearchParams(e.target.value === "all" ? {} : { job: e.target.value })
              }
              className="input-field !py-2 text-sm w-auto"
            >
              <option value="all">All jobs</option>
              {jobs.map((j) => (
                <option key={j.job_id} value={j.job_id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-ink/60">Sort by</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="input-field !py-2 text-sm w-auto"
            >
              <option value="overall_desc">Overall score</option>
              <option value="status">Outcome (hired → rejected)</option>
              <option value="technical_desc">Technical score</option>
              <option value="managerial_desc">Managerial score</option>
            </select>
          </div>

          <p className="text-sm text-ink/50 ml-auto">
            {visible.length} candidate{visible.length === 1 ? "" : "s"}
          </p>
        </div>

        {loading && <p className="text-ink/50">Loading…</p>}

        {!loading && visible.length === 0 && (
          <div className={`${GLASS} p-10 text-center text-ink/50`}>
            No candidates have reached the interview stage yet.
          </div>
        )}

        <div className="space-y-3">
          {visible.map((r) => {
            const overallPct = scorePercent(r.overall_score, r.overall_max);
            const isOpen = expanded === r.application_id;
            const canFinalize = readyToFinalize(r) && !isFinal(r);
            const canReject = anyFailed(r) && !isFinal(r);

            return (
              <div key={r.application_id} className={`${GLASS} overflow-hidden`}>
                <div className="p-5">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <button
                      onClick={() => toggle(r.application_id)}
                      className="text-left min-w-[200px] flex-1"
                    >
                      <p className="font-semibold">{r.full_name}</p>
                      <p className="text-sm text-ink/50">{r.email}</p>
                      {/* Shared badge, so hired / rejected / interview /
                          blocked read the same colours as everywhere else. */}
                      <span className="mt-1.5 inline-block">
                        <StatusBadge status={r.status} />
                      </span>
                    </button>

                    <div className="flex items-center gap-6 flex-wrap text-sm">
                      <StageScore
                        label="Technical"
                        score={r.technical_score}
                        max={r.technical_max}
                        result={r.technical_result}
                        status={r.technical_status}
                      />
                      <StageScore
                        label="Managerial"
                        score={r.managerial_score}
                        max={r.managerial_max}
                        result={r.managerial_result}
                        status={r.managerial_status}
                      />

                      <div className="text-center">
                        <p className="text-xs text-ink/40 mb-1">Overall</p>
                        <span className={`badge ${scoreStyle(overallPct)}`}>
                          {r.overall_max ? `${r.overall_score} / ${r.overall_max}` : "—"}
                        </span>
                      </div>

                      <button
                        onClick={() => toggle(r.application_id)}
                        className="text-ink/30 text-lg px-1"
                        aria-label="Toggle breakdown"
                      >
                        {isOpen ? "▴" : "▾"}
                      </button>
                    </div>
                  </div>

                  {(canFinalize || canReject) && (
                    <div className="mt-4 pt-4 border-t border-white/60 flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-sm">
                        {canFinalize ? (
                          <span className="text-green-700 font-medium">
                            Both stages passed — ready for your decision
                          </span>
                        ) : (
                          <span className="text-red-700 font-medium">
                            A stage was failed — ready for your decision
                          </span>
                        )}
                      </p>
                      <button
                        onClick={() =>
                          setFinalizing({
                            application_id: r.application_id,
                            full_name: r.full_name,
                            email: r.email,
                            jobs: { title: jobTitle(r.job_id) },
                          })
                        }
                        className="btn-primary !px-4 !py-2 text-sm"
                      >
                        Finalize decision
                      </button>
                    </div>
                  )}

                  {isFinal(r) && (
                    <div className="mt-4 pt-4 border-t border-white/60">
                      <p className="text-sm text-ink/50">
                        {r.status === "blocked" ? (
                          <>Blocked — this candidate was hired for another role.</>
                        ) : (
                          <>
                            Finalized as{" "}
                            <span className="font-semibold capitalize">{r.status}</span>. The
                            candidate has been emailed.
                          </>
                        )}
                      </p>
                    </div>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-white/60 p-5 bg-white/35 backdrop-blur-md">
                    <Breakdown evaluations={details[r.application_id]} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {finalizing && (
          <FinalizeDecisionModal
            application={finalizing}
            summary={rows.find((r) => r.application_id === finalizing.application_id)}
            onClose={() => setFinalizing(null)}
            onDone={load}
          />
        )}
      </div>
    </div>
  );
}

function StageScore({ label, score, max, result, status }) {
  const pct = scorePercent(score, max);

  return (
    <div className="text-center min-w-[92px]">
      <p className="text-xs text-ink/40 mb-1">{label}</p>
      {score === null || score === undefined ? (
        <span className="badge bg-gray-100 text-gray-500">
          {status === "scheduled" ? "scheduled" : "—"}
        </span>
      ) : (
        <span className={`badge ${scoreStyle(pct)}`}>
          {score} / {max}
          {result ? ` · ${result}` : ""}
        </span>
      )}
    </div>
  );
}

function Breakdown({ evaluations }) {
  if (!evaluations) return <p className="text-ink/50 text-sm">Loading breakdown…</p>;
  if (evaluations.length === 0) {
    return <p className="text-ink/50 text-sm">No submitted evaluations yet.</p>;
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {evaluations.map((ev) => {
        const stage = ev.interviews?.interview_stages;
        const criteria = (stage?.interview_criteria || []).sort(
          (a, b) => a.sort_order - b.sort_order
        );

        return (
          <div key={ev.evaluation_id}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-display font-semibold text-sm">{stage?.name}</h3>
              <span className={`badge ${scoreStyle(scorePercent(ev.total_score, ev.max_total))}`}>
                {ev.total_score} / {ev.max_total}
              </span>
            </div>

            <table className="w-full text-sm">
              <tbody>
                {criteria.map((c) => {
                  const value = ev.scores?.[c.code];
                  return (
                    <tr key={c.code} className="border-b border-ink/5 last:border-0">
                      <td className="py-1.5 text-ink/70">{c.label}</td>
                      <td className="py-1.5 text-right w-20">
                        <span className="font-semibold tabular-nums">{value ?? "—"}</span>
                        <span className="text-ink/40"> / {c.max_score}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <dl className="mt-3 text-xs space-y-1">
              <div className="flex gap-2">
                <dt className="text-ink/40">Interviewer</dt>
                <dd>
                  {ev.profiles?.first_name} {ev.profiles?.last_name}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-ink/40">Recommendation</dt>
                <dd className="font-medium">{RECOMMENDATION_LABELS[ev.recommendation] || "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-ink/40">Submitted</dt>
                <dd>{formatDateTime(ev.submitted_at)}</dd>
              </div>
            </dl>

            {ev.comments && (
              <p className="mt-3 text-sm text-ink/70 bg-white/70 backdrop-blur-sm rounded-lg border border-white/70 px-3 py-2 whitespace-pre-line">
                {ev.comments}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
