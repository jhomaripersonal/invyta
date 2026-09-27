// "Add to calendar" for guests: a Google Calendar link and a .ics file
// (Apple Calendar, Outlook, and most phone calendars).
//
// Event dates and times are stored as Philippine local time without a
// zone, so they're converted to UTC here (the Philippines is UTC+8 all
// year, no daylight saving) — a guest abroad gets the right local time.
// No end time is stored, so events are given a default length.

export interface CalendarEvent {
  title: string;
  date: string; // "YYYY-MM-DD"
  time?: string; // "HH:MM" (24h); all-day when missing
  location?: string;
  description?: string;
  url?: string;
}

export const DEFAULT_DURATION_HOURS = 4;

const pad = (n: number) => String(n).padStart(2, "0");
const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const dayStamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

type Span = { allDay: true; start: string; end: string } | { allDay: false; start: string; end: string };

function span(event: CalendarEvent): Span | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) return null;
  const [y, m, d] = event.date.split("-").map(Number);
  const time = /^\d{2}:\d{2}/.test(event.time ?? "") ? event.time! : null;
  if (!time) {
    const start = new Date(Date.UTC(y, m - 1, d));
    const end = new Date(Date.UTC(y, m - 1, d + 1));
    return { allDay: true, start: dayStamp(start), end: dayStamp(end) };
  }
  const [hh, mm] = time.split(":").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, hh - 8, mm));
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + DEFAULT_DURATION_HOURS * 3600e3);
  return { allDay: false, start: utcStamp(start), end: utcStamp(end) };
}

export function canAddToCalendar(event: CalendarEvent): boolean {
  return span(event) !== null;
}

export function googleCalendarUrl(event: CalendarEvent): string | null {
  const s = span(event);
  if (!s) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${s.start}/${s.end}`,
  });
  if (event.location) params.set("location", event.location);
  const details = [event.description, event.url].filter(Boolean).join("\n\n");
  if (details) params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// RFC 5545 text escaping, then line folding at 75 octets.
const escapeText = (v: string) => v.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function icsFile(event: CalendarEvent, uid: string, now = new Date()): string | null {
  const s = span(event);
  if (!s) return null;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Invyta//Invitation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@invyta`,
    `DTSTAMP:${utcStamp(now)}`,
    s.allDay ? `DTSTART;VALUE=DATE:${s.start}` : `DTSTART:${s.start}`,
    s.allDay ? `DTEND;VALUE=DATE:${s.end}` : `DTEND:${s.end}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
