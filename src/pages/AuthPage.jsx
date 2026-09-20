import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import OtpInput from "../components/OtpInput";
import GradientBackdrop from "../components/GradientBackdrop";
import {
  checkPassword,
  passwordChecklist,
  MIN_PASSWORD_LENGTH,
} from "../lib/passwordPolicy";

const GLASS = "rounded-2xl border border-white/70 bg-white/55 backdrop-blur-xl";

// Sri Lankan mobile numbers: 07XXXXXXXX (10 digits) or +947XXXXXXXX
const LK_PHONE_REGEX = /^(?:\+94|0)7\d{8}$/;

const RESEND_COOLDOWN_SECONDS = 60;

// Screens this page can show.
//   form          login / register
//   signup-otp    verifying a new account
//   reset-email   asking which account to reset
//   reset-otp     entering the reset code
//   reset-new     choosing a new password
const STEPS = {
  FORM: "form",
  SIGNUP_OTP: "signup-otp",
  RESET_EMAIL: "reset-email",
  RESET_OTP: "reset-otp",
  RESET_NEW: "reset-new",
};

// -------------------------------------------------------------------
// Shared Components (Defined outside to preserve DOM state across re-renders)
// -------------------------------------------------------------------
function Shell({ title, subtitle, error, info, children }) {
  return (
    <div className="relative min-h-[80vh]">
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <GradientBackdrop />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-5 py-14">
        <h1 className="font-display text-3xl font-bold mb-1">{title}</h1>
        {subtitle && <p className="text-ink/50 mb-8">{subtitle}</p>}

        {error && (
          <div className="mb-5 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}
        {info && !error && (
          <div className="mb-5 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg">{info}</div>
        )}

        {children}
      </div>
    </div>
  );
}

function PasswordRules({ list }) {
  return (
    <>
      <ul className="mt-2 space-y-1">
        {list.map((rule) => (
          <li
            key={rule.label}
            className={`text-xs flex items-center gap-1.5 ${
              rule.done ? "text-green-600" : "text-ink/40"
            }`}
          >
            <span aria-hidden="true">{rule.done ? "✓" : "○"}</span>
            {rule.label}
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink/40 mt-2">
        Needs {MIN_PASSWORD_LENGTH}+ characters and at least 3 of the 4 types above.
      </p>
    </>
  );
}

// -------------------------------------------------------------------
// Main AuthPage Component
// -------------------------------------------------------------------
export default function AuthPage() {
  const [mode, setMode] = useState("login"); // login | register
  const [step, setStep] = useState(STEPS.FORM);
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [code, setCode] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [newPasswordTouched, setNewPasswordTouched] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const checklist = passwordChecklist(form.password);
  const newChecklist = passwordChecklist(newPassword);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const clearMessages = () => {
    setError("");
    setInfo("");
  };

  // -------------------------------------------------------------------
  // Register
  // -------------------------------------------------------------------
  const handleRegister = async (e) => {
    e.preventDefault();
    clearMessages();

    if (!LK_PHONE_REGEX.test(form.phone)) {
      setError("Enter a valid Sri Lankan mobile number, e.g. 0712345678");
      return;
    }

    const pw = checkPassword(form.password);
    if (!pw.valid) {
      setError(pw.error);
      return;
    }

    setLoading(true);
    try {
      const checkRes = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
        }),
      });

      let checkData;
      try {
        checkData = await checkRes.json();
      } catch {
        throw new Error(
          `Server returned an unexpected response (status ${checkRes.status}). ` +
            "Check that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in Vercel."
        );
      }

      if (!checkRes.ok) {
        setError(checkData.error || "Something went wrong creating your account.");
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          data: {
            first_name: form.firstName,
            last_name: form.lastName,
            phone: form.phone,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      setStep(STEPS.SIGNUP_OTP);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setInfo(`We sent a 6-digit code to ${form.email}. It expires in 10 minutes.`);
    } catch (err) {
      setError(err.message || "Network error — please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignup = async (submittedCode) => {
    const token = (submittedCode || code).trim();
    if (token.length !== 6) {
      setError("Enter all six digits.");
      return;
    }

    setError("");
    setLoading(true);

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: form.email.trim().toLowerCase(),
      token,
      type: "signup",
    });

    setLoading(false);

    if (verifyError) {
      setCode("");
      setError(
        /expired/i.test(verifyError.message)
          ? "That code has expired. Request a new one below."
          : "That code isn't right. Check your email and try again."
      );
      return;
    }

    if (data?.session) {
      navigate(redirect);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    if (signInError) {
      setError("Your email is verified. Please log in.");
      setStep(STEPS.FORM);
      setMode("login");
      return;
    }
    navigate(redirect);
  };

  const handleResendSignup = async () => {
    if (cooldown > 0) return;
    clearMessages();
    setLoading(true);

    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: form.email.trim().toLowerCase(),
    });

    setLoading(false);
    if (resendError) {
      setError(resendError.message);
      return;
    }
    setCode("");
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setInfo("New code sent. Check your inbox, and your spam folder.");
  };

  // -------------------------------------------------------------------
  // Password reset
  // -------------------------------------------------------------------
  const sendResetCode = async (e) => {
    e?.preventDefault();
    clearMessages();

    const email = resetEmail.trim().toLowerCase();
    if (!email) {
      setError("Enter the email on your account.");
      return;
    }

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setStep(STEPS.RESET_OTP);
    setCode("");
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setInfo(`If ${email} has an account, a 6-digit code is on its way.`);
  };

  const handleVerifyReset = async (submittedCode) => {
    const token = (submittedCode || code).trim();
    if (token.length !== 6) {
      setError("Enter all six digits.");
      return;
    }

    setError("");
    setLoading(true);

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: resetEmail.trim().toLowerCase(),
      token,
      type: "recovery",
    });

    setLoading(false);

    if (verifyError || !data?.session) {
      setCode("");
      setError(
        /expired/i.test(verifyError?.message || "")
          ? "That code has expired. Request a new one below."
          : "That code isn't right. Check your email and try again."
      );
      return;
    }

    clearMessages();
    setStep(STEPS.RESET_NEW);
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    clearMessages();

    const pw = checkPassword(newPassword);
    if (!pw.valid) {
      setError(pw.error);
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    navigate(redirect);
  };

  // -------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------
  const handleLogin = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });
    setLoading(false);

    if (signInError) {
      if (/email not confirmed/i.test(signInError.message)) {
        setMode("register");
        setStep(STEPS.SIGNUP_OTP);
        setInfo("This email isn't verified yet. Enter the code we sent you, or request a new one.");
        return;
      }
      setError(signInError.message);
      return;
    }
    navigate(redirect);
  };

  const switchMode = (next) => {
    setMode(next);
    setStep(STEPS.FORM);
    clearMessages();
    setCode("");
    setPasswordTouched(false);
  };

  const startReset = () => {
    clearMessages();
    setResetEmail(form.email);
    setCode("");
    setNewPassword("");
    setNewPasswordTouched(false);
    setStep(STEPS.RESET_EMAIL);
  };

  // -------------------------------------------------------------------
  // Reset: which account?
  // -------------------------------------------------------------------
  if (step === STEPS.RESET_EMAIL) {
    return (
      <Shell
        title="Reset your password"
        subtitle="We'll email you a 6-digit code to confirm it's you."
        error={error}
        info={info}
      >
        <form onSubmit={sendResetCode} className={`${GLASS} p-6 sm:p-8 space-y-4`}>
          <div>
            <label className="text-sm font-medium mb-1 block">Email</label>
            <input
              required
              type="email"
              autoFocus
              className="input-field bg-white/70"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
            />
          </div>

          <button disabled={loading} className="btn-primary w-full !py-3">
            {loading ? "Sending…" : "Send code"}
          </button>
        </form>

        <p className="text-center text-sm text-ink/40 mt-6">
          <button onClick={() => switchMode("login")} className="hover:text-gold-700">
            ← Back to log in
          </button>
        </p>
      </Shell>
    );
  }

  // -------------------------------------------------------------------
  // Reset: enter the code
  // -------------------------------------------------------------------
  if (step === STEPS.RESET_OTP) {
    return (
      <Shell
        title="Check your email"
        subtitle={`Enter the 6-digit code sent to ${resetEmail}.`}
        error={error}
        info={info}
      >
        <div className={`${GLASS} p-6 sm:p-8`}>
          <div className="mb-6">
            <OtpInput
              value={code}
              onChange={setCode}
              onComplete={handleVerifyReset}
              disabled={loading}
            />
          </div>

          <button
            onClick={() => handleVerifyReset()}
            disabled={loading || code.length !== 6}
            className="btn-primary w-full !py-3 disabled:opacity-50"
          >
            {loading ? "Checking…" : "Continue"}
          </button>

          <div className="text-center mt-6 space-y-3">
            <p className="text-sm text-ink/50">
              Didn't get it?{" "}
              <button
                onClick={sendResetCode}
                disabled={cooldown > 0 || loading}
                className="text-gold-700 font-semibold disabled:text-ink/30 disabled:cursor-not-allowed"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Send a new code"}
              </button>
            </p>
            <p className="text-xs text-ink/40">
              Codes expire after 10 minutes. Check your spam folder too.
            </p>
            <button
              onClick={() => setStep(STEPS.RESET_EMAIL)}
              className="text-sm text-ink/40 hover:text-ink/70"
            >
              ← Use a different email
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // -------------------------------------------------------------------
  // Reset: new password
  // -------------------------------------------------------------------
  if (step === STEPS.RESET_NEW) {
    return (
      <Shell
        title="Choose a new password"
        subtitle="You're signed in — set a new password below."
        error={error}
        info={info}
      >
        <form onSubmit={handleSetNewPassword} className={`${GLASS} p-6 sm:p-8 space-y-4`}>
          <div>
            <label className="text-sm font-medium mb-1 block">New password</label>
            <input
              required
              type="password"
              autoFocus
              minLength={MIN_PASSWORD_LENGTH}
              className="input-field bg-white/70"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onFocus={() => setNewPasswordTouched(true)}
            />
            {newPasswordTouched && <PasswordRules list={newChecklist} />}
          </div>

          <button disabled={loading} className="btn-primary w-full !py-3">
            {loading ? "Saving…" : "Save and continue"}
          </button>
        </form>
      </Shell>
    );
  }

  // -------------------------------------------------------------------
  // Signup verification
  // -------------------------------------------------------------------
  if (step === STEPS.SIGNUP_OTP) {
    return (
      <Shell
        title="Check your email"
        subtitle={`We sent a 6-digit code to ${form.email}.`}
        error={error}
        info={info}
      >
        <div className={`${GLASS} p-6 sm:p-8`}>
          <div className="mb-6">
            <OtpInput
              value={code}
              onChange={setCode}
              onComplete={handleVerifySignup}
              disabled={loading}
            />
          </div>

          <button
            onClick={() => handleVerifySignup()}
            disabled={loading || code.length !== 6}
            className="btn-primary w-full !py-3 disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify and continue"}
          </button>

          <div className="text-center mt-6 space-y-3">
            <p className="text-sm text-ink/50">
              Didn't get it?{" "}
              <button
                onClick={handleResendSignup}
                disabled={cooldown > 0 || loading}
                className="text-gold-700 font-semibold disabled:text-ink/30 disabled:cursor-not-allowed"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Send a new code"}
              </button>
            </p>
            <p className="text-xs text-ink/40">
              Codes expire after 10 minutes. Check your spam folder too.
            </p>
            <button
              onClick={() => switchMode("register")}
              className="text-sm text-ink/40 hover:text-ink/70"
            >
              ← Use a different email
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // -------------------------------------------------------------------
  // Login / register
  // -------------------------------------------------------------------
  return (
    <Shell
      title={mode === "login" ? "Welcome back" : "Create your account"}
      subtitle={
        mode === "login"
          ? "Log in to apply for jobs or manage recruitment."
          : "Register to apply for jobs at Altrium."
      }
      error={error}
      info={info}
    >
      <div className="flex gap-2 mb-6 bg-white/45 backdrop-blur-md border border-white/60 rounded-lg p-1">
        <button
          className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
            mode === "login" ? "bg-white shadow text-ink" : "text-ink/50"
          }`}
          onClick={() => switchMode("login")}
        >
          Log In
        </button>
        <button
          className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
            mode === "register" ? "bg-white shadow text-ink" : "text-ink/50"
          }`}
          onClick={() => switchMode("register")}
        >
          Register
        </button>
      </div>

      <form
        onSubmit={mode === "login" ? handleLogin : handleRegister}
        className={`${GLASS} p-6 sm:p-8 space-y-4`}
      >
        {mode === "register" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">First name</label>
              <input
                required
                className="input-field bg-white/70"
                value={form.firstName}
                onChange={update("firstName")}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Last name</label>
              <input
                required
                className="input-field bg-white/70"
                value={form.lastName}
                onChange={update("lastName")}
              />
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium mb-1 block">Email</label>
          <input
            required
            type="email"
            className="input-field bg-white/70"
            value={form.email}
            onChange={update("email")}
          />
        </div>

        {mode === "register" && (
          <div>
            <label className="text-sm font-medium mb-1 block">Phone number (LK)</label>
            <input
              required
              placeholder="07XXXXXXXX"
              className="input-field bg-white/70"
              value={form.phone}
              onChange={update("phone")}
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between gap-3 mb-1">
            <label className="text-sm font-medium">Password</label>
            {mode === "login" && (
              <button
                type="button"
                onClick={startReset}
                className="text-xs text-gold-700 font-semibold hover:underline"
              >
                Forgot password?
              </button>
            )}
          </div>

          <input
            required
            type="password"
            minLength={mode === "register" ? MIN_PASSWORD_LENGTH : undefined}
            className="input-field bg-white/70"
            value={form.password}
            onChange={update("password")}
            onFocus={() => setPasswordTouched(true)}
          />

          {mode === "register" && passwordTouched && <PasswordRules list={checklist} />}
        </div>

        <button disabled={loading} className="btn-primary w-full !py-3 mt-2">
          {loading ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"}
        </button>

        {mode === "register" && (
          <p className="text-xs text-ink/40 text-center pt-1">
            We'll email you a 6-digit code to verify your address. All new accounts are
            candidates — staff roles are assigned internally.
          </p>
        )}
      </form>

      <p className="text-center text-sm text-ink/40 mt-6">
        <Link to="/#open-positions" className="hover:text-gold-700">
          ← Back to job listings
        </Link>
      </p>
    </Shell>
  );
}