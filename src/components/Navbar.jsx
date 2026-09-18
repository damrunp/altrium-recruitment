import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";
import ProfileMenu from "./ProfileMenu";

export default function Navbar() {
  const { session, isStaff, isHR, isManagement, isInterviewer, conductsInterviews } = useAuth();

  const linkClass = "px-3 py-2 rounded-md hover:text-gold-700 transition-colors";

  // Interviewers have no business on the job dashboard — they only ever
  // need the interviews assigned to them and their own calendar.
  const canSeeDashboard = isHR || isManagement;

  return (
    <header className="sticky top-0 z-40 bg-white/55 backdrop-blur-xl backdrop-saturate-150 border-b border-white/40 text-ink shadow-[0_1px_16px_-8px_rgba(0,0,0,0.25)]">
      <div className="max-w-6xl mx-auto px-5 flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2.5 font-display font-bold text-xl">
          <Logo className="h-9 w-auto" />
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 text-sm font-medium">
          <Link to="/" className={linkClass}>
            Jobs
          </Link>

          <Link to="/about" className={linkClass}>
            About
          </Link>

          {session && !isStaff && (
            <Link to="/status" className={linkClass}>
              My Applications
            </Link>
          )}

          {session && canSeeDashboard && (
            <Link to="/dashboard" className={linkClass}>
              Dashboard
            </Link>
          )}

          {session && isHR && (
            <Link to="/dashboard/evaluations" className={linkClass}>
              Evaluations
            </Link>
          )}

          {session && conductsInterviews && (
            <>
              <Link to="/my-interviews" className={linkClass}>
                My Interviews
              </Link>
              <Link to="/availability" className={linkClass}>
                Availability
              </Link>
            </>
          )}

          {!session && (
            <Link to="/auth" className="btn-primary !px-4 !py-2 text-sm">
              Login / Register
            </Link>
          )}

          <ProfileMenu />
        </nav>
      </div>
    </header>
  );
}
