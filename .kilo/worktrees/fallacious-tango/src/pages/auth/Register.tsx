import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import webAppLogo from "../../assets/webApp-logo-mark.png";
import { useAuth } from "../../lib/auth-context";

const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  cream: "#FAF8F5",
  border: "#E7E1D8",
  muted: "#78716C",
  white: "#FFFFFF",
};

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) {
      setError("Fill in your name, email, and password to continue.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const { needsEmailConfirmation } = await register(name, email, password);
      if (needsEmailConfirmation) {
        setCheckEmail(true);
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your account. Please try again.");
    } finally {
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

  if (checkEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: T.cream }}>
        <div className="w-full max-w-md px-8 py-10 rounded-2xl shadow-lg text-center" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
          <div className="text-4xl mb-4">📬</div>
          <h1 className="text-lg font-bold mb-2" style={{ color: T.charcoal }}>Check your email</h1>
          <p className="text-sm" style={{ color: T.muted }}>
            We sent a confirmation link to <span className="font-semibold">{email}</span>. Confirm your address, then sign in.
          </p>
          <Link to="/login" className="inline-block mt-5 text-sm font-semibold underline" style={{ color: T.accent }}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ backgroundColor: T.cream }}>
      <div className="w-full max-w-md px-8 py-10 rounded-2xl shadow-lg" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <img src={webAppLogo} alt="Invyta" className="h-10 w-auto mx-auto" />
          </Link>
          <p className="mt-2 text-sm" style={{ color: T.muted }}>Create your account</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <button
            type="button"
            onClick={handleGoogle}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm font-medium border transition-all hover:shadow-sm disabled:opacity-60"
            style={{ borderColor: T.border, color: T.charcoal }}
          >
            Continue with Google
          </button>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px" style={{ backgroundColor: T.border }} />
            <span className="text-xs" style={{ color: T.muted }}>or</span>
            <div className="flex-1 h-px" style={{ backgroundColor: T.border }} />
          </div>

          <input
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.cream, color: T.charcoal }}
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.cream, color: T.charcoal }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.cream, color: T.charcoal }}
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.cream, color: T.charcoal }}
          />

          {error && <p className="text-xs" style={{ color: "#E55757" }}>{error}</p>}

          <p className="text-[11px] leading-relaxed" style={{ color: T.muted }}>
            By creating an account, you confirm you're at least 18 and agree to Invyta's{" "}
            <Link to="/terms" className="underline">Terms of Service</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.
          </p>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: T.accent, color: T.white }}
          >
            {submitting ? "Creating account..." : "Create Account"}
          </button>

          <p className="text-center text-xs" style={{ color: T.muted }}>
            Already have an account?{" "}
            <Link to="/login" className="font-semibold underline" style={{ color: T.accent }}>
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
