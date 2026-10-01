import { useSearchParams } from "react-router-dom";
import type { EventRecord } from "./events-store";

// The event a per-event dashboard view (Guests, Check-in, Analytics) is
// showing, kept in the URL as ?event=<id> — so "Manage guests" on an event
// lands on that event, a refresh keeps it, and the link can be shared.
// With no (or an unknown) id it falls back to the first event.
export function useSelectedEvent(events: EventRecord[]): [string | null, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get("event");
  const selectedId = events.some((e) => e.id === requested) ? requested : events[0]?.id ?? null;

  function select(id: string) {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("event", id);
        return next;
      },
      { replace: true },
    );
  }

  return [selectedId, select];
}
