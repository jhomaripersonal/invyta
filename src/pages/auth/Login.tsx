import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import webAppLogo from "../../assets/webApp-logo-mark.png";
import stationaryImage from "../../assets/stationary.webp";
import { useAuth } from "../../lib/auth-context";
import { friendlyAuthError } from "../../lib/auth-errors";
import { AUTH_T as T, AuthField, FormError, GoogleIcon, PasswordField } from "./AuthFields";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  // Signed in with an unconfirmed email: offer to send the link again.
  const [canResend, setCanResend] = useState(false);
  const [resent, setResent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { login, loginWithGoogle, resendConfirmation } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    setError("");
    setCanResend(false);
    setResent(false);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      const friendly = friendlyAuthError(err, "Couldn't sign in. Please try again.");
      setError(friendly.message);
      setCanResend(friendly.kind === "unconfirmed");
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setSubmitting(true);
    try {
      await resendConfirmation(email);
      setResent(true);
      setError("");
    } catch (err) {
      setError(friendlyAuthError(err, "Couldn't send the email. Please try again.").message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setSubmitting(true);
    try {
      // Leaves for Google and comes back to /dashboard.
      await loginWithGoogle();
    } catch (err) {
      setError(friendlyAuthError(err, "Couldn't sign in with Google. Please try again.").message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: T.cream }}>
      {/* Brand panel — wide screens only. A background image (not an <img>)
          so phones, where the panel is hidden, never download it. Shown
          whole ("contain") so the logo and tagline are never cropped, over
          a gradient matching the paper's top and bottom edges. */}
      <div
        className="hidden lg:block lg:w-1/2"
        style={{
          backgroundImage: `url(${stationaryImage}), linear-gradient(#E7E2DC, #D1CAC0)`,
          backgroundSize: "contain, cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
        aria-hidden="true"
      />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md px-8 py-10 rounded-2xl shadow-lg" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
          <div className="text-center mb-8">
            <Link to="/" className="inline-block">
              <img src={webAppLogo} alt="Invyta — back to home" className="h-10 w-auto mx-auto" />
            </Link>
            <h1 className="mt-2 text-sm font-normal" style={{ color: T.muted }}>Welcome back</h1>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm font-medium border transition-all hover:shadow-sm disabled:opacity-60"
              style={{ borderColor: T.border, color: T.charcoal }}
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="flex items-center gap-4">
              <div className="flex-1 h-px" style={{ backgroundColor: T.border }} />
              <span className="text-xs" style={{ color: T.muted }}>or</span>
              <div className="flex-1 h-px" style={{ backgroundColor: T.border }} />
            </div>

            <AuthField label="Email" type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
            <div>
              <PasswordField label="Password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <div className="mt-2 text-right">
                <Link to="/forgot-password" className="text-xs font-medium hover:underline" style={{ color: T.muted }}>
                  Forgot password?
                </Link>
              </div>
            </div>

            <FormError>{error}</FormError>
            {canResend && !resent && (
              <button type="button" onClick={handleResend} disabled={submitting} className="text-xs font-semibold underline disabled:opacity-60" style={{ color: T.accent }}>
                Send the confirmation email again
              </button>
            )}
            {resent && (
              <p role="status" className="text-xs" style={{ color: T.charcoal }}>
                Sent! Check <span className="font-semibold">{email}</span> for a new confirmation link.
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: T.accent, color: T.white }}
            >
              {submitting ? "Signing in..." : "Sign In"}
            </button>

            <p className="text-center text-xs" style={{ color: T.muted }}>
              Don't have an account?{" "}
              <Link to="/register" className="font-semibold underline" style={{ color: T.accent }}>
                Create one
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
