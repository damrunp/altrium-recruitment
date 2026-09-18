import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Guards a route.
 *
 *   <ProtectedRoute>                  any logged-in user
 *   <ProtectedRoute staffOnly>        any internal account
 *   <ProtectedRoute roles={["hr"]}>   only those roles
 */
export function ProtectedRoute({ children, staffOnly = false, roles = null }) {
  const { session, isStaff, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-ink/50">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  if (roles && !roles.includes(role)) {
    // Send people where they can actually do something, rather than a
    // dead end. Interviewers live on their own interviews page.
    if (role === "interviewer") return <Navigate to="/my-interviews" replace />;
    return <Navigate to={isStaff ? "/dashboard" : "/status"} replace />;
  }

  if (staffOnly && !isStaff) {
    return <Navigate to="/status" replace />;
  }

  return children;
}
