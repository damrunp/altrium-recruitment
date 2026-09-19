import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { WEEKDAYS, formatDateTime } from "../lib/interviews";
import GradientBackdrop from "../components/GradientBackdrop";

// Shared glass treatment, matching the job listings and dashboards.
const GLASS = "rounded-2xl border border-white/70 bg-white/55 backdrop-blur-xl";

// Sensible defaults so people aren't typing times from scratch.
const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

export default function Availability() {
  const { user, profile } = useAuth();
  const [hours, setHours] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [newBlock, setNewBlock] = useState({ starts_at: "", ends_at: "", reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const [h, b] = await Promise.all([
      supabase
        .from("interviewer_working_hours")
        .select("*")
        .eq("interviewer_id", user.id)
        .order("weekday"),
      supabase
        .from("interviewer_busy_blocks")
        .select("*")
        .eq("interviewer_id", user.id)
        .gte("ends_at", new Date().toISOString())
        .order("starts_at"),
    ]);
    setHours(h.data || []);
    setBlocks(b.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // --- Working hours ---------------------------------------------------
  const hoursFor = (weekday) => hours.find((h) => h.weekday === weekday);

  const toggleDay = async (weekday) => {
    setError("");
    const existing = hoursFor(weekday);
    setSaving(true);

    if (existing) {
      await supabase.from("interviewer_working_hours").delete().eq("id", existing.id);
    } else {
      const { error: insertError } = await supabase.from("interviewer_working_hours").insert({
        interviewer_id: user.id,
        weekday,
        start_time: DEFAULT_START,
        end_time: DEFAULT_END,
      });
      if (insertError) setError(insertError.message);
    }

    await load();
    setSaving(false);
  };

  const updateTime = async (weekday, field, value) => {
    const existing = hoursFor(weekday);
    if (!existing) return;

    // Optimistic, so the input doesn't jump around while typing.
    setHours((prev) => prev.map((h) => (h.id === existing.id ? { ...h, [field]: value } : h)));

    const { error: updateError } = await supabase
      .from("interviewer_working_hours")
      .update({ [field]: value })
      .eq("id", existing.id);

    if (updateError) {
      setError(updateError.message);
      load();
    }
  };

  // --- Busy blocks ------------------------------------------------------
  const addBlock = async (e) => {
    e.preventDefault();
    setError("");

    if (!newBlock.starts_at || !newBlock.ends_at) {
      setError("Pick a start and end time.");
      return;
    }
    if (new Date(newBlock.ends_at) <= new Date(newBlock.starts_at)) {
      setError("The end time has to be after the start time.");
      return;
    }

    setSaving(true);
    const { error: insertError } = await supabase.from("interviewer_busy_blocks").insert({
      interviewer_id: user.id,
      starts_at: new Date(newBlock.starts_at).toISOString(),
      ends_at: new Date(newBlock.ends_at).toISOString(),
      reason: newBlock.reason || null,
      created_by: user.id,
    });

    if (insertError) setError(insertError.message);
    else setNewBlock({ starts_at: "", ends_at: "", reason: "" });

    await load();
    setSaving(false);
  };

  const removeBlock = async (id) => {
    await supabase.from("interviewer_busy_blocks").delete().eq("id", id);
    load();
  };

  return (
    <div className="relative overflow-hidden min-h-[80vh]">
      <GradientBackdrop />

      <div className="relative z-10 max-w-3xl mx-auto px-5 py-12">
        <h1 className="font-display text-2xl font-bold mb-1">My Availability</h1>
        <p className="text-ink/50 mb-8">
          HR books interviews inside these hours. Anything you block out here won't be offered
          as a slot.
        </p>

        {error && (
          <div className="mb-5 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        {loading && <p className="text-ink/50">Loading…</p>}

        {!loading && (
          <>
            {/* Weekly pattern */}
            <section className={`${GLASS} p-6 mb-6`}>
              <h2 className="font-display font-semibold text-lg mb-1">Weekly working hours</h2>
              <p className="text-ink/50 text-sm mb-5">
                Tick the days you're available for interviews, then set the window.
              </p>

              <div className="space-y-2">
                {WEEKDAYS.map((label, weekday) => {
                  const entry = hoursFor(weekday);
                  const active = Boolean(entry);

                  return (
                    <div
                      key={label}
                      className={`flex items-center gap-3 flex-wrap rounded-xl border px-4 py-3 backdrop-blur-sm transition-colors ${
                        active
                          ? "border-gold/50 bg-gold/10"
                          : "border-white/60 bg-white/40"
                      }`}
                    >
                      <label className="flex items-center gap-2.5 min-w-[140px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={active}
                          disabled={saving}
                          onChange={() => toggleDay(weekday)}
                          className="w-4 h-4 accent-gold"
                        />
                        <span className={`text-sm ${active ? "font-medium" : "text-ink/50"}`}>
                          {label}
                        </span>
                      </label>

                      {active ? (
                        <div className="flex items-center gap-2 text-sm">
                          <input
                            type="time"
                            value={entry.start_time?.slice(0, 5) || ""}
                            onChange={(e) => updateTime(weekday, "start_time", e.target.value)}
                            className="input-field bg-white/70 !py-1.5 !px-2 w-auto text-sm"
                          />
                          <span className="text-ink/40">to</span>
                          <input
                            type="time"
                            value={entry.end_time?.slice(0, 5) || ""}
                            onChange={(e) => updateTime(weekday, "end_time", e.target.value)}
                            className="input-field bg-white/70 !py-1.5 !px-2 w-auto text-sm"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-ink/30">Not available</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* One-off blocks */}
            <section className={`${GLASS} p-6`}>
              <h2 className="font-display font-semibold text-lg mb-1">Blocked time</h2>
              <p className="text-ink/50 text-sm mb-5">
                Meetings, leave, anything that makes you unavailable on a specific date.
              </p>

              <form onSubmit={addBlock} className="grid sm:grid-cols-2 gap-3 mb-6">
                <div>
                  <label className="text-sm font-medium mb-1 block">From</label>
                  <input
                    type="datetime-local"
                    value={newBlock.starts_at}
                    onChange={(e) => setNewBlock({ ...newBlock, starts_at: e.target.value })}
                    className="input-field bg-white/70"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">To</label>
                  <input
                    type="datetime-local"
                    value={newBlock.ends_at}
                    onChange={(e) => setNewBlock({ ...newBlock, ends_at: e.target.value })}
                    className="input-field bg-white/70"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium mb-1 block">Reason (optional)</label>
                  <input
                    placeholder="e.g. Client workshop"
                    value={newBlock.reason}
                    onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })}
                    className="input-field bg-white/70"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button disabled={saving} className="btn-primary !py-2 text-sm">
                    {saving ? "Saving…" : "Block this time"}
                  </button>
                </div>
              </form>

              {blocks.length === 0 ? (
                <p className="text-ink/40 text-sm">
                  Nothing blocked. Your working hours are fully open.
                </p>
              ) : (
                <div className="space-y-2">
                  {blocks.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-white/60 bg-white/40 backdrop-blur-sm px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {formatDateTime(b.starts_at)} — {formatDateTime(b.ends_at)}
                        </p>
                        {b.reason && <p className="text-xs text-ink/50 mt-0.5">{b.reason}</p>}
                      </div>
                      <button
                        onClick={() => removeBlock(b.id)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <p className="text-ink/40 text-xs mt-6">
              Signed in as {profile?.first_name} {profile?.last_name}. HR can also adjust these
              on your behalf.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
