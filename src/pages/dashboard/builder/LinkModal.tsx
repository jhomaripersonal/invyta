import { useEffect, useState } from "react";
import type { EventRecord } from "../../../lib/events-store";
import { invitationUrl, isSlugAvailable, normalizeSlugInput, setEventSlug, slugProblem } from "../../../lib/custom-links";
import { planAllows, requiredPlanLabel } from "../../../data/plan-limits";

const T = { accent: "#1C2942", charcoal: "#1C2942", cream: "#FAF8F5", border: "#E7E1D8", muted: "#78716C", white: "#FFFFFF", green: "#2E7D55", red: "#C24141" };

type Availability = "idle" | "checking" | "available" | "taken";

// The invitation's link: copy it, and — on Premium and up — choose a
// custom one. Old links keep working (they redirect), so changing it is
// safe even after the invitation has been shared.
export default function LinkModal({ event, onSaved, onUpgrade, onClose }: {
  event: EventRecord;
  onSaved: () => Promise<void> | void;
  onUpgrade: () => void;
  onClose: () => void;
}) {
  const canCustomize = planAllows(event.ownerPlan, "custom_url");
  const [slug, setSlug] = useState(event.slug);
  const [availability, setAvailability] = useState<Availability>("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const problem = slug === event.slug ? null : slugProblem(slug);
  const changed = slug !== event.slug;

  // Debounced availability check while typing.
  useEffect(() => {
    if (!changed || problem) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    const id = setTimeout(async () => {
      setAvailability((await isSlugAvailable(slug, event.id)) ? "available" : "taken");
    }, 400);
    return () => clearTimeout(id);
  }, [slug, changed, problem, event.id]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(invitationUrl(event.slug));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy your invitation link:", invitationUrl(event.slug));
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await setEventSlug(event.id, slug);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change the link.");
      setSaving(false);
    }
  }

  const prefix = `${window.location.host}/i/`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" style={{ backgroundColor: "rgba(28, 41, 66,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl p-6" style={{ backgroundColor: T.white }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-lg font-bold" style={{ color: T.charcoal }}>Invitation link</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-stone-100" style={{ color: T.muted }} aria-label="Close">✕</button>
        </div>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: T.muted }}>Current link</label>
        <div className="flex gap-2 mb-6">
          <div className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl text-sm truncate" style={{ backgroundColor: T.cream, border: `1px solid ${T.border}`, color: T.charcoal }}>
            {invitationUrl(event.slug)}
          </div>
          <button onClick={copy} className="px-4 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0" style={{ backgroundColor: T.accent, color: T.white }}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {canCustomize ? (
          <>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: T.muted }}>Custom link</label>
            <div className="flex items-stretch rounded-xl overflow-hidden mb-1.5" style={{ border: `1px solid ${problem || availability === "taken" ? T.red : T.border}` }}>
              <span className="px-3 flex items-center text-sm whitespace-nowrap" style={{ backgroundColor: T.cream, color: T.muted }}>{prefix}</span>
              <input
                value={slug}
                onChange={(e) => setSlug(normalizeSlugInput(e.target.value))}
                onBlur={() => setSlug((s) => s.replace(/-+$/, ""))}
                placeholder="elena-and-marco"
                className="flex-1 min-w-0 px-3 py-2.5 text-sm outline-none"
                style={{ color: T.charcoal }}
                aria-label="Custom link"
              />
            </div>
            <p className="text-xs mb-4 min-h-[1rem]" style={{ color: problem || availability === "taken" ? T.red : availability === "available" ? T.green : T.muted }}>
              {problem ??
                (availability === "checking" ? "Checking..." :
                  availability === "taken" ? "That link is already taken — try another." :
                    availability === "available" ? "✓ Available" :
                      "Letters, numbers and hyphens — e.g. your names and the year.")}
            </p>
            <p className="text-[11px] mb-4" style={{ color: T.muted }}>
              Already shared the current link? It keeps working and takes guests to the new one — personal guest links too.
            </p>
            {error && <p className="text-xs mb-3" style={{ color: T.red }}>{error}</p>}
            <button
              onClick={save}
              disabled={!changed || !!problem || availability !== "available" || saving}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: T.accent, color: T.white }}
            >
              {saving ? "Saving..." : "Save link"}
            </button>
          </>
        ) : (
          <div className="rounded-xl p-4" style={{ backgroundColor: T.cream, border: `1px dashed ${T.border}` }}>
            <p className="text-sm font-semibold mb-1" style={{ color: T.charcoal }}>Want a link like {prefix}elena-and-marco?</p>
            <p className="text-xs mb-3" style={{ color: T.muted }}>Custom links are included in {requiredPlanLabel("custom_url")}. Your current link keeps working if you change it later.</p>
            <button onClick={onUpgrade} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: T.accent, color: T.white }}>
              Upgrade this event
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
