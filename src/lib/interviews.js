import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------------
// Shared logic for scheduling and evaluation.
// ---------------------------------------------------------------------

export const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export const RECOMMENDATIONS = [
  { value: "strong_yes", label: "Strong yes" },
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
  { value: "strong_no", label: "Strong no" },
];

// Which profile role conducts which stage — mirrors
// interview_stages.conducted_by in the database.
export const ROLE_FOR_STAGE = {
  interviewer: "interviewer",
  management: "management",
  hr: "hr",
};

// ---------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------

export async function fetchStages() {
  const { data, error } = await supabase
    .from("interview_stages")
    .select("*, interview_criteria(*)")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;

  // Sort criteria within each stage — nested selects don't honour order().
  return (data || []).map((s) => ({
    ...s,
    interview_criteria: (s.interview_criteria || [])
      .filter((c) => c.is_active)
      .sort((a, b) => a.sort_order - b.sort_order),
  }));
}

export async function fetchInterviewersForRole(role) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, role, avatar_url")
    .eq("role", role)
    .order("first_name");
  if (error) throw error;
  return data || [];
}

// Everything needed to work out when someone is free.
export async function fetchAvailabilityData(interviewerId, fromDate, days = 14) {
  const from = new Date(fromDate);
  const to = new Date(fromDate);
  to.setDate(to.getDate() + days);

  const [hours, busy, booked] = await Promise.all([
    supabase
      .from("interviewer_working_hours")
      .select("*")
      .eq("interviewer_id", interviewerId),
    supabase
      .from("interviewer_busy_blocks")
      .select("*")
      .eq("interviewer_id", interviewerId)
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString()),
    supabase
      .from("interviews")
      .select("interview_id, scheduled_at, duration_minutes, status")
      .eq("interviewer_id", interviewerId)
      .in("status", ["scheduled"])
      .gte("scheduled_at", from.toISOString())
      .lt("scheduled_at", to.toISOString()),
  ]);

  return {
    workingHours: hours.data || [],
    busyBlocks: busy.data || [],
    bookedInterviews: booked.data || [],
  };
}

// ---------------------------------------------------------------------
// Slot computation
// ---------------------------------------------------------------------

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function timeToMinutes(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
}

/**
 * Builds the list of bookable slots.
 *
 * A slot counts as free when it sits inside a working-hours window,
 * doesn't touch a busy block, doesn't collide with an interview that's
 * already booked, and isn't in the past.
 *
 * Returns [{ dayKey, dayLabel, slots: [{ start, end }] }]
 */
export function computeFreeSlots({
  workingHours,
  busyBlocks,
  bookedInterviews,
  fromDate,
  days = 14,
  durationMinutes = 60,
  stepMinutes = 30,
}) {
  const now = new Date();
  const result = [];

  const busy = (busyBlocks || []).map((b) => ({
    start: new Date(b.starts_at),
    end: new Date(b.ends_at),
  }));

  const booked = (bookedInterviews || []).map((i) => {
    const start = new Date(i.scheduled_at);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + (i.duration_minutes || 60));
    return { start, end };
  });

  for (let d = 0; d < days; d++) {
    const day = new Date(fromDate);
    day.setDate(day.getDate() + d);
    day.setHours(0, 0, 0, 0);

    const windows = (workingHours || []).filter((w) => w.weekday === day.getDay());
    if (windows.length === 0) continue;

    const slots = [];

    for (const w of windows) {
      const windowStart = timeToMinutes(w.start_time);
      const windowEnd = timeToMinutes(w.end_time);

      for (let m = windowStart; m + durationMinutes <= windowEnd; m += stepMinutes) {
        const start = new Date(day);
        start.setMinutes(m);
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + durationMinutes);

        if (start <= now) continue;
        if (busy.some((b) => overlaps(start, end, b.start, b.end))) continue;
        if (booked.some((b) => overlaps(start, end, b.start, b.end))) continue;

        slots.push({ start, end });
      }
    }

    if (slots.length > 0) {
      result.push({
        dayKey: day.toISOString().slice(0, 10),
        dayLabel: day.toLocaleDateString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
        slots: slots.sort((a, b) => a.start - b.start),
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function scorePercent(total, max) {
  if (!max) return null;
  return Math.round((total / max) * 100);
}

export function scoreStyle(percent) {
  if (percent === null || percent === undefined) return "bg-gray-100 text-gray-500";
  if (percent >= 70) return "bg-green-100 text-green-700";
  if (percent >= 50) return "bg-gold-100 text-gold-800";
  return "bg-red-100 text-red-700";
}