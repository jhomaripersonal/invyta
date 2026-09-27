import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import webAppLogo from "../../assets/webApp-logo-mark.png";
import { supabase } from "../../lib/supabase-client";

const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  cream: "#FAF8F5",
  border: "#E7E1D8",
  muted: "#78716C",
  white: "#FFFFFF",
};

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase exchanges the recovery link's token for a temporary session
    // and fires this event once that's done — only then can updateUser() work.
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError("");
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: T.cream }}>
      <div className="w-full max-w-md px-8 py-10 rounded-2xl shadow-lg" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <img src={webAppLogo} alt="Invyta" className="h-10 w-auto mx-auto" />
          </Link>
          <p className="mt-2 text-sm" style={{ color: T.muted }}>Set a new password</p>
        </div>

        {done ? (
          <div className="text-center space-y-4">
            <p className="text-sm" style={{ color: T.charcoal }}>Your password has been updated.</p>
            <button
              onClick={() => navigate("/dashboard")}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
              style={{ backgroundColor: T.accent, color: T.white }}
            >
              Continue to dashboard
            </button>
          </div>
        ) : !ready ? (
          <p className="text-sm text-center" style={{ color: T.muted }}>
            Open this page from the reset link in your email.
          </p>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ border: `1px solid ${T.border}`, backgroundColor: T.cream, color: T.charcoal }}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ border: `1px solid ${T.border}`, backgroundColor: T.cream, color: T.charcoal }}
            />
            {error && <p className="text-xs" style={{ color: "#E55757" }}>{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: T.accent, color: T.white }}
            >
              {submitting ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
