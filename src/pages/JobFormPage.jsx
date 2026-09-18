import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function JobFormPage() {
  const { jobId } = useParams();
  const isEdit = Boolean(jobId);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState({
    title: "",
    location: "",
    description: "",
    requirements: "",
    responsibilities: "",
  });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const { data } = await supabase.from("jobs").select("*").eq("job_id", jobId).single();
      if (data) setForm(data);
      setLoading(false);
    })();
  }, [jobId, isEdit]);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      title: form.title,
      location: form.location,
      description: form.description,
      requirements: form.requirements,
      responsibilities: form.responsibilities,
    };

    let res;
    if (isEdit) {
      res = await supabase.from("jobs").update(payload).eq("job_id", jobId);
    } else {
      res = await supabase.from("jobs").insert({ ...payload, status: "open", created_by: user.id });
    }

    setSaving(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    navigate("/dashboard");
  };

  if (loading) return <p className="max-w-2xl mx-auto px-5 py-16 text-ink/50">Loading…</p>;

  return (
    <div className="max-w-2xl mx-auto px-5 py-12">
      <Link to="/dashboard" className="text-sm text-ink/50 hover:text-gold-700">← Back to dashboard</Link>

      <h1 className="font-display text-2xl font-bold mt-3 mb-8">
        {isEdit ? "Edit Job Posting" : "Post a New Job"}
      </h1>

      {error && <div className="mb-5 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Job title</label>
          <input required className="input-field" value={form.title} onChange={update("title")} />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Location</label>
          <input className="input-field" placeholder="e.g. Lahore, Pakistan / Remote" value={form.location || ""} onChange={update("location")} />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Description</label>
          <textarea required rows={4} className="input-field" value={form.description} onChange={update("description")} />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Requirements</label>
          <textarea rows={4} className="input-field" value={form.requirements || ""} onChange={update("requirements")} />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Responsibilities</label>
          <textarea rows={4} className="input-field" value={form.responsibilities || ""} onChange={update("responsibilities")} />
        </div>

        <button disabled={saving} className="btn-primary w-full !py-3 mt-2">
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Post Job"}
        </button>
      </form>
    </div>
  );
}
