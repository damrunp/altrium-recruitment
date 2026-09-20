import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

const ROLE_LABELS = {
  candidate: "Candidate",
  hr: "HR",
  management: "Management",
  interviewer: "Interviewer",
};

// Gap between the avatar button and the top of the panel.
const OFFSET = 20;

// How far past the button's right edge the panel sits. A small negative
// inset pulls it further right, closer to the window edge.
const RIGHT_NUDGE = 10;

// Never let it touch the window edge on a narrow screen.
const MIN_EDGE_GAP = 8;

function initials(profile) {
  const f = profile?.first_name?.[0] || "";
  const l = profile?.last_name?.[0] || "";
  return (f + l).toUpperCase() || "?";
}

export default function ProfileMenu() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pos, setPos] = useState({ top: 0, right: 0 });

  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  // Measure where the panel should sit, in viewport coordinates.
  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      top: rect.bottom + OFFSET,
      right: Math.max(MIN_EDGE_GAP, window.innerWidth - rect.right - RIGHT_NUDGE),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onPointer = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    // Reposition rather than close, so scrolling doesn't feel broken.
    const onScrollOrResize = () => place();

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, place]);

  if (!session) return null;

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Image must be under 3MB.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${session.user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust so the new image shows immediately.
      const avatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", session.user.id);
      if (updateError) throw updateError;

      await refreshProfile();
    } catch (err) {
      setError(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setOpen(false);
    navigate("/");
  };

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Account"
      style={{ top: pos.top, right: pos.right }}
      /* Rendered on document.body via a portal, NOT inside the navbar.
         A backdrop-filter nested inside another backdrop-filter can only
         sample its parent's rendered output — and the navbar is 64px
         tall, so below that line there'd be nothing to blur and the
         panel would look merely transparent. Out here it samples the
         page itself. */
      className="fixed z-[60] w-72 rounded-2xl border border-white/50 bg-white/40 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5)] p-5"
    >
      <div className="flex items-center gap-3 mb-4">
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt="Profile"
            className="w-14 h-14 rounded-full object-cover border border-white/70"
          />
        ) : (
          <span className="w-14 h-14 rounded-full bg-gold text-ink font-semibold text-lg flex items-center justify-center">
            {initials(profile)}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-semibold truncate">
            {profile?.first_name} {profile?.last_name}
          </p>
          <span className="badge bg-gold-100 text-gold-800">
            {ROLE_LABELS[profile?.role] || profile?.role}
          </span>
        </div>
      </div>

      <dl className="text-sm space-y-1.5 mb-4 rounded-xl bg-white/30 border border-white/50 px-3 py-2.5">
        <div className="flex justify-between gap-3">
          <dt className="text-ink/40">Email</dt>
          <dd className="truncate text-right">{profile?.email}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink/40">Phone</dt>
          <dd className="text-right">{profile?.phone || "—"}</dd>
        </div>
      </dl>

      {error && <p className="text-red-600 text-xs mb-3">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="btn-outline w-full !py-2 text-sm mb-2 bg-white/40 border-white/60"
      >
        {uploading ? "Uploading…" : "Change photo"}
      </button>

      <button onClick={handleSignOut} className="btn-secondary w-full !py-2 text-sm">
        Sign out
      </button>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 pl-2 ml-1 border-l border-ink/10"
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt="Profile"
            className="w-8 h-8 rounded-full object-cover border border-white/70 shadow-sm"
          />
        ) : (
          <span className="w-8 h-8 rounded-full bg-gold text-ink font-semibold text-xs flex items-center justify-center shadow-sm">
            {initials(profile)}
          </span>
        )}
        <span className="hidden md:inline text-ink/60 text-xs text-left leading-tight">
          {profile?.first_name ? `Hi, ${profile.first_name}` : session.user.email}
          {profile?.role && (
            <>
              <br />
              <span className="text-gold-700 font-semibold">
                {ROLE_LABELS[profile.role] || profile.role}
              </span>
            </>
          )}
        </span>
      </button>

      {open && createPortal(panel, document.body)}
    </div>
  );
}
