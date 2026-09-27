// The RSVP section's settings, as stored in its content: an optional reply
// deadline and custom questions (Pro). The database reads the same
// `deadline` field (rsvp_deadline in supabase/add-guest-tools.sql) and
// closes RSVPs after it, so the invitation's "closed" state here is only
// for display.

export interface RsvpQuestion {
  id: string;
  label: string;
  // "text": a short free answer; "choice": one of `options`.
  type: "text" | "choice";
  options?: string[];
  required?: boolean;
}

export interface RsvpSettings {
  deadline: string | null;
  questions: RsvpQuestion[];
}

export const MAX_QUESTIONS = 5;
export const MAX_ANSWER_LENGTH = 300;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
}

const cleanList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean) : [];

export function rsvpSettings(content: Record<string, unknown>): RsvpSettings {
  const questions = Array.isArray(content.questions) ? content.questions : [];
  return {
    deadline: validDate(content.deadline),
    questions: questions
      .filter((q): q is Record<string, unknown> => !!q && typeof q === "object")
      .map((q) => ({
        id: typeof q.id === "string" ? q.id : "",
        label: typeof q.label === "string" ? q.label.trim() : "",
        type: q.type === "choice" ? ("choice" as const) : ("text" as const),
        options: cleanList(q.options),
        required: q.required === true,
      }))
      .filter((q) => q.id && q.label && (q.type === "text" || q.options.length > 0))
      .slice(0, MAX_QUESTIONS),
  };
}

// Today's date in the Philippines ("YYYY-MM-DD"), where the deadline is
// counted — the same rule as the database, whatever the guest's time zone.
export function philippineToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
}

// Open through the whole deadline day.
export function rsvpClosed(settings: RsvpSettings, now = new Date()): boolean {
  return !!settings.deadline && philippineToday(now) > settings.deadline;
}

export function formatDeadline(deadline: string): string {
  return new Date(`${deadline}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Keeps only answers to questions that exist, trimmed and length-capped.
export function cleanAnswers(questions: RsvpQuestion[], answers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of questions) {
    const a = (answers[q.id] ?? "").trim().slice(0, MAX_ANSWER_LENGTH);
    if (!a) continue;
    if (q.type === "choice" && !q.options?.includes(a)) continue;
    out[q.id] = a;
  }
  return out;
}
