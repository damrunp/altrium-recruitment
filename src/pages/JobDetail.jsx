import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function JobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { session, isStaff } = useAuth();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alreadyApplied, setAlreadyApplied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("jobs")
        .select("*")
        .eq("job_id", jobId)
        .single();
      setJob(data);
      setLoading(false);

      if (session?.user) {
        const { data: existing } = await supabase
          .from("applications")
          .select("application_id")
          .eq("job_id", jobId)
          .eq("candidate_id", session.user.id)
          .maybeSingle();
        if (existing) setAlreadyApplied(true);
      }
    })();
  }, [jobId, session]);

  const handleApply = () => {
    if (!session) {
      navigate(`/auth?redirect=/apply/${jobId}`);
      return;
    }
    navigate(`/apply/${jobId}`);
  };

  if (loading) return <p className="max-w-3xl mx-auto px-5 py-16 text-ink/50">Loading…</p>;
  if (!job)
    return (
      <div className="max-w-3xl mx-auto px-5 py-16">
        <p className="text-ink/60">Job not found.</p>
        <Link to="/" className="text-gold-700 font-semibold">← Back to jobs</Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto px-5 py-12">
      <Link to="/" className="text-sm text-ink/50 hover:text-gold-700">← Back to all jobs</Link>

      <div className="card p-8 mt-4">
        <h1 className="font-display text-3xl font-bold mb-2">{job.title}</h1>
        {job.location && <p className="text-ink/50 mb-6">{job.location}</p>}

        <Section title="Description" text={job.description} />
        <Section title="Requirements" text={job.requirements} />
        <Section title="Responsibilities" text={job.responsibilities} />

        {isStaff ? (
          <p className="mt-6 text-ink/50 text-sm">
            Staff accounts cannot submit job applications.
          </p>
        ) : alreadyApplied ? (
          <div className="mt-6 flex items-center gap-3">
            <span className="badge bg-green-100 text-green-700">Already Applied</span>
            <Link to="/status" className="text-gold-700 font-semibold text-sm">
              Check your status →
            </Link>
          </div>
        ) : (
          <button onClick={handleApply} className="btn-primary mt-6">
            Apply for this role
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, text }) {
  if (!text) return null;
  return (
    <div className="mb-6">
      <h2 className="font-display font-semibold text-lg mb-1.5">{title}</h2>
      <p className="text-ink/70 whitespace-pre-line leading-relaxed">{text}</p>
    </div>
  );
}
