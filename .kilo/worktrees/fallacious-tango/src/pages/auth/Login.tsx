import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import webAppLogo from "../../assets/webApp-logo-mark.png";
import stationaryImage from "../../assets/stationary.jpg";
import { useAuth } from "../../lib/auth-context";

const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  cream: "#FAF8F5",
  border: "#E7E1D8",
  muted: "#78716C",
  white: "#FFFFFF",
};

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
  </svg>
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setSubmitting(true);
    try {
      await loginWithGoogle();
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in with Google.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: T.cream }}>
      {/* Brand panel — hidden on small screens, where the form's own logo
          above the "Welcome back" line already carries the branding. */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <img src={stationaryImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md px-8 py-10 rounded-2xl shadow-lg" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
          <div className="text-center mb-8">
            <Link to="/" className="inline-block">
              <img src={webAppLogo} alt="Invyta" className="h-10 w-auto mx-auto" />
            </Link>
            <p className="mt-2 text-sm" style={{ color: T.muted }}>Welcome back</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
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

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
              style={{ border: `1px solid ${T.border}`, backgroundColor: T.cream, color: T.charcoal }}
            />
            <div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ border: `1px solid ${T.border}`, backgroundColor: T.cream, color: T.charcoal }}
              />
              <div className="mt-2 text-right">
                <Link to="/forgot-password" className="text-xs font-medium hover:underline" style={{ color: T.muted }}>
                  Forgot password?
                </Link>
              </div>
            </div>

            {error && <p className="text-xs" style={{ color: "#E55757" }}>{error}</p>}

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
