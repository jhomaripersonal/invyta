import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";
import { SUPPORT_CATEGORIES, SUPPORT_STATUS_LABELS, listMySupportRequests, type SupportRequest } from "../../lib/support";
import { useEvents } from "../../lib/events-store";
import { EVENT_CATEGORIES } from "../../data/event-categories";
import {
  QUOTE_MAX,
  QUOTE_MIN,
  defaultDisplayName,
  deleteMyTestimonial,
  getMyTestimonial,
  saveMyTestimonial,
  type Testimonial,
  type TestimonialStatus,
} from "../../lib/testimonials";
import { supabase } from "../../lib/supabase-client";
import { planLabel } from "../../data/plan-limits";
import { T } from "../../lib/tokens";

const inputStyle = { border: `1px solid ${T.border}`, backgroundColor: T.cream, color: T.charcoal };
const inputClass = "w-full px-3.5 py-2.5 rounded-xl text-sm outline-none";
const labelClass = "block text-xs font-semibold mb-1.5";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl p-6 mb-5" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
      <h2 className="font-semibold text-sm mb-4" style={{ color: T.charcoal }}>{title}</h2>
      {children}
    </div>
  );
}

function Status({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return <p className="text-xs mt-3" style={{ color: message.ok ? T.green : T.red }}>{message.text}</p>;
}

export default function SettingsView({ onOpenBilling }: { onOpenBilling: () => void }) {
  const { user, deleteAccount } = useAuth();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setName(user?.name ?? "");
  }, [user?.name]);

  // The display name lives in two places: auth user metadata (what the app
  // reads on sign-in) and profiles.name (the one column users may update
  // on their own profile row). Updating auth metadata fires USER_UPDATED,
  // which refreshes the name shown across the dashboard.
  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !user) {
      setNameMessage({ ok: false, text: "Name can't be empty." });
      return;
    }
    setSavingName(true);
    setNameMessage(null);
    const { error } = await supabase.auth.updateUser({ data: { name: trimmed } });
    if (!error) await supabase.from("profiles").update({ name: trimmed }).eq("id", user.id);
    setSavingName(false);
    setNameMessage(error ? { ok: false, text: error.message } : { ok: true, text: "Name updated." });
  }

  async function handleSavePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setPasswordMessage({ ok: false, text: "Password must be at least 6 characters." });
      return;
    }
    if (password !== confirmPassword) {
      setPasswordMessage({ ok: false, text: "Passwords don't match." });
      return;
    }
    setSavingPassword(true);
    setPasswordMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) {
      setPasswordMessage({ ok: false, text: error.message });
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setPasswordMessage({ ok: true, text: "Password updated." });
  }

  // Irreversible, so it takes typing DELETE — not just a click — and says
  // exactly what goes with it. On success the session ends and the
  // protected route sends the (now signed-out) visitor to /login.
  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteAccount();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete your account. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6" style={{ letterSpacing: "-0.025em" }}>Settings</h1>

      <Card title="Profile">
        <form onSubmit={handleSaveName}>
          <label className={labelClass} style={{ color: T.muted }}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} mb-4`} style={inputStyle} />
          <label className={labelClass} style={{ color: T.muted }}>Email</label>
          <input value={user?.email ?? ""} disabled className={`${inputClass} mb-4 opacity-70`} style={inputStyle} />
          <button type="submit" disabled={savingName} className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: T.accent, color: T.white }}>
            {savingName ? "Saving..." : "Save name"}
          </button>
          <Status message={nameMessage} />
        </form>
      </Card>

      <Card title="Password">
        <form onSubmit={handleSavePassword}>
          <label className={labelClass} style={{ color: T.muted }}>New password</label>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} mb-4`} style={inputStyle} />
          <label className={labelClass} style={{ color: T.muted }}>Confirm new password</label>
          <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={`${inputClass} mb-4`} style={inputStyle} />
          <button type="submit" disabled={savingPassword} className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: T.accent, color: T.white }}>
            {savingPassword ? "Saving..." : "Update password"}
          </button>
          <Status message={passwordMessage} />
        </form>
      </Card>

      <TestimonialCard />

      <HelpCard userId={user?.id} />

      <Card title="Plan">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm" style={{ color: T.muted }}>
            {user?.isAdmin ? (
              <>As an admin, all your events have every Pro feature — no upgrade needed.</>
            ) : user?.plan && user.plan !== "free" ? (
              <>Your account is on <span className="font-semibold" style={{ color: T.charcoal }}>{planLabel(user.plan)}</span>, which covers all your events.</>
            ) : (
              <>Plans are per event — each event starts Free and can be upgraded on its own.</>
            )}
          </p>
          <button onClick={onOpenBilling} className="text-sm font-semibold px-4 py-2 rounded-xl" style={{ border: `1px solid ${T.border}`, color: T.charcoal }}>
            View plans
          </button>
        </div>
      </Card>

      <div className="rounded-2xl p-6 mb-5" style={{ backgroundColor: T.white, border: "1px solid rgba(229,87,87,0.4)" }}>
        <h2 className="font-semibold text-sm mb-2" style={{ color: T.red }}>Delete account</h2>
        <p className="text-sm mb-4 leading-relaxed" style={{ color: T.muted }}>
          This permanently deletes your account and everything in it: all your events and invitations (their links stop working),
          every guest list and RSVP, and all uploaded photos. This can't be undone.
        </p>
        <label className={labelClass} style={{ color: T.muted }}>Type DELETE to confirm</label>
        <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" className={`${inputClass} mb-4`} style={inputStyle} />
        <button
          onClick={handleDeleteAccount}
          disabled={confirmText !== "DELETE" || deleting}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: T.red, color: T.white }}
        >
          {deleting ? "Deleting..." : "Permanently delete my account"}
        </button>
        {deleteError && <p className="text-xs mt-3" style={{ color: T.red }}>{deleteError}</p>}
      </div>
    </div>
  );
}

