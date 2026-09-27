import { useEffect } from "react";
import { Link } from "react-router-dom";
import webAppLogo from "../assets/webApp-logo-mark.png";
import { LEGAL_INFO } from "../data/legal";

const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  cream: "#FAF8F5",
  border: "#E7E1D8",
  muted: "#78716C",
  surface: "#F5F0E8",
  white: "#FFFFFF",
};

// Company "About" page, linked from the landing footer. Describes only what
// Invyta is and does today — no invented team, founding story or usage
// numbers; add those here once they're real.
export default function AboutPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.cream, color: T.charcoal, fontFamily: "var(--font-sans)" }}>
      <header className="h-16 px-5 md:px-8 flex items-center justify-between" style={{ backgroundColor: T.white, borderBottom: `1px solid ${T.border}` }}>
        <Link to="/"><img src={webAppLogo} alt="Invyta" className="h-9 w-auto" /></Link>
        <nav className="flex items-center gap-5 text-sm" style={{ color: T.muted }}>
          <Link to="/" className="hover:underline">Home</Link>
          <Link to="/contact" className="hover:underline">Contact</Link>
        </nav>
      </header>

      <main>
        <section className="max-w-3xl mx-auto px-5 md:px-8 pt-16 pb-12">
          <p className="text-xs font-bold uppercase tracking-[0.15em] mb-3" style={{ color: T.accent }}>About Invyta</p>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-5" style={{ letterSpacing: "-0.03em" }}>
            Create. Invite. <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>Celebrate.</span>
          </h1>
          <p className="text-lg leading-relaxed" style={{ color: T.muted }}>
            Invyta turns an invitation into a beautiful webpage your guests can open anywhere — with the details they need, a countdown to
            the day, your photos, and an RSVP they can answer in a tap. Made for Filipino celebrations, from weddings and debuts to baptisms,
            birthdays, graduations and company events.
          </p>
        </section>

        <section style={{ backgroundColor: T.white, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
          <div className="max-w-5xl mx-auto px-5 md:px-8 py-14 grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Why we built it",
                body: "Printed invitations take weeks and money, a flat image in a group chat gets buried, and tracking who's coming usually ends up in a spreadsheet and a lot of follow-up messages. We wanted one link that does all of it.",
              },
              {
                title: "What it does",
                body: "Design an invitation from templates made for each kind of celebration, share it on Messenger, Viber or anywhere, collect RSVPs, manage your guest list, and check guests in with QR codes on the day.",
              },
              {
                title: "How we price it",
                body: "Every event starts free. If an event needs more — premium designs, unlimited guests, check-in, analytics — you upgrade just that event, once, with GCash, Maya or card. No subscription.",
              },
            ].map((b) => (
              <div key={b.title}>
                <h2 className="font-semibold mb-2">{b.title}</h2>
                <p className="text-sm leading-relaxed" style={{ color: T.muted }}>{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-3xl mx-auto px-5 md:px-8 py-14">
          <h2 className="text-2xl font-bold mb-5" style={{ letterSpacing: "-0.02em" }}>What we promise</h2>
          <ul className="space-y-4">
            {[
              ["Your guests' privacy comes first.", "Guest lists and RSVPs are visible only to the event's host — never to other guests — and we handle personal data under the Philippine Data Privacy Act."],
              ["Your data stays yours.", "You can delete your account and everything in it at any time from Settings."],
              ["No surprise charges.", "Prices are shown before you pay, and an upgrade is a one-time payment for one event."],
              ["Real people answer.", "Questions, problems and reports go to our support team, and we usually reply within 1–2 business days."],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex-shrink-0" style={{ color: T.accent }}>✓</span>
                <span className="text-sm leading-relaxed">
                  <span className="font-semibold">{title}</span> <span style={{ color: T.muted }}>{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="max-w-3xl mx-auto px-5 md:px-8 pb-20">
          <div className="rounded-2xl p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-5" style={{ backgroundColor: T.accent, color: T.white }}>
            <div>
              <h2 className="text-xl font-bold mb-1">Planning a celebration?</h2>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>Make your first invitation free — it takes a few minutes.</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Link to="/register" className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ backgroundColor: T.white, color: T.accent }}>Get started</Link>
              <Link to="/contact" className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ border: "1px solid rgba(255,255,255,0.35)", color: T.white }}>Contact us</Link>
            </div>
          </div>
          <p className="text-xs mt-6" style={{ color: T.muted }}>Invyta is operated by {LEGAL_INFO.companyName}. See our <Link to="/privacy" className="underline">Privacy Policy</Link> and <Link to="/terms" className="underline">Terms</Link>.</p>
        </section>
      </main>
    </div>
  );
}
