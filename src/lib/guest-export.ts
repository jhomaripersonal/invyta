// Guest list → CSV, for the caterer, venue or coordinator. Opens cleanly in
// Excel (UTF-8 BOM, CRLF) and Google Sheets. Cells a spreadsheet would run
// as a formula (starting with = + - @, tab or CR) are prefixed with an
// apostrophe, so a guest-typed name or message can't execute anything.

import type { RsvpQuestion } from "./rsvp-settings";

export interface ExportGuest {
  name: string;
  email?: string;
  phone?: string;
  group?: string;
  rsvpStatus: "confirmed" | "declined" | "pending";
  numberOfGuests: number;
  mealPreference?: string;
  message?: string;
  notes?: string;
  checkedIn: boolean;
  submittedAt?: string;
  answers?: Record<string, string>;
}

const STATUS_LABEL = { confirmed: "Confirmed", declined: "Declined", pending: "Pending" } as const;

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// The RSVP form no longer asks for a meal preference, so the Meal column
// only appears when some guest has one from an earlier RSVP.
export function guestsToCsv(guests: ExportGuest[], questions: RsvpQuestion[] = []): string {
  const withMeal = guests.some((g) => g.mealPreference);
  const header = ["Name", "RSVP", "Party size", "Group", "Email", "Phone", ...(withMeal ? ["Meal"] : []), "Message", "Notes", "Checked in", "Responded", ...questions.map((q) => q.label)];
  const rows = guests.map((g) => [
    g.name,
    STATUS_LABEL[g.rsvpStatus],
    g.rsvpStatus === "declined" ? 0 : g.numberOfGuests,
    g.group,
    g.email,
    g.phone,
    ...(withMeal ? [g.mealPreference] : []),
    g.message,
    g.notes,
    g.checkedIn ? "Yes" : "No",
    g.rsvpStatus === "pending" || !g.submittedAt ? "" : g.submittedAt.slice(0, 10),
    ...questions.map((q) => g.answers?.[q.id]),
  ]);
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function exportFileName(eventName: string, now = new Date()): string {
  const slug = eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "event";
  return `${slug}-guests-${now.toISOString().slice(0, 10)}.csv`;
}