// Help & support: shortcuts into the contact form (preselecting the right
// topic) and the organizer's own recent requests with their status, so
// they can see a question was received and where it stands.
const QUICK_TOPICS = ["question", "billing", "bug", "report", "privacy"] as const;

function HelpCard({ userId }: { userId?: string }) {
  const [requests, setRequests] = useState<SupportRequest[] | null>(null);

  useEffect(() => {
    if (userId) listMySupportRequests(userId).then(setRequests);
  }, [userId]);

  return (
    <Card title="Help & support">
      <p className="text-sm mb-4" style={{ color: T.muted }}>Questions, problems or requests — we usually reply within 1–2 business days, by email.</p>
      <div className="grid sm:grid-cols-2 gap-2 mb-5">
        {QUICK_TOPICS.map((id) => {
          const topic = SUPPORT_CATEGORIES.find((c) => c.id === id)!;
          return (
            <Link key={id} to={`/contact?category=${id}`} className="rounded-xl px-3.5 py-2.5 transition-colors hover:bg-stone-50" style={{ border: `1px solid ${T.border}` }}>
              <span className="block text-sm font-medium" style={{ color: T.charcoal }}>{topic.label}</span>
              <span className="block text-[11px]" style={{ color: T.muted }}>{topic.hint}</span>
            </Link>
          );
        })}
      </div>

      <p className="text-xs font-semibold mb-2" style={{ color: T.muted }}>Your requests</p>
      {requests === null ? (
        <p className="text-xs" style={{ color: T.muted }}>Loading...</p>
      ) : requests.length === 0 ? (
        <p className="text-xs" style={{ color: T.muted }}>You haven't contacted support yet.</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
          {requests.map((r, i) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5" style={{ borderTop: i ? `1px solid ${T.border}` : undefined }}>
              <div className="min-w-0">
                <div className="text-sm truncate" style={{ color: T.charcoal }}>{r.subject}</div>
                <div className="text-[11px]" style={{ color: T.muted }}>
                  {SUPPORT_CATEGORIES.find((c) => c.id === r.category)?.label} · {new Date(r.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: r.status === "resolved" ? T.green : T.charcoal }}>
                {SUPPORT_STATUS_LABELS[r.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Share your experience: the organizer's one testimonial. Needs an event
// first (the database enforces it too), explicit consent to show it
// publicly, and admin approval before it appears on the landing page.
// Editing sends it back for review; removing it withdraws it.
const TESTIMONIAL_STATUS: Record<TestimonialStatus, { label: string; note: string }> = {
  pending: { label: "In review", note: "We'll check it shortly. It isn't public yet." },
  approved: { label: "Published", note: "Showing on the Invyta homepage. Thank you!" },
  rejected: { label: "Not published", note: "This one wasn't published. You can edit it and send it again." },
};

function TestimonialCard() {
  const { user } = useAuth();
  const { events, isLoading: eventsLoading } = useEvents();
  const [existing, setExisting] = useState<Testimonial | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [quote, setQuote] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [eventLabel, setEventLabel] = useState("");
  const [rating, setRating] = useState<number>(5);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function fillForm(t: Testimonial | null) {
    const latest = events[0];
    const category = latest ? EVENT_CATEGORIES.find((c) => c.id === latest.category)?.label : undefined;
    setQuote(t?.quote ?? "");
    setDisplayName(t?.displayName ?? defaultDisplayName(user?.name ?? ""));
    setEventLabel(t?.eventLabel ?? category ?? "");
    setRating(t?.rating ?? 5);
    setConsent(false);
  }

  useEffect(() => {
    if (!user) return;
    getMyTestimonial(user.id).then((t) => {
      setExisting(t);
      fillForm(t);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, events.length]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (quote.trim().length < QUOTE_MIN) {
      setMessage({ ok: false, text: `Please write at least ${QUOTE_MIN} characters.` });
      return;
    }
    if (!displayName.trim()) {
      setMessage({ ok: false, text: "Add the name to show with your testimonial." });
      return;
    }
    if (!consent) {
      setMessage({ ok: false, text: "Please tick the box to let us show it publicly." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await saveMyTestimonial(existing?.id ?? null, { quote, displayName, eventLabel, rating });
      const saved = user ? await getMyTestimonial(user.id) : null;
      setExisting(saved);
      setEditing(false);
      setConsent(false);
      setMessage({ ok: true, text: "Thanks! We'll review it before it appears on the homepage." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!existing) return;
    setBusy(true);
    try {
      await deleteMyTestimonial(existing.id);
      setExisting(null);
      fillForm(null);
      setMessage({ ok: true, text: "Removed. It's no longer shown anywhere." });
    } finally {
      setBusy(false);
    }
  }

  if (existing === undefined || eventsLoading) {
    return <Card title="Share your experience"><p className="text-xs" style={{ color: T.muted }}>Loading...</p></Card>;
  }

  if (events.length === 0 && !existing) {
    return (
      <Card title="Share your experience">
        <p className="text-sm" style={{ color: T.muted }}>Once you've created an event with Invyta, you can share how it went here.</p>
      </Card>
    );
  }

  const showForm = !existing || editing;

  return (
    <Card title="Share your experience">
      {existing && !editing && (
        <div className="mb-1">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: existing.status === "approved" ? T.green : T.charcoal }}>
              {TESTIMONIAL_STATUS[existing.status].label}
            </span>
            <span className="text-[11px]" style={{ color: T.muted }}>{TESTIMONIAL_STATUS[existing.status].note}</span>
          </div>
          <blockquote className="text-sm italic leading-relaxed p-3.5 rounded-xl mb-2" style={{ backgroundColor: T.cream, color: T.charcoal }}>
            "{existing.quote}"
          </blockquote>
          <p className="text-xs mb-4" style={{ color: T.muted }}>
            — {existing.displayName}{existing.eventLabel ? `, ${existing.eventLabel}` : ""}{existing.rating ? ` · ${"★".repeat(existing.rating)}` : ""}
          </p>
          <div className="flex gap-2">
            <button onClick={() => { fillForm(existing); setEditing(true); setMessage(null); }} className="text-xs font-semibold px-3.5 py-2 rounded-lg" style={{ border: `1px solid ${T.border}`, color: T.charcoal }}>
              Edit
            </button>
            <button onClick={handleRemove} disabled={busy} className="text-xs font-semibold px-3.5 py-2 rounded-lg disabled:opacity-60" style={{ border: `1px solid ${T.border}`, color: T.red }}>
              Remove
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSave}>
          {!existing && <p className="text-sm mb-4" style={{ color: T.muted }}>How was Invyta for your celebration? With your permission, we may feature it on our homepage.</p>}
          <label className={labelClass} style={{ color: T.muted }}>Your rating</label>
          <div className="flex gap-1 mb-4" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                onClick={() => setRating(n)}
                className="text-2xl leading-none"
                style={{ color: n <= rating ? "#C9A66B" : T.border }}
              >
                ★
              </button>
            ))}
          </div>
          <label className={labelClass} style={{ color: T.muted }}>Your testimonial</label>
          <textarea
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            maxLength={QUOTE_MAX}
            rows={4}
            placeholder="What did you and your guests like?"
            className={`${inputClass} resize-none mb-1`}
            style={inputStyle}
          />
          <p className="text-[11px] text-right mb-3" style={{ color: T.muted }}>{quote.length} / {QUOTE_MAX}</p>
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className={labelClass} style={{ color: T.muted }}>Name to show</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} placeholder="e.g. Maria S." className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: T.muted }}>Event (optional)</label>
              <input value={eventLabel} onChange={(e) => setEventLabel(e.target.value)} maxLength={80} placeholder="e.g. Wedding · Taguig City" className={inputClass} style={inputStyle} />
            </div>
          </div>
          <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span className="text-xs leading-relaxed" style={{ color: T.charcoal }}>
              I agree that Invyta may show this testimonial publicly, on its website and marketing, with the name and event I entered above.
              I can remove it at any time.
            </span>
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: T.accent, color: T.white }}>
              {busy ? "Sending..." : existing ? "Send for review" : "Share testimonial"}
            </button>
            {editing && (
              <button type="button" onClick={() => { setEditing(false); setMessage(null); }} className="px-4 py-2.5 rounded-xl text-sm font-medium" style={{ border: `1px solid ${T.border}`, color: T.charcoal }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
      <Status message={message} />
    </Card>
  );
}
