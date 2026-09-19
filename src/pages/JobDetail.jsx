import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import GradientBackdrop from "../components/GradientBackdrop";

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

  // Same gradient wash as the listings, so opening a job feels like
  // staying in the same place rather than landing somewhere new.
  const Shell = ({ children }) => (
    <div className="relative overflow-hidden min-h-[70vh]">
      <GradientBackdrop />
      <div className="relative z-10 max-w-3xl mx-auto px-5 py-12">{children}</div>
    </div>
  );

  if (loading) {
    return (
      <Shell>
        <p className="text-ink/50">Loading…</p>
      </Shell>
    );
  }

  if (!job) {
    return (
      <Shell>
        <p className="text-ink/60 mb-3">Job not found.</p>
        <Link to="/#open-positions" className="text-gold-700 font-semibold">
          ← Back to jobs
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <Link to="/#open-positions" className="text-sm text-ink/50 hover:text-gold-700">
        ← Back to all jobs
      </Link>

      <div className="rounded-2xl border border-white/70 bg-white/60 backdrop-blur-xl p-8 mt-4 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.4)]">
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
    </Shell>
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
