import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { SURFACE } from "../components/GradientBackdrop";

// ---------------------------------------------------------------------
// EDIT ME — hero copy.
// ---------------------------------------------------------------------
const HERO = {
  eyebrow: "Careers at Altrium • Build the Future",
  heading: "Ingenuity Empowered. Where Innovation Meets Purpose.",
  lead: "At Altrium, we are redefining what greatness looks like by shaping the future of work through relentless innovation, collaborative engineering, and bold thinking. We do not just build technology — we empower creators, strategists, and problem-solvers to turn ambitious visions into dynamic action.",
  body: "Every challenge here is a pathway to grow, every idea has a distinct voice, and every team member moves with defined purpose. Whether we are deploying advanced Generative AI architectures, engineering resilient enterprise APIs, or designing fluid digital experiences, you will stand shoulder to shoulder with pioneers who own what they create.",
};

const HIGHLIGHTS = [
  {
    title: "Pioneer Real Tech",
    body: "Work hands-on with next-generation LLMs, high-scale backends, and human-centric UI.",
  },
  {
    title: "Radical Ownership",
    body: "We don't micromanage tasks; we empower teams to solve high-stakes challenges end to end.",
  },
  {
    title: "Accelerated Trajectory",
    body: "Transparent progression, direct mentorship, and a culture that measures success by your growth.",
  },
];

const TRUST_SIGNALS = [
  "5-minute application process",
  "Real-time status tracking",
  "Constructive feedback for every candidate",
];

// How far down the dark region reaches before it dissolves into the
// warm surface. Raise it if the hero grows taller.
const DARK_HEIGHT = 1180;

// Sticky navbar height (h-16 = 64px) plus a little breathing room.
const NAV_OFFSET = 88;
// ---------------------------------------------------------------------

