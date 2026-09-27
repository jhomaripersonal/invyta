import { useState } from "react";
import type { GuestGroup } from "../../types/models";
import type { GuestRecord, GuestRsvpStatus } from "../../lib/guests-store";

const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  cream: "#FAF8F5",
  border: "#E7E1D8",
  muted: "#78716C",
  white: "#FFFFFF",
  red: "#E55757",
};

const GROUP_OPTIONS: { id: GuestGroup; label: string }[] = [
  { id: "family", label: "Family" },
  { id: "friends", label: "Friends" },
  { id: "work", label: "Work" },
  { id: "school", label: "School" },
  { id: "vip", label: "VIP" },
  { id: "brides_family", label: "Bride's Family" },
  { id: "grooms_family", label: "Groom's Family" },
  { id: "other", label: "Other" },
];

export const GROUP_LABELS: Record<GuestGroup, string> = Object.fromEntries(GROUP_OPTIONS.map((g) => [g.id, g.label])) as Record<GuestGroup, string>;

const STATUS_OPTIONS: { id: GuestRsvpStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "declined", label: "Declined" },
];

export interface GuestFormValues {
  name: string;
  email: string;
  phone: string;
  groupName: GuestGroup | "";
  rsvpStatus: GuestRsvpStatus;
  numberOfGuests: number;
  notes: string;
}

const inputStyle = { border: `1px solid ${T.border}`, backgroundColor: T.cream, color: T.charcoal };
const inputClass = "w-full px-3.5 py-2.5 rounded-xl text-sm outline-none";
const labelClass = "block text-xs font-semibold mb-1.5";

interface Props {
  guest?: GuestRecord;
  onSave: (values: GuestFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export function GuestFormModal({ guest, onSave, onDelete, onClose }: Props) {
  const [values, setValues] = useState<GuestFormValues>({
    name: guest?.name ?? "",
    email: guest?.email ?? "",
    phone: guest?.phone ?? "",
    groupName: guest?.groupName ?? "",
    rsvpStatus: guest?.rsvpStatus ?? "pending",
    numberOfGuests: guest?.numberOfGuests ?? 1,
    notes: guest?.notes ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof GuestFormValues>(key: K, value: GuestFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSave() {
    if (!values.name.trim()) {
      setError("Guest name is required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSave(values);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this guest. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove this guest. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: "rgba(28, 41, 66,0.45)" }} onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ backgroundColor: T.white }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: T.charcoal }}>{guest ? "Edit Guest" : "Add Guest"}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-stone-100" style={{ color: T.muted }} aria-label="Close">✕</button>
        </div>

        <div className="mb-4">
          <label className={labelClass} style={{ color: T.muted }}>Full name</label>
          <input value={values.name} onChange={(e) => set("name", e.target.value)} className={inputClass} style={inputStyle} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelClass} style={{ color: T.muted }}>Email</label>
            <input value={values.email} onChange={(e) => set("email", e.target.value)} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass} style={{ color: T.muted }}>Phone</label>
            <input value={values.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} style={inputStyle} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelClass} style={{ color: T.muted }}>Group</label>
            <select value={values.groupName} onChange={(e) => set("groupName", e.target.value as GuestGroup | "")} className={inputClass} style={inputStyle}>
              <option value="">No group</option>
              {GROUP_OPTIONS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} style={{ color: T.muted }}>Number of guests</label>
            <input type="number" min={0} max={20} value={values.numberOfGuests} onChange={(e) => set("numberOfGuests", Math.max(0, Number(e.target.value)))} className={inputClass} style={inputStyle} />
          </div>
        </div>

        {guest && (
          // Only shown when editing an existing guest — a newly added guest
          // always starts "pending" (spec §20's Add Guest modal has no
          // status field; status only changes once they've actually
          // responded, which Edit lets you record manually).
          <div className="mb-4">
            <label className={labelClass} style={{ color: T.muted }}>RSVP status</label>
            <select value={values.rsvpStatus} onChange={(e) => set("rsvpStatus", e.target.value as GuestRsvpStatus)} className={inputClass} style={inputStyle}>
              {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        )}

        <div className="mb-5">
          <label className={labelClass} style={{ color: T.muted }}>Notes</label>
          <textarea rows={3} value={values.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputClass} resize-none`} style={inputStyle} placeholder="Private notes for your team — not visible to the guest" />
        </div>

        {error && <p className="text-xs mb-4" style={{ color: T.red }}>{error}</p>}

        <div className="flex items-center justify-between gap-3">
          {guest && onDelete ? (
            <button onClick={handleDelete} disabled={deleting} className="text-xs font-semibold px-3 py-2.5 rounded-xl disabled:opacity-60" style={{ color: T.red }}>
              {deleting ? "Removing..." : "Remove guest"}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium" style={{ border: `1px solid ${T.border}`, color: T.charcoal }}>Cancel</button>
            <button onClick={handleSave} disabled={submitting} className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60" style={{ backgroundColor: T.accent, color: T.white }}>
              {submitting ? "Saving..." : guest ? "Save changes" : "Add Guest"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
