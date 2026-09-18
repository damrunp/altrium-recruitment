import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

const ROLE_LABELS = {
  hr: "HR",
  management: "Management",
  interviewer: "Interviewer",
};

export default function Dashboard() {
  const { profile, isHR } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});

  const load = async () => {
    setLoading(true);
    const { data: jobsData } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });
    setJobs(jobsData || []);

    const { data: appData } = await supabase.from("applications").select("job_id");
    const c = {};
    (appData || []).forEach((a) => {
      c[a.job_id] = (c[a.job_id] || 0) + 1;
    });
    setCounts(c);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleStatus = async (job) => {
    const newStatus = job.status === "open" ? "closed" : "open";
    await supabase.from("jobs").update({ status: newStatus }).eq("job_id", job.job_id);
    load();
  };

  const deleteJob = async (job) => {
    if (!confirm(`Delete job "${job.title}"? This cannot be undone.`)) return;
    await supabase.from("jobs").delete().eq("job_id", job.job_id);
    load();
  };

  return (
    <div className="max-w-6xl mx-auto px-5 py-12">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold">Recruitment Dashboard</h1>
          <p className="text-ink/50">
            Signed in as{" "}
            <span className="font-semibold">
              {ROLE_LABELS[profile?.role] || profile?.role}
            </span>
            {!isHR && " · view only"}
          </p>
        </div>

        {isHR && (
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/dashboard/evaluations" className="btn-outline !px-4 !py-2 text-sm">
              Evaluations
            </Link>
            <Link to="/dashboard/jobs/new" className="btn-primary">
              + Post New Job
            </Link>
          </div>
        )}
      </div>

      {loading && <p className="text-ink/50">Loading jobs…</p>}

      <div className="grid gap-4">
        {jobs.map((job) => (
          <div
            key={job.job_id}
            className="card p-5 flex items-center justify-between flex-wrap gap-4"
          >
            <div className="min-w-[200px]">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{job.title}</p>
                <span
                  className={`badge ${
                    job.status === "open"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {job.status}
                </span>
              </div>
              <p className="text-sm text-ink/50">
                {counts[job.job_id] || 0} applicant
                {(counts[job.job_id] || 0) === 1 ? "" : "s"}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/dashboard/jobs/${job.job_id}/applicants`}
                className="btn-outline !px-4 !py-2 text-sm"
              >
                View Applicants
              </Link>

              {/* Job editing is HR only. Management and interviewers can
                  look at applicants but not change anything. */}
              {isHR && (
                <>
                  <Link
                    to={`/dashboard/jobs/${job.job_id}/edit`}
                    className="btn-outline !px-4 !py-2 text-sm"
                  >
                    Edit
                  </Link>
                  <button onClick={() => toggleStatus(job)} className="btn-outline !px-4 !py-2 text-sm">
                    {job.status === "open" ? "Close" : "Reopen"}
                  </button>
                  <button
                    onClick={() => deleteJob(job)}
                    className="text-red-600 hover:text-red-700 text-sm font-medium px-3"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {!loading && jobs.length === 0 && (
        <div className="card p-10 text-center text-ink/50">No jobs posted yet.</div>
      )}
    </div>
  );
}
