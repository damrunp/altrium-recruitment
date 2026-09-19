import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import {
  fetchStages,
  fetchInterviewersForRole,
  fetchAvailabilityData,
  computeFreeSlots,
  formatDateTime,
  formatTime,
} from "../lib/interviews";
import GradientBackdrop from "../components/GradientBackdrop";

const DURATIONS = [30, 45, 60, 90];

export default function ScheduleInterview() {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [application, setApplication] = useState(null);
  const [stages, setStages] = useState([]);
  const [existing, setExisting] = useState([]);
  const [interviewers, setInterviewers] = useState([]);

  const [stageId, setStageId] = useState("");
  const [interviewerId, setInterviewerId] = useState("");
  const [duration, setDuration] = useState(60);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [meetingLink, setMeetingLink] = useState("");
  const [location, setLocation] = useState("Google Meet");

  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const stage = stages.find((s) => s.stage_id === stageId);

  // --- Load the application, stages and any interviews already booked ---
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [appRes, stageList, interviewRes] = await Promise.all([
          supabase
            .from("applications")
            .select("*, jobs(job_id, title)")
            .eq("application_id", applicationId)
            .single(),
          fetchStages(),
          supabase
            .from("interviews")
            .select("*, interview_stages(code, name), profiles!interviews_interviewer_id_fkey(first_name, last_name)")
            .eq("application_id", applicationId),
        ]);

        setApplication(appRes.data);
        setStages(stageList);
        setExisting(interviewRes.data || []);

        // Default to the first stage that hasn't been booked yet.
        const booked = new Set((interviewRes.data || []).map((i) => i.stage_id));
        const next = stageList.find((s) => !booked.has(s.stage_id));
        if (next) setStageId(next.stage_id);
      } catch (err) {
        setError(err.message || "Could not load this application.");
      }
      setLoading(false);
    })();
  }, [applicationId]);

  // --- When the stage changes, load the people who can run it ----------
  useEffect(() => {
    if (!stage) return;
    setInterviewerId("");
    setSelectedSlot(null);
    setAvailability(null);

    fetchInterviewersForRole(stage.conducted_by)
      .then(setInterviewers)
      .catch((err) => setError(err.message));
  }, [stage]);

  // --- When an interviewer is picked, load their calendar --------------
  const loadAvailability = useCallback(async () => {
    if (!interviewerId) return;
    setSlotsLoading(true);
    setSelectedSlot(null);
    try {
      const data = await fetchAvailabilityData(interviewerId, new Date(), 14);
      setAvailability(data);
    } catch (err) {
      setError(err.message);
    }
    setSlotsLoading(false);
  }, [interviewerId]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const freeDays = useMemo(() => {
    if (!availability) return [];
    return computeFreeSlots({
      ...availability,
      fromDate: new Date(),
      days: 14,
      durationMinutes: duration,
    });
  }, [availability, duration]);

  // --- Save -------------------------------------------------------------
  const handleSave = async (e) => {
    e.preventDefault();
    setError("");

    if (!stageId || !interviewerId || !selectedSlot) {
      setError("Pick a stage, an interviewer and a time slot.");
      return;
    }
    if (!meetingLink.trim()) {
      setError("Paste the meeting link — the candidate needs it to join.");
      return;
    }

    setSaving(true);

    const payload = {
      application_id: applicationId,
      stage_id: stageId,
      interviewer_id: interviewerId,
      scheduled_at: selectedSlot.start.toISOString(),
      duration_minutes: duration,
      location: location || null,
      meeting_link: meetingLink.trim(),
      status: "scheduled",
      scheduled_by: user.id,
    };

    // One interview per stage per application, so rescheduling updates
    // the existing row rather than creating a second one.
    const alreadyBooked = existing.find((i) => i.stage_id === stageId);

    const res = alreadyBooked
      ? await supabase
          .from("interviews")
          .update(payload)
          .eq("interview_id", alreadyBooked.interview_id)
      : await supabase.from("interviews").insert(payload);

    setSaving(false);

    if (res.error) {
      setError(res.error.message);
      return;
    }

    // Now that the date, time, interviewer and link exist, tell the
    // candidate. Sending on the status change alone would email them
    // before any of those details were known.
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      await fetch("/api/send-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ applicationId, status: "interview" }),
      });
    } catch (err) {
      console.warn("interview notification failed", err);
    }

    navigate(`/dashboard/jobs/${application.job_id}/applicants`);
  };

  if (loading) {
    return <p className="max-w-3xl mx-auto px-5 py-16 text-ink/50">Loading…</p>;
  }

  if (!application) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-16">
        <p className="text-ink/60 mb-3">Application not found.</p>
        <Link to="/dashboard" className="text-gold-700 font-semibold">← Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden min-h-[80vh]">
      <GradientBackdrop />
      <div className="relative z-10 max-w-3xl mx-auto px-5 py-12">
      <Link
        to={`/dashboard/jobs/${application.job_id}/applicants`}
        className="text-sm text-ink/50 hover:text-gold-700"
      >
        ← Back to applicants
      </Link>

      <h1 className="font-display text-2xl font-bold mt-3 mb-1">Schedule Interview</h1>
      <p className="text-ink/50 mb-8">
        {application.full_name} — {application.jobs?.title}
      </p>

      {error && (
        <div className="mb-5 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {/* Already booked */}
      {existing.length > 0 && (
        <div className="rounded-2xl border border-white/70 bg-white/55 backdrop-blur-xl p-5 mb-6">
          <h2 className="font-display font-semibold mb-3">Interviews so far</h2>
          <div className="space-y-2">
            {existing.map((i) => (
              <div key={i.interview_id} className="flex items-center justify-between gap-3 flex-wrap text-sm">
                <div>
                  <span className="font-medium">{i.interview_stages?.name}</span>
                  <span className="text-ink/50">
                    {" "}— {formatDateTime(i.scheduled_at)} with {i.profiles?.first_name}{" "}
                    {i.profiles?.last_name}
                  </span>
                </div>
                <span
                  className={`badge ${
                    i.status === "completed"
                      ? i.result === "pass"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {i.status === "completed" ? i.result || "completed" : i.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Stage */}
        <div className="rounded-2xl border border-white/70 bg-white/55 backdrop-blur-xl p-5">
          <label className="text-sm font-medium mb-2 block">Interview stage</label>
          <div className="grid sm:grid-cols-2 gap-3">
            {stages.map((s) => {
              const booked = existing.find((i) => i.stage_id === s.stage_id);
              const isSelected = stageId === s.stage_id;
              return (
                <button
                  key={s.stage_id}
                  type="button"
                  onClick={() => setStageId(s.stage_id)}
                  className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                    isSelected ? "border-gold bg-gold/5" : "border-ink/10 hover:border-gold/50"
                  }`}
                >
                  <p className="font-semibold text-sm">{s.name}</p>
                  <p className="text-xs text-ink/50 mt-0.5">{s.description}</p>
                  {booked && (
                    <p className="text-xs text-gold-700 mt-1.5 font-medium">
                      Already scheduled — picking this will reschedule it
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Interviewer */}
        {stage && (
          <div className="rounded-2xl border border-white/70 bg-white/55 backdrop-blur-xl p-5">
            <label className="text-sm font-medium mb-1 block">Assign interviewer</label>
            <p className="text-xs text-ink/50 mb-3">
              This stage is run by someone with the {stage.conducted_by} role.
            </p>

            {interviewers.length === 0 ? (
              <p className="text-sm text-red-600">
                No accounts with the {stage.conducted_by} role exist yet. Create one before
                scheduling this stage.
              </p>
            ) : (
              <select
                value={interviewerId}
                onChange={(e) => setInterviewerId(e.target.value)}
                className="input-field"
              >
                <option value="">Choose someone…</option>
                {interviewers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name} ({p.email})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Duration + slots */}
        {interviewerId && (
          <div className="rounded-2xl border border-white/70 bg-white/55 backdrop-blur-xl p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div>
                <label className="text-sm font-medium block">Pick a free slot</label>
                <p className="text-xs text-ink/50 mt-0.5">
                  Next 14 days, based on their working hours and existing bookings.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-ink/60">Length</span>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="input-field !py-2 text-sm w-auto"
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} min
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {slotsLoading && <p className="text-ink/50 text-sm">Checking their calendar…</p>}

            {!slotsLoading && freeDays.length === 0 && (
              <div className="rounded-lg bg-ink/5 px-4 py-5 text-sm text-ink/60">
                No free slots in the next two weeks. Either they haven't set working hours yet,
                or they're fully booked. You can set their hours for them from the availability
                page.
              </div>
            )}

            <div className="space-y-4 max-h-96 overflow-y-auto">
              {freeDays.map((day) => (
                <div key={day.dayKey}>
                  <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2">
                    {day.dayLabel}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {day.slots.map((slot) => {
                      const isSelected =
                        selectedSlot && selectedSlot.start.getTime() === slot.start.getTime();
                      return (
                        <button
                          key={slot.start.toISOString()}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                            isSelected
                              ? "border-gold bg-gold text-ink font-semibold"
                              : "border-ink/10 hover:border-gold/60"
                          }`}
                        >
                          {formatTime(slot.start)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meeting details */}
        {selectedSlot && (
          <div className="rounded-2xl border border-white/70 bg-white/55 backdrop-blur-xl p-5 space-y-4">
            <div className="rounded-lg bg-gold/10 px-4 py-3 text-sm">
              <span className="font-semibold">{formatDateTime(selectedSlot.start)}</span>
              <span className="text-ink/60"> — {duration} minutes</span>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Meeting link</label>
              <input
                placeholder="https://meet.google.com/abc-defg-hij"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                className="input-field"
              />
              <p className="text-xs text-ink/40 mt-1">
                Create the meeting in Google Calendar, then paste the link here. The candidate
                and the interviewer both see it.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="input-field"
              />
            </div>

            <button disabled={saving} className="btn-primary w-full !py-3">
              {saving ? "Saving…" : "Confirm and schedule"}
            </button>
          </div>
        )}
      </form>
    </div>
    </div>
  );
}
