import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

const ROLE_LABELS = {
  candidate: "Candidate",
  hr: "HR",
  management: "Management",
  interviewer: "Interviewer",
};

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
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      // Cache-bust so the new image shows immediately even if the URL is unchanged
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

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-2 ml-1 border-l border-ink/10"
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt="Profile"
            className="w-8 h-8 rounded-full object-cover border border-ink/10"
          />
        ) : (
          <span className="w-8 h-8 rounded-full bg-gold text-ink font-semibold text-xs flex items-center justify-center">
            {initials(profile)}
          </span>
        )}
        <span className="hidden md:inline text-ink/60 text-xs text-left leading-tight">
          {profile?.first_name ? `Hi, ${profile.first_name}` : session.user.email}
          {profile?.role && (
            <>
              <br />
              <span className="text-gold-700 font-semibold">{ROLE_LABELS[profile.role] || profile.role}</span>
            </>
          )}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-72 card shadow-lg p-5 z-50 bg-white">
          <div className="flex items-center gap-3 mb-4">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Profile"
                className="w-14 h-14 rounded-full object-cover border border-ink/10"
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

          <dl className="text-sm space-y-1.5 mb-4">
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
            className="btn-outline w-full !py-2 text-sm mb-2"
          >
            {uploading ? "Uploading…" : "Change photo"}
          </button>

          <button onClick={handleSignOut} className="btn-secondary w-full !py-2 text-sm">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
