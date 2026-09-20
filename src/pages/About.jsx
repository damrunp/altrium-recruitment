import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SURFACE } from "../components/GradientBackdrop";

// ---------------------------------------------------------------------
// EDIT ME — all copy lives here.
// ---------------------------------------------------------------------
const HERO = {
  eyebrow: "About Altrium",
  heading: "Welcome to Altrium",
  lead: "Founded in 2022 by a team of software engineering veterans, Altrium stands at the intersection of technology and business needs.",
};

const STORY = [
  "Our journey began with a mission to fill a significant gap in the tech industry — aligning technology initiatives with the true business needs of startups, scale-ups and enterprises across the globe.",
  "From our roots in Silicon Valley to multinational corporations, we've harnessed decades of experience to create a consultancy that builds lean software for our clients, minimizing waste and rework by ensuring business-technology alignment from the get-go.",
];

const STATS = [
  { value: "2022", label: "Founded" },
  { value: "2", label: "Global offices" },
  { value: "3", label: "Core practices" },
];

const SIDE_FACTS = [
  { term: "Headquarters", detail: "Sri Jayawardenepura Kotte, Sri Lanka" },
  { term: "Second office", detail: "New York, United States" },
  { term: "Origins", detail: "Silicon Valley and multinational enterprise" },
  { term: "Focus", detail: "UI/UX · AI & ML · Enterprise APIs" },
];

const PILLARS = [
  {
    tag: "Our People",
    title: "The Heart of Altrium",
    body: "Our strength lies in our team — innovative, open and bold individuals who bring exceptional talent and commitment to the table every day. Our leadership, composed of industry veterans with experience across startups and multinational corporations, sets the tone for a culture of respect, growth and innovation.",
  },
  {
    tag: "Our Mission",
    title: "Technologists without borders",
    body: "To harness the ingenuity of technologists from around the globe, channeling their expertise to develop exceptional software that shapes the future and delivers transformative results for our clients.",
  },
  {
    tag: "Our Values",
    title: "No barriers to potential",
    body: "Altrium aspires to be a world-class, people-centric technology firm dedicated to bridging remarkable talent with exceptional opportunities globally, ensuring no barriers can hinder potential, wherever it may be.",
  },
  {
    tag: "Our Culture",
    title: "A Community of Creators",
    body: "Envisioned as a flat and open ecosystem, we've cultivated an environment where ideas flourish over hierarchy. We challenge each other to grow and support one another on this journey. Flexibility, trust, and a disdain for micromanagement and corporate red tape define our workspace.",
  },
];

const PRACTICES = [
  {
    title: "UI / UX",
    body: "Interfaces designed around how people actually work, tested with real users long before they ship.",
  },
  {
    title: "AI & Machine Learning",
    body: "Models that make decisions in production, not just in notebooks — recommendation, forecasting and document understanding.",
  },
  {
    title: "Enterprise APIs",
    body: "High-scale product engineering and the platform work that lets small teams ship without breaking things.",
  },
];

const HIRING_STEPS = [
  { title: "Apply", body: "Pick a role, upload your CV as a PDF, and submit. It takes a few minutes." },
  { title: "Screening", body: "We review your application against the role's requirements and get back to you." },
  { title: "Technical interview", body: "A conversation with engineers about how you think and how you build." },
  { title: "Final interview", body: "A discussion with the department manager about how you work with others." },
  { title: "Decision", body: "You'll hear from us either way, with the outcome in writing." },
];

const OFFICES = [
  {
    country: "Sri Lanka",
    flag: "🇱🇰",
    lines: ["Level 3, Onyx Tower,", "Sri Jayawardenepura Mawatha,", "Sri Jayawardenepura Kotte 10100"],
    contact: "+94 11 277 2517",
  },
  {
    country: "United States",
    flag: "🇺🇸",
    lines: ["1250 Broadway,", "36th Floor,", "New York,", "NY 10001"],
    contact: "hello@altrium.io",
  },
];

// How far the dark region reaches from the top, and how far it rises
// from the bottom. Adjust if the hero or closing section changes height.
const DARK_TOP = 880;
const DARK_BOTTOM = 620;

const GLASS = "rounded-2xl border border-white/70 bg-white/55 backdrop-blur-xl";
// ---------------------------------------------------------------------

/**
 * Fades content up as it scrolls into view. IntersectionObserver plus
 * inline transitions, so it doesn't depend on custom keyframes being in
 * the Tailwind config. Motion is skipped for anyone who has asked their
 * system to reduce it.
 */
function Reveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 910ms cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 910ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export default function About() {
  return (
    /* One background for the whole page, same construction as Home: a
       warm surface running top to bottom, with dark regions painted over
       the opening and the closing. No section boundaries to hide. */
    <div className="relative">
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Warm base */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, ${SURFACE} 0%, #f4eede 30%, #eae5da 68%, #e4dfd4 100%)`,
          }}
        />

        {/* Light and shade across the middle */}
        <div className="absolute top-[28%] left-[-160px] w-[620px] h-[620px] rounded-full bg-gold/22 blur-[150px]" />
        <div className="absolute top-[55%] right-[-180px] w-[600px] h-[600px] rounded-full bg-ink/12 blur-[150px]" />
        <div className="absolute top-[70%] left-[15%] w-[440px] h-[440px] rounded-full bg-gold/18 blur-[130px]" />

        {/* Dark region at the top, ending just before the story. */}
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: DARK_TOP,
            background: `linear-gradient(to bottom,
              #000000 0%,
              #050505 24%,
              #100c04 42%,
              rgba(38,27,8,0.92) 56%,
              rgba(86,62,20,0.70) 69%,
              rgba(150,112,45,0.40) 80%,
              rgba(200,165,95,0.18) 89%,
              rgba(220,195,150,0.06) 96%,
              rgba(255,255,255,0) 100%)`,
          }}
        />
        <div className="absolute inset-x-0 top-0 overflow-hidden" style={{ height: DARK_TOP }}>
          <div className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-gradient-to-br from-gold via-gold-600 to-transparent opacity-30 blur-[120px]" />
          <div className="absolute top-16 right-[-160px] w-[460px] h-[460px] rounded-full bg-gradient-to-tr from-white/20 via-gold/40 to-transparent opacity-25 blur-[130px]" />
        </div>

        {/* Dark region at the bottom, rising into the closing section. */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: DARK_BOTTOM,
            background: `linear-gradient(to top,
              #000000 0%,
              #050505 26%,
              #100c04 44%,
              rgba(38,27,8,0.92) 58%,
              rgba(86,62,20,0.70) 70%,
              rgba(150,112,45,0.40) 81%,
              rgba(200,165,95,0.18) 90%,
              rgba(220,195,150,0.06) 96%,
              rgba(255,255,255,0) 100%)`,
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 overflow-hidden"
          style={{ height: DARK_BOTTOM }}
        >
          <div className="absolute bottom-[-140px] left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full bg-gold/25 blur-[140px]" />
        </div>
      </div>

      {/* ---------------- Content ---------------- */}
      <div className="relative z-10">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-5 pt-20 pb-28 sm:pt-28 text-white">
          <Reveal>
            <p className="text-gold font-semibold tracking-wide uppercase text-sm mb-4">
              {HERO.eyebrow}
            </p>
          </Reveal>

          <Reveal delay={130}>
            <h1 className="font-display text-4xl sm:text-6xl font-bold max-w-3xl leading-[1.05]">
              {HERO.heading}
            </h1>
          </Reveal>

          <Reveal delay={260}>
            <p className="mt-6 text-white/70 max-w-2xl text-lg leading-relaxed">{HERO.lead}</p>
          </Reveal>

          <Reveal delay={390}>
            <div className="flex flex-wrap gap-12 mt-12">
              {STATS.map((s) => (
                <div key={s.label}>
                  <p className="font-display text-4xl font-bold text-gold">{s.value}</p>
                  <p className="text-white/40 text-sm mt-1.5">{s.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* Story */}
        <section className="max-w-6xl mx-auto px-5 py-20">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-16 items-start">
            <div>
              <Reveal>
                <div className="h-1 w-12 bg-gold rounded-full mb-6" />
                <h2 className="font-display text-3xl font-bold mb-6 leading-tight">
                  Filling a gap the industry kept ignoring.
                </h2>
              </Reveal>

              {STORY.map((paragraph, i) => (
                <Reveal key={i} delay={i * 156}>
                  <p className="text-ink/70 text-lg leading-relaxed mb-5">{paragraph}</p>
                </Reveal>
              ))}
            </div>

            <Reveal delay={200}>
              <div className="relative">
                <svg
                  className="absolute -top-10 -right-6 w-44 h-44 text-gold/25 pointer-events-none"
                  viewBox="0 0 100 100"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M50 20 L76 35 L76 65 L50 80 L24 65 L24 35 Z" stroke="currentColor" strokeWidth="1.5" />
                </svg>

                <div className={`relative ${GLASS} p-7`}>
                  <p className="font-display text-lg font-semibold leading-snug mb-2">
                    “Lean software, built on business-technology alignment from the get-go.”
                  </p>
                  <p className="text-ink/50 text-sm mb-7">How we've worked since day one.</p>

                  <dl className="space-y-5">
                    {SIDE_FACTS.map((item) => (
                      <div key={item.term} className="flex gap-4">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-gold shrink-0" />
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-ink/40 mb-0.5">
                            {item.term}
                          </dt>
                          <dd className="text-sm font-medium">{item.detail}</dd>
                        </div>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Pillars */}
        <section className="max-w-6xl mx-auto px-5 pb-20 grid gap-5 md:grid-cols-2">
          {PILLARS.map((p, i) => (
            <Reveal key={p.tag} delay={i * 130}>
              <div
                className={`group h-full ${GLASS} p-7 transition-all duration-300 hover:border-gold hover:bg-white/75 hover:-translate-y-1 hover:shadow-lg`}
              >
                <p className="text-gold-700 font-semibold text-xs uppercase tracking-wider mb-3">
                  {p.tag}
                </p>
                <h2 className="font-display text-xl font-bold mb-3">{p.title}</h2>
                <p className="text-ink/60 leading-relaxed">{p.body}</p>
                <div className="h-0.5 w-0 bg-gold rounded-full mt-5 transition-all duration-500 group-hover:w-14" />
              </div>
            </Reveal>
          ))}
        </section>

        {/* Looking to the future */}
        <section className="max-w-6xl mx-auto px-5 pb-20">
          <Reveal>
            <p className="text-gold-700 font-semibold text-xs uppercase tracking-wider mb-3">
              Looking to the Future
            </p>
            <h2 className="font-display text-3xl font-bold mb-3 max-w-2xl">
              A leading software services firm, built on high-scale product engineering.
            </h2>
            <p className="text-ink/60 max-w-2xl mb-10 leading-relaxed">
              Our goal is not just to grow our brand, but to keep empowering the brilliant minds
              on our team and providing unparalleled value to our clients.
            </p>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-3">
            {PRACTICES.map((item, i) => (
              <Reveal key={item.title} delay={i * 156}>
                <div className="group h-full rounded-2xl bg-ink text-white p-7 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl relative overflow-hidden">
                  <div className="pointer-events-none absolute -top-20 -right-16 w-52 h-52 rounded-full bg-gold/30 blur-[70px] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  <div className="relative">
                    <h3 className="font-display font-semibold text-lg mb-2.5 group-hover:text-gold transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-white/55 text-sm leading-relaxed">{item.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Hiring process */}
        <section className="max-w-3xl mx-auto px-5 pb-20">
          <Reveal>
            <h2 className="font-display text-3xl font-bold mb-2">How hiring works</h2>
            <p className="text-ink/50 mb-10">
              No surprises. You can track exactly where your application stands from your account
              at any point.
            </p>
          </Reveal>

          <ol className="relative">
            <div className="absolute left-[18px] top-3 bottom-3 w-px bg-ink/10" aria-hidden="true" />

            {HIRING_STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 117}>
                <li className="relative flex gap-5 pb-8 last:pb-0">
                  <span className="relative z-10 shrink-0 w-9 h-9 rounded-full bg-gold text-ink font-display font-bold text-sm flex items-center justify-center ring-4 ring-white/70">
                    {i + 1}
                  </span>
                  <div className="pt-1">
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="text-ink/60 text-sm mt-1 leading-relaxed">{s.body}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* Offices */}
        <section className="max-w-6xl mx-auto px-5 pb-24">
          <Reveal>
            <h2 className="font-display text-3xl font-bold mb-10">Where we are</h2>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2">
            {OFFICES.map((office, i) => (
              <Reveal key={office.country} delay={i * 156}>
                <div className="group h-full rounded-2xl bg-ink text-white p-7 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl relative overflow-hidden">
                  <div className="pointer-events-none absolute -top-20 -right-16 w-52 h-52 rounded-full bg-gold/30 blur-[70px] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  <div className="relative">
                    <h3 className="font-display font-semibold text-lg mb-3 flex items-center gap-2 group-hover:text-gold transition-colors">
                      {office.country} <span>{office.flag}</span>
                    </h3>
                    <p className="text-white/55 text-sm leading-relaxed">
                      {office.lines.map((line) => (
                        <span key={line}>
                          {line}
                          <br />
                        </span>
                      ))}
                    </p>
                    <p className="mt-4 text-sm font-semibold">{office.contact}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Closing CTA — sits on the lower dark region */}
        <section className="max-w-2xl mx-auto px-5 pt-16 pb-24 text-center text-white">
          <Reveal>
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
              Ready to make a difference?
            </h2>
            <p className="text-white/60 mb-8 leading-relaxed">
              We're always on the lookout for talented individuals who share our vision and
              values. Have a look at what's open and become part of our journey toward creating
              technology that empowers businesses and enriches lives.
            </p>
            <Link to="/#open-positions" className="btn-primary !px-7 !py-3">
              See open roles
            </Link>
          </Reveal>
        </section>
      </div>
    </div>
  );
}
