import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEvents, type NewEventInput } from "../../lib/events-store";
import { EVENT_CATEGORIES, EVENT_CATEGORY_GROUPS } from "../../data/event-categories";
import { TEMPLATES, templatesForCategory } from "../../data/templates";
import { planAllows } from "../../data/plan-limits";
import { useAuth } from "../../lib/auth-context";
import type { EventCategory } from "../../types/models";

const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  cream: "#FAF8F5",
  border: "#E7E1D8",
  muted: "#78716C",
  surface: "#F5F0E8",
  white: "#FFFFFF",
};

const STEPS = ["Event", "Details", "Template"];

type Details = Omit<NewEventInput, "category" | "templateId">;

const EMPTY_DETAILS: Details = {
  name: "",
  host: "",
  date: "",
  time: "",
  venueName: "",
  venueAddress: "",
  description: "",
  dressCode: "",
  contactDetails: "",
};

export default function CreateEventWizard() {
  const { createEvent } = useEvents();
  const { user } = useAuth();
  const navigate = useNavigate();
  const canUsePremium = planAllows(user?.plan, "premium_templates");
  // Arriving from "Use this template" (?template=<id>) pre-picks both the
  // template and its category; a premium template on a lower plan is
  // ignored rather than pre-selected into a choice the wizard would block.
  const [searchParams] = useSearchParams();
  const preset = TEMPLATES.find((t) => t.id === searchParams.get("template") && (!t.premium || canUsePremium));
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<EventCategory | null>(preset?.category ?? null);
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [templateId, setTemplateId] = useState<string | null>(preset?.id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canProceedFromStep1 = category !== null;
  const canProceedFromStep2 = details.name.trim() !== "" && details.date !== "" && details.venueName.trim() !== "";

  function field<K extends keyof Details>(key: K) {
    return {
      value: details[key] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDetails((d) => ({ ...d, [key]: e.target.value })),
    };
  }

  async function handleFinish() {
    if (!category) return;
    setSubmitting(true);
    setError("");
    try {
      // Drop a template left over from a different category (e.g. a
      // preset, then the organizer switched category on step 1).
      const chosen = templatesForCategory(category).some((t) => t.id === templateId) ? templateId : null;
      await createEvent({ ...details, category, templateId: chosen ?? undefined });
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the event. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-10">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{
                  backgroundColor: i <= step ? T.accent : T.surface,
                  color: i <= step ? T.white : T.muted,
                }}
              >
                {i + 1}
              </div>
              <span className="text-sm font-medium" style={{ color: i <= step ? T.charcoal : T.muted }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className="flex-1 h-px" style={{ backgroundColor: T.border }} />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ letterSpacing: "-0.025em" }}>What are you celebrating?</h1>
          <p className="text-sm mb-7" style={{ color: T.muted }}>Choose the category that best fits your event.</p>
          {EVENT_CATEGORY_GROUPS.map((group) => (
            <div key={group} className="mb-6">
              <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: T.muted }}>{group}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {EVENT_CATEGORIES.filter((c) => c.group === group).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className="p-4 rounded-xl text-left transition-all"
                    style={{
                      backgroundColor: category === c.id ? "rgba(28, 41, 66,0.1)" : T.white,
                      border: `1.5px solid ${category === c.id ? T.accent : T.border}`,
                      color: category === c.id ? T.accent : T.charcoal,
                    }}
                  >
                    <span className="text-sm font-medium">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {step === 1 && (
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ letterSpacing: "-0.025em" }}>Tell us about your event</h1>
          <p className="text-sm mb-7" style={{ color: T.muted }}>You can change these details later.</p>
          <div className="space-y-4">
            <input placeholder="Event name" {...field("name")} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ border: `1px solid ${T.border}`, backgroundColor: T.white }} />
            <input placeholder="Host name(s)" {...field("host")} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ border: `1px solid ${T.border}`, backgroundColor: T.white }} />
            <div className="grid grid-cols-2 gap-4">
              <input type="date" {...field("date")} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ border: `1px solid ${T.border}`, backgroundColor: T.white }} />
              <input type="time" {...field("time")} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ border: `1px solid ${T.border}`, backgroundColor: T.white }} />
            </div>
            <input placeholder="Venue name" {...field("venueName")} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ border: `1px solid ${T.border}`, backgroundColor: T.white }} />
            <input placeholder="Venue address" {...field("venueAddress")} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ border: `1px solid ${T.border}`, backgroundColor: T.white }} />
            <textarea placeholder="Description (optional)" {...field("description")} rows={3} className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none" style={{ border: `1px solid ${T.border}`, backgroundColor: T.white }} />
            <div className="grid grid-cols-2 gap-4">
              <input placeholder="Dress code (optional)" {...field("dressCode")} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ border: `1px solid ${T.border}`, backgroundColor: T.white }} />
              <input placeholder="Contact details (optional)" {...field("contactDetails")} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ border: `1px solid ${T.border}`, backgroundColor: T.white }} />
            </div>
          </div>
        </div>
      )}

      {step === 2 && category && (
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ letterSpacing: "-0.025em" }}>Pick a starting template</h1>
          <p className="text-sm mb-7" style={{ color: T.muted }}>
            You can customize everything once the invitation builder is ready.
            {!canUsePremium && " Premium templates: create your event, then upgrade it (from ₱199) and apply one from the builder's Design tab."}
          </p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {templatesForCategory(category).map((t) => {
              const locked = t.premium && !canUsePremium;
              return (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  disabled={locked}
                  className="group rounded-2xl overflow-hidden text-left transition-all disabled:cursor-not-allowed"
                  style={{ border: `2px solid ${templateId === t.id ? T.accent : T.border}`, opacity: locked ? 0.55 : 1 }}
                >
                  <div className="relative overflow-hidden" style={{ aspectRatio: "3/4" }}>
                    <img
                      src={`https://images.unsplash.com/${t.img}?w=400&h=533&fit=crop&auto=format`}
                      alt={t.name}
                      className="w-full h-full object-cover"
                    />
                    {t.premium && (
                      <span className="absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: T.accent, color: T.white }}>Premium</span>
                    )}
                  </div>
                  <div className="px-4 py-3" style={{ backgroundColor: T.white }}>
                    <div className="text-sm font-semibold">{t.name}</div>
                    {locked && <div className="text-xs mt-0.5" style={{ color: T.muted }}>Upgrade the event to use</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-xs mb-4" style={{ color: "#E55757" }}>{error}</p>}

      {/* Nav buttons */}
      <div className="flex items-center justify-between mt-10">
        <button
          onClick={() => (step === 0 ? navigate("/dashboard") : setStep((s) => s - 1))}
          className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-stone-100"
          style={{ border: `1px solid ${T.border}`, color: T.charcoal }}
        >
          {step === 0 ? "Cancel" : "Back"}
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={step === 0 ? !canProceedFromStep1 : !canProceedFromStep2}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: T.accent, color: T.white }}
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: T.accent, color: T.white }}
          >
            {submitting ? "Creating..." : "Create draft event"}
          </button>
        )}
      </div>
    </div>
  );
}
