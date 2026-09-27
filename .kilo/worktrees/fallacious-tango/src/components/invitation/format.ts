import type { EventRecord } from "../../lib/events-store";
import { EVENT_CATEGORIES } from "../../data/event-categories";

export function categoryLabel(category: EventRecord["category"]): string {
  return EVENT_CATEGORIES.find((c) => c.id === category)?.label ?? category;
}

export function eventDateTime(event: EventRecord): Date {
  return new Date(`${event.date}T${event.time || "00:00"}:00`);
}

export function formatLongDate(event: EventRecord): string {
  const d = eventDateTime(event);
  if (Number.isNaN(d.getTime())) return "Date to be announced";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function formatTime(event: EventRecord): string | null {
  if (!event.time) return null;
  const d = eventDateTime(event);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
