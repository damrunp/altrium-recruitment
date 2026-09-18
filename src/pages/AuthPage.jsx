import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import OtpInput from "../components/OtpInput";
import {
  checkPassword,
  passwordChecklist,
  MIN_PASSWORD_LENGTH,
} from "../lib/passwordPolicy";

// Sri Lankan mobile numbers: 07XXXXXXXX (10 digits) or +947XXXXXXXX
const LK_PHONE_REGEX = /^(?:\+94|0)7\d{8}$/;

const RESEND_COOLDOWN_SECONDS = 60;

export default function AuthPage() {
  const [mode, setMode] = useState("login"); // login | register
  const [step, setStep] = useState("form"); // form | otp
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
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const checklist = passwordChecklist(form.password);

  // Countdown for the "resend code" button.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // -------------------------------------------------------------------
  // Step 1 — validate, then ask Supabase to create the account and email
  // a code. Supabase generates, stores and expires the code itself; we
  // never handle it.
  // -------------------------------------------------------------------
  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

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
      // Pre-flight: server-side validation plus a clear duplicate-email
      // message. Supabase's own signUp deliberately hides whether an
      // email already exists, which makes for a confusing dead end.
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

      // Creates the account unconfirmed and emails a 6-digit code.
      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          // Picked up by the handle_new_user trigger to build the profile row.
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

      setStep("otp");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setInfo(`We sent a 6-digit code to ${form.email}. It expires in 10 minutes.`);
    } catch (err) {
      setError(err.message || "Network error — please try again.");
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------
  // Step 2 — verify. A correct code confirms the email AND returns a
  // session, so the person lands logged in.
  // -------------------------------------------------------------------
  const handleVerify = async (submittedCode) => {
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

    // Verified but no session came back — fall back to a password login.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    if (signInError) {
      setError("Your email is verified. Please log in.");
      setStep("form");
      setMode("login");
      return;
    }
    navigate(redirect);
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError("");
    setInfo("");
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

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });
    setLoading(false);

    if (signInError) {
      // An unconfirmed account can't log in — send them back to verification
      // rather than showing a dead-end error.
      if (/email not confirmed/i.test(signInError.message)) {
        setMode("register");
        setStep("otp");
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
    setStep("form");
    setError("");
    setInfo("");
    setCode("");
    setPasswordTouched(false);
  };

  // -------------------------------------------------------------------
  // OTP screen
  // -------------------------------------------------------------------
  if (step === "otp") {
    return (
      <div className="max-w-md mx-auto px-5 py-14">
        <h1 className="font-display text-3xl font-bold mb-1">Check your email</h1>
        <p className="text-ink/50 mb-8">
          We sent a 6-digit code to <span className="font-medium text-ink">{form.email}</span>.
        </p>

        {error && (
          <div className="mb-5 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}
        {info && !error && (
          <div className="mb-5 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg">{info}</div>
        )}

        <div className="mb-6">
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={handleVerify}
            disabled={loading}
          />
        </div>

        <button
          onClick={() => handleVerify()}
          disabled={loading || code.length !== 6}
          className="btn-primary w-full !py-3 disabled:opacity-50"
        >
          {loading ? "Verifying…" : "Verify and continue"}
        </button>

        <div className="text-center mt-6 space-y-3">
          <p className="text-sm text-ink/50">
            Didn't get it?{" "}
            <button
              onClick={handleResend}
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
    );
  }

  // -------------------------------------------------------------------
  // Login / register form
  // -------------------------------------------------------------------
  return (
    <div className="max-w-md mx-auto px-5 py-14">
      <h1 className="font-display text-3xl font-bold mb-1">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="text-ink/50 mb-8">
        {mode === "login"
          ? "Log in to apply for jobs or manage recruitment."
          : "Register to apply for jobs at Altrium."}
      </p>

      <div className="flex gap-2 mb-8 bg-ink/5 rounded-lg p-1">
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

      {error && (
        <div className="mb-5 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}
      {info && !error && (
        <div className="mb-5 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg">{info}</div>
      )}

      <form onSubmit={mode === "login" ? handleLogin : handleRegister} className="space-y-4">
        {mode === "register" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">First name</label>
              <input required className="input-field" value={form.firstName} onChange={update("firstName")} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Last name</label>
              <input required className="input-field" value={form.lastName} onChange={update("lastName")} />
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium mb-1 block">Email</label>
          <input
            required
            type="email"
            className="input-field"
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
              className="input-field"
              value={form.phone}
              onChange={update("phone")}
            />
          </div>
        )}

        <div>
          <label className="text-sm font-medium mb-1 block">Password</label>
          <input
            required
            type="password"
            minLength={mode === "register" ? MIN_PASSWORD_LENGTH : undefined}
            className="input-field"
            value={form.password}
            onChange={update("password")}
            onFocus={() => setPasswordTouched(true)}
          />

          {mode === "register" && passwordTouched && (
            <>
              <ul className="mt-2 space-y-1">
                {checklist.map((rule) => (
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
          )}
        </div>

        <button disabled={loading} className="btn-primary w-full !py-3 mt-2">
          {loading ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"}
        </button>

        {mode === "register" && (
          <p className="text-xs text-ink/40 text-center pt-1">
            We'll email you a 6-digit code to verify your address. All new
            accounts are candidates — staff roles are assigned internally.
          </p>
        )}
      </form>

      <p className="text-center text-sm text-ink/40 mt-6">
        <Link to="/" className="hover:text-gold-700">← Back to job listings</Link>
      </p>
    </div>
  );
}
