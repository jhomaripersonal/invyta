import { useState } from "react";
import type { EventRecord } from "../../lib/events-store";
import { canAddToCalendar, googleCalendarUrl, icsFile, type CalendarEvent } from "../../lib/calendar";
import type { ResolvedTheme } from "./theme";
import { buttonRadiusClass } from "./theme";

function calendarEvent(event: EventRecord): CalendarEvent {
  return {
    title: event.name,
    date: event.date,
    time: event.time || undefined,
    location: [event.venueName, event.venueAddress].filter(Boolean).join(", ") || undefined,
    url: `${window.location.origin}/i/${event.slug}`,
  };
}

// A small "Add to calendar" button that opens a choice of Google Calendar
// or a .ics download (Apple Calendar, Outlook, most phones).
export default function AddToCalendar({ event, theme }: { event: EventRecord; theme: ResolvedTheme }) {
  const [open, setOpen] = useState(false);
  const cal = calendarEvent(event);
  if (!canAddToCalendar(cal)) return null;

  function downloadIcs() {
    const ics = icsFile(cal, event.id);
    if (!ics) return;
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.slug || "invitation"}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setOpen(false);
  }

  const radius = buttonRadiusClass(theme.buttonStyle);
  const outline = { color: theme.palette.primary, border: `1px solid ${theme.palette.primary}66`, backgroundColor: "transparent" };

  return (
    <div className="flex flex-col items-center gap-2 mt-5">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={`px-4 py-2 text-xs font-semibold ${radius}`} style={outline} aria-expanded={false}>
          Add to calendar
        </button>
      ) : (
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Add to calendar">
          <a href={googleCalendarUrl(cal) ?? "#"} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={`px-4 py-2 text-xs font-semibold ${radius}`} style={outline}>
            Google Calendar
          </a>
          <button type="button" onClick={downloadIcs} className={`px-4 py-2 text-xs font-semibold ${radius}`} style={outline}>
            Apple / Outlook (.ics)
          </button>
        </div>
      )}
    </div>
  );
}
