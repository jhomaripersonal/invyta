import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useEvents, type EventRecord } from "../../lib/events-store";
import { useGuests, type GuestRecord } from "../../lib/guests-store";
import { GUEST_QR_PREFIX } from "../../lib/guest-qr";
import { Icon } from "../../components/Icon";
import UpgradeNotice from "../../components/UpgradeNotice";
import { planAllows, requiredPlanLabel } from "../../data/plan-limits";
import { T } from "../../lib/tokens";
import { useSelectedEvent } from "../../lib/use-selected-event";

const SCANNER_REGION_ID = "invyta-qr-scanner-region";

// getUserMedia (which html5-qrcode calls under the hood) throws a
// DOMException whose `.name` identifies the failure — surfacing that
// instead of the raw error message is the difference between "Permission
// denied" (cryptic) and telling the organizer exactly what to do about it.
function describeScanError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : undefined;
  switch (name) {
    case "NotAllowedError":
      return "Camera permission was denied. Check your browser's site settings and allow camera access, then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No usable camera was found on this device. Use search below instead.";
    case "NotReadableError":
      return "The camera is already in use by another app. Close it and try again.";
    default:
      return err instanceof Error ? err.message : "Couldn't access the camera. Use search below instead.";
  }
}

function EmptyEventsHint() {
  return (
    <div className="flex flex-col items-center text-center py-16 rounded-2xl" style={{ backgroundColor: T.white, border: `1px dashed ${T.border}` }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: T.surface }}>
        <Icon name="inbox" size={20} color={T.muted} />
      </div>
      <h3 className="font-semibold mb-1">No events yet</h3>
      <p className="text-sm" style={{ color: T.muted }}>Create and publish an event to start checking in guests.</p>
    </div>
  );
}

