import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { extractPdfText, computeMatchScore } from "../lib/cvScoring";

// Sri Lankan NIC: old format 9 digits + V/X, or new format 12 digits
const NIC_REGEX = /^(?:\d{9}[VXvx]|\d{12})$/;

export default function ApplicationForm() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [job, setJob] = useState(null);
  const [fullName, setFullName] = useState("");
  const [nic, setNic] = useState("");
  const [email, setEmail] = useState("");
  const [cvFile, setCvFile] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // null | true | false

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("jobs").select("*").eq("job_id", jobId).single();
      setJob(data);
    })();
  }, [jobId]);

  useEffect(() => {
    if (profile) {
      setFullName(`${profile.first_name || ""} ${profile.last_name || ""}`.trim());
      setEmail(profile.email || "");
    }
  }, [profile]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!NIC_REGEX.test(nic)) {
      setError("Enter a valid Sri Lankan NIC, e.g. 200012345678 or 991234567V");
      return;
    }
    if (!cvFile) {
      setError("Please upload your CV in PDF format.");
      return;
    }
    if (cvFile.type !== "application/pdf") {
      setError("CV must be a PDF file.");
      return;
    }

    setSubmitting(true);
    try {
      const filePath = `${user.id}/${jobId}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("cvs")
        .upload(filePath, cvFile, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      // Score this CV against the job's requirements so staff can filter
      // out obviously irrelevant applications. If text extraction fails
      // (e.g. a scanned/image-only PDF), we still submit the application —
      // it just won't have a score, and staff can review it manually.
      let matchScore = null;
      let matchedKeywords = [];
      let missingKeywords = [];
      try {
        const cvText = await extractPdfText(cvFile);
        const result = computeMatchScore(cvText, job || {});
        matchScore = result.score;
        matchedKeywords = result.matchedKeywords;
        missingKeywords = result.missingKeywords;
      } catch {
        // ignore extraction failures — score stays null
      }

      const { error: insertError } = await supabase.from("applications").insert({
        job_id: jobId,
        candidate_id: user.id,
        full_name: fullName,
        nic,
        email,
        cv_path: filePath,
        status: "pending",
        match_score: matchScore,
        matched_keywords: matchedKeywords,
        missing_keywords: missingKeywords,
      });
      if (insertError) throw insertError;

      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitted(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted === true) {
    return (
      <div className="max-w-lg mx-auto px-5 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-5 text-3xl">
          ✓
        </div>
        <h1 className="font-display text-2xl font-bold mb-2">Application Submitted!</h1>
        <p className="text-ink/60 mb-8">
          Thank you for applying{job ? ` for ${job.title}` : ""}. You can track your
          application status anytime from your dashboard.
        </p>
        <div className="flex gap-3 justify-center">
          <Link to="/status" className="btn-primary">Check My Status</Link>
          <Link to="/" className="btn-outline">Browse More Jobs</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-5 py-12">
      <Link to={`/jobs/${jobId}`} className="text-sm text-ink/50 hover:text-gold-700">← Back to job</Link>

      <h1 className="font-display text-2xl font-bold mt-3 mb-1">
        Apply {job ? `for ${job.title}` : ""}
      </h1>
      <p className="text-ink/50 mb-8">Fill in your details below to submit your application.</p>

      {error && (
        <div className="mb-5 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}
      {submitted === false && (
        <div className="mb-5 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
          Your application could not be submitted. Please try again.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Full name</label>
          <input required className="input-field" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">NIC (LK)</label>
          <input
            required
            placeholder="200012345678 or 991234567V"
            className="input-field"
            value={nic}
            onChange={(e) => setNic(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Email</label>
          <input required type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">CV (PDF only)</label>
          <input
            required
            type="file"
            accept="application/pdf"
            className="input-field file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-gold file:text-ink file:font-semibold"
            onChange={(e) => setCvFile(e.target.files?.[0] || null)}
          />
        </div>

        <button disabled={submitting} className="btn-primary w-full !py-3 mt-2">
          {submitting ? "Submitting…" : "Submit Application"}
        </button>
      </form>
    </div>
  );
}
