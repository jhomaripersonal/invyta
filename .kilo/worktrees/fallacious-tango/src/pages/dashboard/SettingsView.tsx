import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase-client";
import { planLabel } from "../../data/plan-limits";

const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  cream: "#FAF8F5",
  border: "#E7E1D8",
  muted: "#78716C",
  white: "#FFFFFF",
  green: "#4CAF7D",
  red: "#E55757",
};

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

      <Card title="Plan">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm" style={{ color: T.muted }}>
            {user?.plan && user.plan !== "free" ? (
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
