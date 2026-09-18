import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// ---------------------------------------------------------------------
// Two-step confirmation, because this is irreversible from the
// candidate's point of view — an email goes out the moment it completes.
//
//   Step 1  choose the decision, see the scores that justify it
//   Step 2  confirm the exact address the email will reach
// ---------------------------------------------------------------------

export default function FinalizeDecisionModal({ application, summary, onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [decision, setDecision] = useState("hired");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !sending && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  const send = async () => {
    setError("");
    setSending(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;

      const res = await fetch("/api/send-decision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          applicationId: application.application_id,
          decision,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          `Server returned an unexpected response (status ${res.status}). ` +
            "If you're running locally, use `vercel dev` so the /api routes work."
        );
      }

      const payload = await res.json();

      if (!res.ok) {
        setError(payload.error || "Could not finalize this decision.");
        // The status may still have changed even when the email failed.
        if (payload.statusUpdated) onDone?.();
        return;
      }

      setResult(payload);
      setStep(3);
      onDone?.();
    } catch (err) {
      setError(err.message || "Network error — please try again.");
    } finally {
      setSending(false);
    }
  };

  const isHire = decision === "hired";

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !sending && onClose()}
    >
      <div
        role="dialog"
        aria-label="Finalize hiring decision"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        {/* ---------------- Step 1: choose ---------------- */}
        {step === 1 && (
          <div className="p-6">
            <h2 className="font-display text-xl font-bold mb-1">Finalize decision</h2>
            <p className="text-ink/50 text-sm mb-5">
              {application.full_name} — {application.jobs?.title || "this role"}
            </p>

            {summary && (
              <div className="rounded-xl border border-ink/10 p-4 mb-5 text-sm space-y-1.5">
                <Row
                  label="Technical"
                  value={
                    summary.technical_score !== null
                      ? `${summary.technical_score} / ${summary.technical_max} · ${summary.technical_result || "—"}`
                      : "Not completed"
                  }
                />
                <Row
                  label="Managerial"
                  value={
                    summary.managerial_score !== null
                      ? `${summary.managerial_score} / ${summary.managerial_max} · ${summary.managerial_result || "—"}`
                      : "Not completed"
                  }
                />
                <div className="pt-1.5 border-t border-ink/10">
                  <Row
                    label="Overall"
                    value={`${summary.overall_score} / ${summary.overall_max}`}
                    bold
                  />
                </div>
              </div>
            )}

            <label className="text-sm font-medium mb-2 block">Decision</label>
            <div className="space-y-2 mb-6">
              {[
                { value: "hired", label: "Hire", hint: "Sends an offer email naming the role." },
                { value: "rejected", label: "Do not proceed", hint: "Sends a polite rejection email." },
              ].map((o) => (
                <label
                  key={o.value}
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                    decision === o.value ? "border-gold bg-gold/5" : "border-ink/10 hover:border-ink/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="decision"
                    value={o.value}
                    checked={decision === o.value}
                    onChange={() => setDecision(o.value)}
                    className="mt-0.5 accent-gold"
                  />
                  <span>
                    <span className="font-semibold text-sm block">{o.label}</span>
                    <span className="text-xs text-ink/50">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={onClose} className="btn-outline flex-1 !py-2.5">
                Cancel
              </button>
              <button onClick={() => setStep(2)} className="btn-primary flex-1 !py-2.5">
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ---------------- Step 2: confirm ---------------- */}
        {step === 2 && (
          <div className="p-6">
            <h2 className="font-display text-xl font-bold mb-1">
              {isHire ? "Confirm this hire" : "Confirm this rejection"}
            </h2>
            <p className="text-ink/50 text-sm mb-5">
              This is the last step. The email sends immediately and can't be recalled.
            </p>

            <div
              className={`rounded-xl border p-4 mb-5 ${
                isHire ? "border-green-200 bg-green-50" : "border-ink/10 bg-ink/[0.03]"
              }`}
            >
              <p className="text-sm">
                <span className="text-ink/50">An email goes to</span>
                <br />
                <span className="font-semibold">{application.email}</span>
              </p>
              <p className="text-sm mt-3">
                <span className="text-ink/50">Naming the role</span>
                <br />
                <span className="font-semibold">{application.jobs?.title || "the role"}</span>
              </p>
              <p className="text-sm mt-3">
                <span className="text-ink/50">Status becomes</span>{" "}
                <span className="font-semibold">{decision}</span>
              </p>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                disabled={sending}
                className="btn-outline flex-1 !py-2.5"
              >
                Back
              </button>
              <button
                onClick={send}
                disabled={sending}
                className="btn-primary flex-1 !py-2.5"
              >
                {sending ? "Sending…" : isHire ? "Confirm and send offer" : "Confirm and send"}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- Step 3: done ---------------- */}
        {step === 3 && (
          <div className="p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-2xl">
              ✓
            </div>
            <h2 className="font-display text-xl font-bold mb-2">
              {isHire ? "Offer sent" : "Candidate notified"}
            </h2>
            <p className="text-ink/60 text-sm mb-6">
              {application.full_name} has been emailed at {result?.emailedTo} about the{" "}
              {result?.role} position.
            </p>
            <button onClick={onClose} className="btn-primary w-full !py-2.5">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink/50">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
