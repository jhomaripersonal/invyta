import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import webAppLogo from "../../assets/webApp-logo-mark.png";
import { supabase } from "../../lib/supabase-client";
import { AUTH_T as T, AuthField } from "./AuthFields";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    // Always show the same confirmation regardless of whether the email
    // exists, so this endpoint can't be used to enumerate registered users.
    setSent(true);
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: T.cream }}>
      <div className="w-full max-w-md px-8 py-10 rounded-2xl shadow-lg" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <img src={webAppLogo} alt="Invyta" className="h-10 w-auto mx-auto" />
          </Link>
          <h1 className="mt-2 text-sm font-normal" style={{ color: T.muted }}>Reset your password</h1>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <p className="text-sm" style={{ color: T.charcoal }}>
              If an account exists for <span className="font-semibold">{email}</span>, we've sent a link to reset your password.
            </p>
            <Link to="/login" className="inline-block text-sm font-semibold underline" style={{ color: T.accent }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <p className="text-sm" style={{ color: T.muted }}>
              Enter the email associated with your account and we'll send you a link to reset your password.
            </p>
            <AuthField label="Email" type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} />
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: T.accent, color: T.white }}
            >
              {submitting ? "Sending..." : "Send reset link"}
            </button>
            <p className="text-center text-xs" style={{ color: T.muted }}>
              <Link to="/login" className="font-semibold underline" style={{ color: T.accent }}>
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
