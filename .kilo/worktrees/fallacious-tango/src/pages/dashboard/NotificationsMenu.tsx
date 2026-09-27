import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth-context";
import { useGuests, type RecentResponse } from "../../lib/guests-store";

const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  border: "#E7E1D8",
  muted: "#78716C",
  surface: "#F5F0E8",
  white: "#FFFFFF",
  green: "#4CAF7D",
  red: "#E55757",
};

// When this organizer last opened the bell, per browser. Only decides
// whether the unread dot shows, so a blocked or cleared localStorage just
// means the dot shows until the menu is opened — never lost data.
function seenKey(userId: string) {
  return `invyta:notifications-seen:${userId}`;
}

function readSeen(userId: string): string {
  try {
    return localStorage.getItem(seenKey(userId)) ?? "";
  } catch {
    return "";
  }
}

function writeSeen(userId: string, iso: string) {
  try {
    localStorage.setItem(seenKey(userId), iso);
  } catch {
    // storage unavailable (private window, blocked site data) — dot just reappears next visit
  }
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// The topbar bell: the latest guest RSVP responses across the organizer's
// events, with an unread dot when something arrived since it was last opened.
export default function NotificationsMenu({ onOpenGuests }: { onOpenGuests: () => void }) {
  const { user } = useAuth();
  const { recentResponses } = useGuests();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecentResponse[] | null>(null);
  const [seen, setSeen] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  async function load() {
    setItems(await recentResponses(10));
  }

  useEffect(() => {
    if (!user) return;
    setSeen(readSeen(user.id));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hasUnread = !!items?.some((i) => i.submittedAt > seen);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      load();
      if (user && items && items.length > 0) {
        writeSeen(user.id, items[0].submittedAt);
      }
    } else if (items && items.length > 0) {
      setSeen(items[0].submittedAt);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={toggle}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-stone-100 transition-colors"
      >
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 2a5.5 5.5 0 0 1 5.5 5.5c0 2.5.5 4 1.5 5h-14c1-1 1.5-2.5 1.5-5A5.5 5.5 0 0 1 9 2z" />
          <path d="M7 15a2 2 0 0 0 4 0" />
        </svg>
        {hasUnread && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ backgroundColor: T.red }} />}
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl overflow-hidden shadow-lg"
          style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}
        >
          <div className="px-4 py-3 text-sm font-semibold" style={{ borderBottom: `1px solid ${T.border}`, color: T.charcoal }}>
            RSVP activity
          </div>
          {items === null ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: T.muted }}>Loading...</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: T.muted }}>No RSVPs yet. Responses from your guests will show up here.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {items.map((item) => {
                const isNew = item.submittedAt > seen;
                const attending = item.rsvpStatus === "confirmed";
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setOpen(false);
                      if (items.length > 0) setSeen(items[0].submittedAt);
                      onOpenGuests();
                    }}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-stone-50 transition-colors"
                    style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: isNew ? "rgba(28, 41, 66,0.04)" : undefined }}
                  >
                    <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: attending ? T.green : T.red }} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm" style={{ color: T.charcoal }}>
                        <span className="font-semibold">{item.name}</span>{" "}
                        {attending ? `is attending${item.numberOfGuests > 1 ? ` (${item.numberOfGuests} guests)` : ""}` : "can't make it"}
                      </span>
                      <span className="block text-xs truncate mt-0.5" style={{ color: T.muted }}>
                        {item.eventName} · {timeAgo(item.submittedAt)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
