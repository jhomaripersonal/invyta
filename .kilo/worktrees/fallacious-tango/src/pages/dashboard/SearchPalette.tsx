import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { EventRecord } from "../../lib/events-store";

const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  border: "#E7E1D8",
  muted: "#78716C",
  surface: "#F5F0E8",
  white: "#FFFFFF",
};

export interface SearchPage {
  id: string;
  label: string;
}

type Result =
  | { kind: "event"; key: string; label: string; sub: string; event: EventRecord }
  | { kind: "page"; key: string; label: string; sub: string; pageId: string }
  | { kind: "create"; key: string; label: string; sub: string };

// "⌘K" on Apple devices, "Ctrl K" everywhere else — the shortcut hint in
// the topbar should match the key the organizer actually presses.
export const SEARCH_SHORTCUT_LABEL = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";

// Jump-to palette for the dashboard: find an event by name (opens it in
// the builder), go to any dashboard page, or start a new event.
export default function SearchPalette({ events, pages, onOpenEvent, onOpenPage, onCreateEvent, onClose }: {
  events: EventRecord[];
  pages: SearchPage[];
  onOpenEvent: (event: EventRecord) => void;
  onOpenPage: (pageId: string) => void;
  onCreateEvent: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const results: Result[] = [
    ...events
      .filter((e) => matches(e.name) || matches(e.venueName ?? ""))
      .slice(0, 6)
      .map((e): Result => ({ kind: "event", key: `event-${e.id}`, label: e.name, sub: e.status === "published" ? "Event · Published" : "Event · Draft", event: e })),
    ...pages
      .filter((p) => matches(p.label))
      .map((p): Result => ({ kind: "page", key: `page-${p.id}`, label: p.label, sub: "Go to page", pageId: p.id })),
    ...(matches("create new event") ? [{ kind: "create", key: "create", label: "Create new event", sub: "Action" } as Result] : []),
  ];
  const safeActive = Math.min(active, Math.max(0, results.length - 1));

  function choose(r: Result) {
    onClose();
    if (r.kind === "event") onOpenEvent(r.event);
    else if (r.kind === "page") onOpenPage(r.pageId);
    else onCreateEvent();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[safeActive]) {
      e.preventDefault();
      choose(results[safeActive]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" style={{ backgroundColor: "rgba(28, 41, 66,0.45)" }} onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4" style={{ borderBottom: `1px solid ${T.border}` }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke={T.muted} strokeWidth="1.6" strokeLinecap="round">
            <circle cx="7.5" cy="7.5" r="4.5" />
            <path d="M10.5 10.5l3.5 3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search events and pages..."
            className="flex-1 py-3.5 text-sm outline-none bg-transparent"
            style={{ color: T.charcoal }}
          />
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: T.surface, color: T.muted }}>Esc</span>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: T.muted }}>No results for "{query}".</p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.key}
                onClick={() => choose(r)}
                onMouseEnter={() => setActive(i)}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left"
                style={{ backgroundColor: i === safeActive ? T.surface : "transparent" }}
              >
                <span className="text-sm font-medium truncate" style={{ color: T.charcoal }}>{r.label}</span>
                <span className="text-xs flex-shrink-0" style={{ color: T.muted }}>{r.sub}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
