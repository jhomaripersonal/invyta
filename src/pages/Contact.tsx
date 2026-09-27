import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import webAppLogo from "../assets/webApp-logo-mark.png";
import { useAuth } from "../lib/auth-context";
import { SUPPORT_CATEGORIES, submitSupportRequest, type SupportCategory } from "../lib/support";

const T = { accent: "#1C2942", charcoal: "#1C2942", cream: "#FAF8F5", border: "#E7E1D8", muted: "#78716C", white: "#FFFFFF", red: "#E55757", green: "#4CAF7D" };

const inputClass = "w-full px-4 py-3 rounded-xl text-sm outline-none";
const inputStyle = { border: `1px solid ${T.border}`, backgroundColor: T.cream, color: T.charcoal };

// Public contact form feeding the admin support inbox — for organizers and
// for guests without an account (e.g. "delete my RSVP", or reporting a
// suspicious invitation). Links can preselect a category and pass the page
// they came from: /contact?category=report&page=<url>.
export default function ContactPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const preset = SUPPORT_CATEGORIES.find((c) => c.id === params.get("category"))?.id;
  const [category, setCategory] = useState<SupportCategory>(preset ?? "question");
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [pageUrl, setPageUrl] = useState(params.get("page") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.includes("@") || !subject.trim() || !message.trim()) {
      setError("Please fill in your name, a valid email, a subject and your message.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await submitSupportRequest({ name, email, category, subject, message, pageUrl });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your message.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.cream, color: T.charcoal }}>
      <header className="h-16 px-5 md:px-8 flex items-center justify-between" style={{ backgroundColor: T.white, borderBottom: `1px solid ${T.border}` }}>
        <Link to="/"><img src={webAppLogo} alt="Invyta" className="h-9 w-auto" /></Link>
        <Link to={user ? "/dashboard" : "/"} className="text-sm" style={{ color: T.muted }}>{user ? "← Dashboard" : "← Home"}</Link>
      </header>

      <main className="max-w-xl mx-auto px-5 py-12">
        <h1 className="text-3xl font-bold mb-2" style={{ letterSpacing: "-0.025em" }}>Contact us</h1>
        <p className="text-sm mb-8" style={{ color: T.muted }}>We usually reply within 1–2 business days, by email.</p>

        {sent ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
            <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center text-xl" style={{ backgroundColor: "rgba(76,175,125,0.12)", color: T.green }}>✓</div>
            <h2 className="font-semibold mb-1">Message sent</h2>
            <p className="text-sm" style={{ color: T.muted }}>Thanks — we'll get back to you at {email.trim().toLowerCase()}.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl p-6" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: T.muted }}>What's this about?</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {SUPPORT_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className="text-left rounded-xl px-3.5 py-2.5"
                    style={{ border: `1.5px solid ${category === c.id ? T.accent : T.border}`, backgroundColor: category === c.id ? T.cream : T.white }}
                  >
                    <span className="block text-sm font-medium">{c.label}</span>
                    <span className="block text-[11px]" style={{ color: T.muted }}>{c.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} style={inputStyle} />
              <input placeholder="Email for our reply" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} className={inputClass} style={inputStyle} />
            </div>
            <input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className={inputClass} style={inputStyle} />
            {(category === "report" || category === "privacy" || pageUrl) && (
              <input
                placeholder={category === "report" ? "Link to the invitation you're reporting" : "Link to the invitation (optional)"}
                value={pageUrl}
                onChange={(e) => setPageUrl(e.target.value)}
                maxLength={500}
                className={inputClass}
                style={inputStyle}
              />
            )}
            <textarea placeholder="How can we help?" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} rows={6} className={`${inputClass} resize-none`} style={inputStyle} />
            {error && <p className="text-xs" style={{ color: T.red }}>{error}</p>}
            <button type="submit" disabled={submitting} className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: T.accent, color: T.white }}>
              {submitting ? "Sending..." : "Send message"}
            </button>
            <p className="text-[11px]" style={{ color: T.muted }}>
              We use these details only to answer your message. See our <Link to="/privacy" className="underline">Privacy Policy</Link>.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
