import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, RECOMMENDATIONS, scorePercent, scoreStyle } from "../lib/interviews";

export default function EvaluationForm() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [interview, setInterview] = useState(null);
  const [criteria, setCriteria] = useState([]);
  const [evaluation, setEvaluation] = useState(null);

  const [scores, setScores] = useState({});
  const [comments, setComments] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [result, setResult] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState("");

  const locked = evaluation && !evaluation.is_draft;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from("interviews")
        .select(
          `*,
           interview_stages(stage_id, code, name, interview_criteria(*)),
           applications(application_id, full_name, email, jobs(title)),
           evaluations(*)`
        )
        .eq("interview_id", interviewId)
        .single();

      if (loadError) {
        setError("Could not load this interview.");
        setLoading(false);
        return;
      }

      setInterview(data);

      const list = (data.interview_stages?.interview_criteria || [])
        .filter((c) => c.is_active)
        .sort((a, b) => a.sort_order - b.sort_order);
      setCriteria(list);

      // Fetched separately rather than relying on the nested join above.
      // If that embed comes back empty for any reason, the form would
      // think no draft exists and try to insert a duplicate.
      const { data: existing } = await supabase
        .from("evaluations")
        .select("*")
        .eq("interview_id", interviewId)
        .maybeSingle();

      if (existing) {
        setEvaluation(existing);
        setScores(existing.scores || {});
        setComments(existing.comments || "");
        setRecommendation(existing.recommendation || "");
      }
      if (data.result) setResult(data.result);

      setLoading(false);
    })();
  }, [interviewId]);

  const setScore = (code, value) => {
    const n = Math.max(0, Math.min(10, Number(value)));
    setScores((prev) => ({ ...prev, [code]: n }));
  };

  const total = criteria.reduce((sum, c) => sum + (Number(scores[c.code]) || 0), 0);
  const maxTotal = criteria.reduce((sum, c) => sum + c.max_score, 0);
  const percent = scorePercent(total, maxTotal);

  const allScored = criteria.every((c) => scores[c.code] !== undefined && scores[c.code] !== "");

  // --- Persist ----------------------------------------------------------
  // Upsert on interview_id rather than branching on React state. There's a
  // unique constraint on interview_id, and deciding insert-vs-update from
  // state breaks whenever a draft exists that this component hasn't loaded
  // — a reload mid-interview, or two tabs open.
  const persist = async ({ draft }) => {
    const payload = {
      interview_id: interviewId,
      application_id: interview.application_id,
      interviewer_id: user.id,
      scores,
      comments: comments || null,
      recommendation: recommendation || null,
      is_draft: draft,
      submitted_at: draft ? null : new Date().toISOString(),
    };

    return supabase
      .from("evaluations")
      .upsert(payload, { onConflict: "interview_id" })
      .select()
      .single();
  };

  const saveDraft = async () => {
    setError("");
    setSaving(true);
    const { data, error: saveError } = await persist({ draft: true });

    // Keep the pass/fail choice on the interview row while still a draft,
    // so it survives a page reload mid-interview.
    if (result) {
      await supabase.from("interviews").update({ result }).eq("interview_id", interviewId);
    }

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }
    setEvaluation(data);
    setSavedAt(new Date());
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!allScored) {
      setError("Score every criterion before submitting.");
      return;
    }
    if (!result) {
      setError("Choose whether the candidate passed this stage.");
      return;
    }
    if (!confirm("Submit this evaluation? It can't be edited afterwards.")) return;

    setSaving(true);

    const { data, error: saveError } = await persist({ draft: false });
    if (saveError) {
      setSaving(false);
      setError(saveError.message);
      return;
    }
    setEvaluation(data);

    // Marking the interview complete is what unlocks 'hired' for HR
    // once every stage has passed.
    const { error: interviewError } = await supabase
      .from("interviews")
      .update({
        status: "completed",
        result,
        completed_at: new Date().toISOString(),
      })
      .eq("interview_id", interviewId);

    setSaving(false);

    if (interviewError) {
      setError(interviewError.message);
      return;
    }
    navigate("/my-interviews");
  };

  if (loading) return <p className="max-w-2xl mx-auto px-5 py-16 text-ink/50">Loading…</p>;

  if (!interview) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-16">
        <p className="text-ink/60 mb-3">{error || "Interview not found."}</p>
        <Link to="/my-interviews" className="text-gold-700 font-semibold">← Back to my interviews</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-12">
      <Link to="/my-interviews" className="text-sm text-ink/50 hover:text-gold-700">
        ← Back to my interviews
      </Link>

      <h1 className="font-display text-2xl font-bold mt-3 mb-1">
        {interview.interview_stages?.name}
      </h1>
      <p className="text-ink/50 mb-2">
        {interview.applications?.full_name} — {interview.applications?.jobs?.title}
      </p>
      <p className="text-ink/40 text-sm mb-6">{formatDateTime(interview.scheduled_at)}</p>

      {interview.meeting_link && !locked && (
        <a
          href={interview.meeting_link}
          target="_blank"
          rel="noreferrer"
          className="btn-outline !px-4 !py-2 text-sm inline-block mb-6"
        >
          Join meeting
        </a>
      )}

      {locked && (
        <div className="mb-6 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg">
          Submitted {formatDateTime(evaluation.submitted_at)}. Evaluations are locked once
          submitted so the record stays intact.
        </div>
      )}

      {error && (
        <div className="mb-5 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <form onSubmit={submit} className="space-y-6">
        {/* Scores */}
        <div className="card p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
            <h2 className="font-display font-semibold">Scores</h2>
            <span className={`badge ${scoreStyle(percent)}`}>
              {total} / {maxTotal}
              {percent !== null ? ` — ${percent}%` : ""}
            </span>
          </div>

          <div className="space-y-5">
            {criteria.map((c) => {
              const value = scores[c.code];
              return (
                <div key={c.criterion_id}>
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <label className="text-sm font-medium">{c.label}</label>
                    <span className="text-sm text-ink/50 tabular-nums">
                      {value === undefined || value === "" ? "—" : value} / {c.max_score}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={c.max_score}
                      step={1}
                      disabled={Boolean(locked)}
                      value={value ?? 0}
                      onChange={(e) => setScore(c.code, e.target.value)}
                      className="flex-1 accent-gold disabled:opacity-50"
                    />
                    <input
                      type="number"
                      min={0}
                      max={c.max_score}
                      disabled={Boolean(locked)}
                      value={value ?? ""}
                      onChange={(e) => setScore(c.code, e.target.value)}
                      className="input-field !py-1.5 !px-2 w-16 text-sm text-center"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Comments and recommendation */}
        <div className="card p-5 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Comments</label>
            <textarea
              rows={4}
              disabled={Boolean(locked)}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Strengths, concerns, anything HR should know."
              className="input-field"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Recommendation</label>
            <select
              disabled={Boolean(locked)}
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
              className="input-field"
            >
              <option value="">Choose…</option>
              {RECOMMENDATIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Did they pass this stage?</label>

            {/* Radio inputs rather than buttons: the native control can't
                be swallowed by anything above it, and it's keyboard and
                screen-reader accessible for free. */}
            <div className="flex gap-3">
              {["pass", "fail"].map((v) => {
                const selected = result === v;
                return (
                  <label
                    key={v}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold capitalize cursor-pointer transition-colors ${
                      selected
                        ? v === "pass"
                          ? "border-green-700 bg-green-100 text-green-700"
                          : "border-red-700 bg-red-100 text-red-700"
                        : "border-ink/10 hover:border-ink/30"
                    } ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <input
                      type="radio"
                      name="interview-result"
                      value={v}
                      checked={selected}
                      disabled={Boolean(locked)}
                      onChange={() => setResult(v)}
                      className="accent-gold"
                    />
                    {v}
                  </label>
                );
              })}
            </div>

            <p className="text-xs text-ink/40 mt-2">
              {result
                ? `Marked as ${result}.`
                : "The candidate can't be hired until every stage is passed."}
            </p>
          </div>
        </div>

        {!locked && (
          <div className="flex gap-3 items-center flex-wrap">
            <button type="submit" disabled={saving} className="btn-primary flex-1 !py-3">
              {saving ? "Submitting…" : "Submit and mark complete"}
            </button>
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="btn-outline !py-3 !px-5"
            >
              Save draft
            </button>
          </div>
        )}

        {savedAt && !locked && (
          <p className="text-xs text-ink/40 text-center">
            Draft saved at {savedAt.toLocaleTimeString()}. You can close this and come back.
          </p>
        )}
      </form>
    </div>
  );
}