export function CheckinView({ onUpgrade }: { onUpgrade: (event?: EventRecord) => void }) {
  const { events, isLoading: eventsLoading } = useEvents();
  const { guestsForEvent, checkInGuest, undoCheckIn } = useGuests();
  const [selectedEventId, setSelectedEventId] = useSelectedEvent(events);
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedGuest, setSelectedGuest] = useState<GuestRecord | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const guestsRef = useRef<GuestRecord[]>([]);

  useEffect(() => {
    guestsRef.current = guests;
  }, [guests]);

  async function reloadGuests() {
    if (!selectedEventId) return;
    setLoading(true);
    const g = await guestsForEvent(selectedEventId);
    setGuests(g);
    setLoading(false);
  }

  useEffect(() => {
    stopScanning();
    setSelectedGuest(null);
    setSearch("");
    if (!selectedEventId) {
      setGuests([]);
      setLoading(false);
      return;
    }
    reloadGuests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  useEffect(() => () => { stopScanning(); }, []);

  function handleScanSuccess(decodedText: string) {
    if (!decodedText.startsWith(GUEST_QR_PREFIX)) return;
    const guestId = decodedText.slice(GUEST_QR_PREFIX.length);
    const found = guestsRef.current.find((g) => g.id === guestId);
    if (!found) {
      setScanError("This QR code doesn't match a guest for this event.");
      return;
    }
    setScanError("");
    setSelectedGuest(found);
    stopScanning();
  }

  async function startScanning() {
    setScanError("");
    setSelectedGuest(null);

    // Mobile browsers block getUserMedia entirely on any origin that isn't
    // https: or literally "localhost" — including a LAN IP like
    // http://192.168.x.x:8443 during local dev. That failure mode shows no
    // permission prompt at all and (depending on the browser) not even an
    // exception, so it's worth catching explicitly with a message that
    // actually explains what's wrong, instead of a silent no-op or a raw
    // "Cannot read properties of undefined" from deep inside the library.
    if (!window.isSecureContext) {
      setScanError("Camera access needs a secure connection. Open this page's https:// link (not a local IP address) to scan.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError("This browser doesn't support camera access. Use search below instead.");
      return;
    }

    // Flip this before start() resolves (not after) so the target div
    // already has its "scanning" size — and the placeholder icon overlay
    // is already gone — the moment html5-qrcode starts inserting its own
    // video element, instead of mid-way through that async camera setup.
    setScanning(true);
    try {
      const scanner = new Html5Qrcode(SCANNER_REGION_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 220 },
        handleScanSuccess,
        () => {} // per-frame "no code found yet" — expected while aiming the camera
      );
    } catch (err) {
      setScanError(describeScanError(err));
      setScanning(false);
      scannerRef.current = null;
    }
  }

  function stopScanning() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    }
    setScanning(false);
  }

  async function handleCheckIn(guest: GuestRecord) {
    setBusy(true);
    try {
      await checkInGuest(guest.id);
      setConfirmMessage(`✓ ${guest.name} checked in`);
      await reloadGuests();
      setSelectedGuest(null);
      setSearch("");
      setTimeout(() => setConfirmMessage(""), 3500);
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo(guest: GuestRecord) {
    setBusy(true);
    try {
      await undoCheckIn(guest.id);
      await reloadGuests();
      setSelectedGuest(null);
    } finally {
      setBusy(false);
    }
  }

  if (!eventsLoading && events.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" style={{ letterSpacing: "-0.025em" }}>Check-in</h1>
        <EmptyEventsHint />
      </div>
    );
  }

  const checkedInCount = guests.filter((g) => g.checkedIn).length;
  const pct = guests.length > 0 ? Math.round((checkedInCount / guests.length) * 100) : 0;
  const searchResults = search.trim()
    ? guests.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : [];
  const recentCheckins = guests
    .filter((g) => g.checkedIn && g.checkedInAt)
    .sort((a, b) => (b.checkedInAt ?? "").localeCompare(a.checkedInAt ?? ""))
    .slice(0, 6);

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: "-0.025em" }}>Check-in</h1>
        <select
          value={selectedEventId ?? ""}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ border: `1px solid ${T.border}`, backgroundColor: T.white, color: T.charcoal }}
        >
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
    </div>
  );

  // Plans are per event: check-in is locked only for events that aren't
  // upgraded, and the picker stays so an upgraded event can be chosen.
  const selectedEvent = events.find((e) => e.id === selectedEventId);
  if (selectedEvent && !planAllows(selectedEvent.ownerPlan, "checkin")) {
    return (
      <div className="max-w-4xl mx-auto">
        {header}
        <UpgradeNotice
          planName={requiredPlanLabel("checkin")}
          title="QR check-in is a Premium feature"
          body="Upgrade this event to give every confirmed guest a QR code and check them in at the door by scanning it or searching their name."
          onUpgrade={() => onUpgrade(selectedEvent)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {header}

      {/* Progress */}
      <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold" style={{ color: T.charcoal }}>
            {loading ? "Loading..." : `${checkedInCount} / ${guests.length} guests checked in`}
          </span>
          <span className="text-xs font-semibold" style={{ color: T.accent }}>{pct}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: T.surface }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: T.accent, transition: "width 0.4s ease" }} />
        </div>
      </div>

      {confirmMessage && (
        <div className="rounded-xl px-4 py-3 mb-6 text-sm font-semibold text-center" style={{ backgroundColor: "rgba(76,175,125,0.1)", color: T.green }}>
          {confirmMessage}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5 mb-6">
        {/* Scanner */}
        <div className="rounded-2xl p-5" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: T.charcoal }}>Scan Guest QR Code</h3>
          <div
            className="relative rounded-xl overflow-hidden mb-3"
            style={{ backgroundColor: T.surface, minHeight: scanning ? undefined : 180, aspectRatio: scanning ? "1/1" : undefined }}
          >
            {/* html5-qrcode inserts/removes its own <video>/<canvas> elements
                directly into this node on start()/clear() — it must never
                have React-rendered children of its own, or React's next
                re-render (e.g. the `scanning` toggle right below) reconciles
                against DOM nodes it doesn't recognize and either fights the
                library for control of them or throws trying to remove a
                child it never rendered. The placeholder icon lives in a
                separate sibling instead. */}
            <div id={SCANNER_REGION_ID} className="w-full h-full" />
            {!scanning && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Icon name="camera" size={28} color={T.muted} />
              </div>
            )}
          </div>
          {scanError && (
            <p className="text-xs leading-relaxed mb-3 px-3 py-2.5 rounded-lg" style={{ color: T.red, backgroundColor: "rgba(229,87,87,0.1)" }}>
              {scanError}
            </p>
          )}
          <button
            onClick={scanning ? stopScanning : startScanning}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{ backgroundColor: scanning ? T.surface : T.accent, color: scanning ? T.charcoal : T.white, border: scanning ? `1px solid ${T.border}` : "none" }}
          >
            {scanning ? "Stop scanning" : "Start scanning"}
          </button>
        </div>

        {/* Search */}
        <div className="rounded-2xl p-5" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: T.charcoal }}>Search guest name</h3>
          <input
            placeholder="Type a name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedGuest(null); }}
            className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none mb-3"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.charcoal }}
          />
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {searchResults.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGuest(g)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left hover:bg-stone-50"
                style={{ border: `1px solid ${T.border}` }}
              >
                <span className="text-sm" style={{ color: T.charcoal }}>{g.name}</span>
                {g.checkedIn && <span className="text-[10px] font-semibold" style={{ color: T.green }}>✓ In</span>}
              </button>
            ))}
            {search.trim() && searchResults.length === 0 && (
              <p className="text-xs" style={{ color: T.muted }}>No guests match "{search}".</p>
            )}
          </div>
        </div>
      </div>

      {/* Selected guest result */}
      {selectedGuest && (
        <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: T.white, border: `2px solid ${T.accent}` }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: T.accent }}>
              {selectedGuest.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: T.charcoal }}>{selectedGuest.name}</div>
              <div className="text-xs" style={{ color: T.muted }}>
                {selectedGuest.rsvpStatus === "confirmed" ? "Confirmed" : selectedGuest.rsvpStatus === "pending" ? "Pending" : "Declined"}
                {selectedGuest.numberOfGuests > 0 ? ` · ${selectedGuest.numberOfGuests} guest(s)` : ""}
              </div>
            </div>
          </div>
          {selectedGuest.checkedIn ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold" style={{ color: T.green }}>✓ Already checked in</span>
              <button onClick={() => handleUndo(selectedGuest)} disabled={busy} className="text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-60" style={{ border: `1px solid ${T.border}`, color: T.charcoal }}>
                Undo
              </button>
            </div>
          ) : (
            <button onClick={() => handleCheckIn(selectedGuest)} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: T.accent, color: T.white }}>
              {busy ? "Checking in..." : "Check In"}
            </button>
          )}
        </div>
      )}

      {/* Recent check-ins */}
      {recentCheckins.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3" style={{ color: T.charcoal }}>Recently checked in</h3>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
            {recentCheckins.map((g, i) => (
              <div
                key={g.id}
                className="group relative flex items-center justify-between px-4 py-3 transition-colors hover:bg-[rgba(28, 41, 66,0.04)]"
                style={{ borderBottom: i < recentCheckins.length - 1 ? `1px solid ${T.border}` : undefined }}
              >
                <span className="absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: T.accent }} />
                <span className="text-sm" style={{ color: T.charcoal }}>{g.name}</span>
                <span className="text-xs" style={{ color: T.muted }}>{g.checkedInAt ? new Date(g.checkedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
