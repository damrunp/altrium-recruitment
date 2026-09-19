import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ChatWidget from "./components/ChatWidget";
import HoneycombBackground from "./components/HoneycombBackground";
import ScrollToTop from "./components/ScrollToTop";
import { ProtectedRoute } from "./components/ProtectedRoute";

import Home from "./pages/Home";
import About from "./pages/About";
import JobDetail from "./pages/JobDetail";
import AuthPage from "./pages/AuthPage";
import ApplicationForm from "./pages/ApplicationForm";
import CandidateStatus from "./pages/CandidateStatus";
import Dashboard from "./pages/Dashboard";
import JobFormPage from "./pages/JobFormPage";
import Applicants from "./pages/Applicants";
import ScheduleInterview from "./pages/ScheduleInterview";
import EvaluationDashboard from "./pages/EvaluationDashboard";
import MyInterviews from "./pages/MyInterviews";
import EvaluationForm from "./pages/EvaluationForm";
import Availability from "./pages/Availability";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <ScrollToTop />
      <HoneycombBackground />
      <Navbar />
      <main className="flex-1">
        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/jobs/:jobId" element={<JobDetail />} />
          <Route path="/auth" element={<AuthPage />} />

          {/* Candidate */}
          <Route
            path="/apply/:jobId"
            element={
              <ProtectedRoute>
                <ApplicationForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/status"
            element={
              <ProtectedRoute>
                <CandidateStatus />
              </ProtectedRoute>
            }
          />

          {/* HR and management. Interviewers are redirected to their own
              interviews — the job dashboard isn't theirs to see. */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute roles={["hr", "management"]}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/jobs/:jobId/applicants"
            element={
              <ProtectedRoute roles={["hr", "management"]}>
                <Applicants />
              </ProtectedRoute>
            }
          />

          {/* HR only */}
          <Route
            path="/dashboard/jobs/new"
            element={
              <ProtectedRoute roles={["hr"]}>
                <JobFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/jobs/:jobId/edit"
            element={
              <ProtectedRoute roles={["hr"]}>
                <JobFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/applications/:applicationId/schedule"
            element={
              <ProtectedRoute roles={["hr"]}>
                <ScheduleInterview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/evaluations"
            element={
              <ProtectedRoute roles={["hr"]}>
                <EvaluationDashboard />
              </ProtectedRoute>
            }
          />

          {/* Interviewers and managers */}
          <Route
            path="/my-interviews"
            element={
              <ProtectedRoute roles={["interviewer", "management"]}>
                <MyInterviews />
              </ProtectedRoute>
            }
          />
          <Route
            path="/interviews/:interviewId/evaluate"
            element={
              <ProtectedRoute roles={["interviewer", "management"]}>
                <EvaluationForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/availability"
            element={
              <ProtectedRoute roles={["interviewer", "management", "hr"]}>
                <Availability />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />

      <ChatWidget />
    </div>
  );
}