/** A single large hexagon outline, used as edge decoration. */
function Hex({ className = "", size = 320, strokeWidth = 1.2 }) {
  return (
    <svg
      className={`absolute pointer-events-none ${className}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M50 2 L92 26 L92 74 L50 98 L8 74 L8 26 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Home() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const location = useLocation();
  const listingsRef = useRef(null);

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

  // React Router doesn't act on hash fragments by itself. Waiting for
  // `loading` matters: scrolling before the cards render lands short,
  // because the page hasn't reached full height yet.
  useEffect(() => {
    if (location.hash !== "#open-positions" || loading) return;

    // window.scrollTo rather than scrollIntoView. scrollIntoView walks
    // up the tree and scrolls the nearest scrollable ancestor, which
    // can be a decorative wrapper rather than the page itself.
    //
    // Two frames, because arriving from another page the first often
    // fires before fonts and layout settle, so the measurement is taken
    // while the page is still short.
    let second;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const el = listingsRef.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
        window.scrollTo({ top, behavior: "smooth" });
      });
    });

    return () => {
      cancelAnimationFrame(first);
      if (second) cancelAnimationFrame(second);
    };
  }, [location.hash, location.key, loading]);

  const filtered = jobs.filter((j) =>
    j.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    /* One background for the whole page rather than two sections that
       meet. The warm surface runs top to bottom and a dark layer sits
       over its upper portion, dissolving into it — so there is no seam
       to hide, because there is no join. */
    <div className="relative">
      {/* Every decorative layer lives inside this one clipping box.
          The page root deliberately has no overflow-hidden: that would
          make it a scroll container, and scrolling to an anchor inside
          it would move the container's contents rather than the window
          — leaving the page stuck somewhere you can't scroll back
          from. */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Warm base, full height. */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, ${SURFACE} 0%, #f4eede 30%, #eae5da 68%, #e4dfd4 100%)`,
        }}
        aria-hidden="true"
      />

      {/* Light and shade in the lower half, so the jobs area isn't flat. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute top-[45%] left-[-140px] w-[600px] h-[600px] rounded-full bg-gold/25 blur-[140px]" />
        <div className="absolute bottom-[-200px] right-[-160px] w-[620px] h-[620px] rounded-full bg-ink/15 blur-[150px]" />
        <div className="absolute bottom-[8%] left-[20%] w-[420px] h-[420px] rounded-full bg-gold/20 blur-[130px]" />
      </div>

      {/* The dark region. Black at the top, warming through amber, then
          fading to nothing so it melts into the base beneath it. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: DARK_HEIGHT,
          background: `linear-gradient(to bottom,
            #000000 0%,
            #050505 22%,
            #100c04 40%,
            rgba(38,27,8,0.92) 55%,
            rgba(86,62,20,0.70) 68%,
            rgba(150,112,45,0.40) 79%,
            rgba(200,165,95,0.18) 88%,
            rgba(220,195,150,0.06) 95%,
            rgba(255,255,255,0) 100%)`,
        }}
        aria-hidden="true"
      />

      {/* Gold light inside the dark region. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
        style={{ height: DARK_HEIGHT }}
        aria-hidden="true"
      >
        <div className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-gradient-to-br from-gold via-gold-600 to-transparent opacity-30 blur-[120px]" />
        <div className="absolute top-16 right-[-160px] w-[460px] h-[460px] rounded-full bg-gradient-to-tr from-white/20 via-gold/40 to-transparent opacity-25 blur-[130px]" />
        <div className="absolute bottom-[8%] left-1/3 w-[700px] h-[380px] rounded-full bg-gold/25 blur-[150px]" />
      </div>

      {/* Hexagons — background decoration only, hugging the left and
          right edges so they never sit behind the text. Hidden on
          narrow screens, where there are no margins to spare. */}
      <div className="pointer-events-none absolute inset-0 hidden lg:block overflow-hidden" aria-hidden="true">
        {/* Upper, over the dark region — light strokes. */}
        <Hex className="-left-40 top-[4%] text-white/[0.07]" size={420} />
        <Hex className="-left-24 top-[26%] text-gold/[0.10]" size={300} />
        <Hex className="-right-48 top-[10%] text-white/[0.06]" size={480} />
        <Hex className="-right-20 top-[34%] text-gold/[0.09]" size={320} />

        {/* Lower, over the warm surface — dark strokes. */}
        <Hex className="-left-32 top-[62%] text-ink/[0.07]" size={380} />
        <Hex className="-right-36 top-[72%] text-ink/[0.06]" size={430} />
        <Hex className="-left-20 top-[88%] text-gold-700/[0.10]" size={280} />
        </div>
      </div>

      {/* ---------------- Content ---------------- */}
      <div className="relative z-10">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-5 pt-20 pb-36 sm:pt-28 sm:pb-44 text-white">
          <p className="animate-fade-in-up delay-1 text-gold font-semibold tracking-[0.15em] uppercase text-xs sm:text-sm mb-5">
            {HERO.eyebrow}
          </p>

          <h1 className="animate-fade-in-up delay-2 font-display text-4xl sm:text-6xl font-bold max-w-4xl leading-[1.05]">
            {HERO.heading}
          </h1>

          <p className="animate-fade-in-up delay-3 mt-7 text-white/70 max-w-3xl text-lg leading-relaxed">
            {HERO.lead}
          </p>

          <p className="animate-fade-in-up delay-3 mt-5 text-white/55 max-w-3xl leading-relaxed">
            {HERO.body}
          </p>

          {/* Feature highlights */}
          <div className="animate-fade-in-up delay-3 mt-12 grid gap-8 sm:grid-cols-3 max-w-5xl">
            {HIGHLIGHTS.map((item) => (
              <div key={item.title}>
                <div className="h-0.5 w-9 bg-gold rounded-full mb-4" />
                <h3 className="font-display font-semibold mb-2">{item.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>

          {/* Trust signals */}
          <ul className="animate-fade-in-up delay-3 mt-12 flex flex-wrap gap-x-8 gap-y-3">
            {TRUST_SIGNALS.map((signal) => (
              <li key={signal} className="flex items-center gap-2.5 text-white/45 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
                {signal}
              </li>
            ))}
          </ul>
        </section>

        {/* Open positions — no background of its own, it sits on the same
            surface the hero is painted over. */}
        <section
          id="open-positions"
          ref={listingsRef}
          /* scroll-mt clears the sticky navbar and leaves a little
             breathing room above the heading, so arriving here from
             another page doesn't land flush against the bar. */
          className="max-w-6xl mx-auto px-5 pt-4 pb-20 scroll-mt-24"
        >
          <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold">Open Positions</h2>
              <p className="text-ink/55 text-sm mt-1.5">
                {loading
                  ? "Loading roles…"
                  : `${jobs.length} role${jobs.length === 1 ? "" : "s"} open right now`}
              </p>
            </div>

            <input
              className="input-field max-w-xs bg-white/60 backdrop-blur-md border-white/70"
              placeholder="Search job title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {!loading && filtered.length === 0 && (
            <div className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-10 text-center text-ink/55">
              {jobs.length === 0
                ? "No open positions right now. Please check back soon."
                : `Nothing matching “${search}”. Try a different search.`}
            </div>
          )}

          <div className="flex flex-col gap-3.5">
            {filtered.map((job) => (
              <Link
                key={job.job_id}
                to={`/jobs/${job.job_id}`}
                className="group flex items-center justify-between gap-6 rounded-2xl border border-white/70 bg-white/55 backdrop-blur-xl px-6 py-5 sm:px-7 sm:py-6 hover:border-gold hover:bg-white/80 transition-colors duration-200"
              >
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-lg mb-1.5 truncate">
                    {job.title}
                  </h3>
                  {job.location && <p className="text-ink/45 text-xs mb-1.5">{job.location}</p>}
                  <p className="text-ink/60 text-sm line-clamp-2">{job.description}</p>
                </div>
                <span className="shrink-0 text-gold-700 font-semibold text-sm group-hover:translate-x-1 transition-transform">
                  View &amp; Apply →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
