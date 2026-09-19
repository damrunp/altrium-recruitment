import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (!error) setJobs(data || []);
      setLoading(false);
    })();
  }, []);

  const filtered = jobs.filter((j) =>
    j.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <section className="relative overflow-hidden bg-ink text-white">
        {/* Decorative blurred gradient orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-20 w-[420px] h-[420px] rounded-full bg-gradient-to-br from-gold via-gold-600 to-transparent opacity-30 blur-[100px]" />
          <div className="absolute top-10 right-[-120px] w-[380px] h-[380px] rounded-full bg-gradient-to-tr from-white/20 via-gold/40 to-transparent opacity-20 blur-[110px]" />
          <div className="absolute bottom-[-160px] left-1/3 w-[500px] h-[500px] rounded-full bg-gradient-to-t from-gold-700 to-transparent opacity-20 blur-[120px]" />
        </div>

        <div className="relative max-w-6xl mx-auto px-5 py-16 sm:py-24">
          <p className="animate-fade-in-up delay-1 text-gold font-semibold tracking-wide uppercase text-sm mb-3">
            Careers at Altrium
          </p>
          <h1 className="animate-fade-in-up delay-2 font-display text-4xl sm:text-5xl font-bold max-w-2xl leading-tight">
            Build what's next. Join our team.
          </h1>
          <p className="animate-fade-in-up delay-3 mt-4 text-white/60 max-w-xl">
            Explore open roles and apply in minutes. Track your application
            status anytime, right here.
          </p>
        </div>
      </section>

      <section className="relative max-w-6xl mx-auto px-5 py-10">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h2 className="font-display text-2xl font-bold">Open Positions</h2>
          <input
            className="input-field max-w-xs bg-white/70 backdrop-blur-sm"
            placeholder="Search job title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading && <p className="text-ink/50">Loading jobs…</p>}

        {!loading && filtered.length === 0 && (
          <div className="card p-10 text-center text-ink/50 bg-white/70 backdrop-blur-sm">
            No open positions right now. Please check back soon.
          </div>
        )}

        <div className="flex flex-col gap-4">
          {filtered.map((job) => (
            <Link
              key={job.job_id}
              to={`/jobs/${job.job_id}`}
              /* A thin gold ring on hover, no glow. The ring is drawn
                 with the border itself so nothing shifts on hover. */
              className="group flex items-center justify-between gap-6 rounded-2xl border border-ink/10 bg-white/70 backdrop-blur-md px-7 py-6 hover:border-gold hover:bg-white/90 transition-colors duration-200"
            >
              <div className="min-w-0">
                <h3 className="font-display font-semibold text-lg mb-1.5 truncate">
                  {job.title}
                </h3>
                <p className="text-ink/60 text-sm line-clamp-2">
                  {job.description}
                </p>
              </div>
              <span className="shrink-0 text-gold-700 font-semibold text-sm group-hover:translate-x-1 transition-transform">
                View &amp; Apply →
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
