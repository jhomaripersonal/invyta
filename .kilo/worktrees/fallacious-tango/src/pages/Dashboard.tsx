import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import webAppLogo from "../assets/webApp-logo-mark.png";
import { useAuth } from "../lib/auth-context";
import { useEvents, type EventRecord } from "../lib/events-store";
import { useGuests, type GuestRecord } from "../lib/guests-store";
import { EVENT_CATEGORIES } from "../data/event-categories";
import { TEMPLATES as CATALOG_TEMPLATES } from "../data/templates";
import { GuestFormModal, GROUP_LABELS, type GuestFormValues } from "./dashboard/GuestFormModal";
import { GuestQrModal } from "./dashboard/GuestQrModal";
import { CheckinView } from "./dashboard/CheckinView";
import NotificationsMenu from "./dashboard/NotificationsMenu";
import SearchPalette, { SEARCH_SHORTCUT_LABEL } from "./dashboard/SearchPalette";
import SettingsView from "./dashboard/SettingsView";
import ImportGuestsModal from "./dashboard/ImportGuestsModal";
import UpgradeEventModal from "./dashboard/UpgradeEventModal";
import { listPayments, paymentMethodLabel } from "../lib/payments";
import { PLAN_FEATURES, formatPeso, upgradePriceCentavos } from "../data/pricing";
import type { Payment } from "../types/models";
import UpgradeNotice from "../components/UpgradeNotice";
import TemplatePreviewModal from "../components/invitation/TemplatePreviewModal";
import { guestLimit, planAllows, planLabel, requiredPlanLabel, type PlanFeature } from "../data/plan-limits";

type NavTarget = "landing" | "dashboard" | "login";
type View = "home" | "events" | "templates" | "analytics" | "billing" | "guests" | "checkin" | "settings";

// ─── Design tokens ────────────────────────────────────────────────────────
const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  cream: "#FAF8F5",
  border: "#E7E1D8",
  muted: "#78716C",
  surface: "#F5F0E8",
  white: "#FFFFFF",
  green: "#4CAF7D",
  red: "#E55757",
};

// ─── SVG Icon set ─────────────────────────────────────────────────────────
function Icon({ name, size = 18, color = "currentColor" }: { name: string; size?: number; color?: string }) {
  const icons: Record<string, React.ReactElement> = {
    grid: <><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="10" y="2" width="6" height="6" rx="1"/><rect x="2" y="10" width="6" height="6" rx="1"/><rect x="10" y="10" width="6" height="6" rx="1"/></>,
    calendar: <><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 7h14M7 3v2M13 3v2"/></>,
    layout: <><rect x="2" y="2" width="16" height="16" rx="2"/><path d="M2 7h16M7 7v11"/></>,
    users: <><circle cx="7" cy="7" r="3"/><path d="M2 17c0-3 2-5 5-5"/><circle cx="13" cy="7" r="3"/><path d="M20 17c0-3-2-5-5-5"/><path d="M10 12c-3 0-6 2-6 5h12c0-3-3-5-6-5z"/></>,
    chart: <><path d="M3 16l4-4 4 3 4-6 4 3"/><path d="M3 3v14h14"/></>,
    credit: <><rect x="2" y="4" width="16" height="12" rx="2"/><path d="M2 9h16"/></>,
    bell: <><path d="M9 2a5.5 5.5 0 0 1 5.5 5.5c0 2.5.5 4 1.5 5h-14c1-1 1.5-2.5 1.5-5A5.5 5.5 0 0 1 9 2z"/><path d="M7 15a2 2 0 0 0 4 0"/></>,
    search: <><circle cx="7.5" cy="7.5" r="4.5"/><path d="M10.5 10.5l3.5 3.5"/></>,
    plus: <><path d="M9 4v10M4 9h10"/></>,
    chevronRight: <path d="M7 4l4 4-4 4"/>,
    check: <path d="M3 8l4 4 7-7"/>,
    eye: <><path d="M9 3C5 3 2 9 2 9s3 6 7 6 7-6 7-6S13 3 9 3z"/><circle cx="9" cy="9" r="2"/></>,
    share: <><path d="M15 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/><path d="M3 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/><path d="M15 16a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/><path d="M6 10.5L12 7M6 13.5L12 17"/></>,
    settings: <><circle cx="9" cy="9" r="3"/><path d="M9 1v2M9 15v2M2.05 5.05l1.41 1.41M14.54 12.54l1.41 1.41M1 9h2M15 9h2M2.05 12.95l1.41-1.41M14.54 5.46l1.41-1.41"/></>,
    menu: <><path d="M3 5h12M3 9h12M3 13h12"/></>,
    x: <path d="M4 4l10 10M14 4L4 14"/>,
    arrowUp: <path d="M9 15V3M4 8l5-5 5 5"/>,
    home: <><path d="M2 9L9 3l7 6v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9z"/><path d="M6 17V9h6v8"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────
function Badge({ label, variant }: { label: string; variant: "green" | "gold" | "muted" | "red" }) {
  const color = { green: T.green, gold: T.accent, muted: T.muted, red: T.red }[variant];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────
function StatCard({ label, value, delta, accent = "gold" }: { label: string; value: string; delta?: string; accent?: "gold" | "green" }) {
  const accentColor = accent === "green" ? T.green : T.accent;
  return (
    <div className="p-5" style={{ backgroundColor: T.white, borderRadius: 14, borderLeft: `3px solid ${accentColor}`, boxShadow: "0 1px 2px rgba(28, 41, 66,0.05)" }}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: T.muted }}>{label}</span>
        {delta && (
          <span className="flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: T.green }}>
            <Icon name="arrowUp" size={9} color={T.green} />{delta}
          </span>
        )}
      </div>
      <div className="text-3xl font-bold" style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.01em", color: T.charcoal }}>{value}</div>
    </div>
  );
}

// ─── Sample data ──────────────────────────────────────────────────────────
function formatEventDate(iso: string): string {
  if (!iso) return "Date TBD";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function categoryLabel(category: EventRecord["category"]): string {
  return EVENT_CATEGORIES.find((c) => c.id === category)?.label ?? category;
}

// ─── Main layout ──────────────────────────────────────────────────────────
export default function Dashboard({ onNav }: { onNav: (p: NavTarget) => void }) {
  const [view, setView] = useState<View>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { user, logout } = useAuth();
  const { events, isLoading: eventsLoading } = useEvents();
  const navigate = useNavigate();
  const displayName = user?.name ?? "";
  const initials = displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const goToBilling = () => setView("billing");
  // Feature gates offer to upgrade the specific event they're about; with
  // no event in context, send the organizer to Billing.
  const [upgradeEvent, setUpgradeEvent] = useState<EventRecord | null>(null);
  const openUpgrade = (event?: EventRecord) => (event ? setUpgradeEvent(event) : goToBilling());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleLogout() {
    // Don't also navigate() here — ProtectedRoute already redirects to
    // /login the instant user becomes null, and racing an explicit
    // navigate("/") against that reactive redirect is nondeterministic.
    logout();
  }

  const navItems: { id: View; label: string; icon: string; feature?: PlanFeature }[] = [
    { id: "home", label: "Dashboard", icon: "grid" },
    { id: "events", label: "Events", icon: "calendar" },
    { id: "guests", label: "Guests", icon: "users" },
    { id: "checkin", label: "Check-in", icon: "check", feature: "checkin" },
    { id: "templates", label: "Templates", icon: "layout" },
    { id: "analytics", label: "Analytics", icon: "chart", feature: "analytics" },
    { id: "billing", label: "Billing", icon: "credit" },
  ];

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: T.cream, fontFamily: "var(--font-sans)" }}>

      {/* ── SIDEBAR ─────────────────────────────────────────────── */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50 w-64 flex flex-col
          transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        style={{ backgroundColor: T.white, borderRight: `1px solid ${T.border}` }}
      >
        {/* Logo */}
        <div className="h-16 px-5 flex items-center" style={{ borderBottom: `1px solid ${T.border}` }}>
          <img src={webAppLogo} alt="Invyta" className="h-9 w-auto" />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setView(item.id); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all text-left group"
                style={{
                  backgroundColor: active ? T.surface : "transparent",
                  color: active ? T.charcoal : T.muted,
                  fontWeight: active ? "600" : "500",
                }}
              >
                <Icon name={item.icon} size={16} color={active ? T.accent : T.muted} />
                <span>{item.label}</span>
                {item.id === "events" && (
                  <span className="ml-auto text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: T.surface, color: T.muted }}>{events.length}</span>
                )}
                {item.feature && !events.some((e) => planAllows(e.ownerPlan, item.feature!)) && (
                  <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: T.surface, color: T.muted }}>{requiredPlanLabel(item.feature)}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Create event CTA */}
        <div className="px-3 pb-3">
          <button
            onClick={() => navigate("/dashboard/events/new")}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{ backgroundColor: T.accent, color: T.white }}
          >
            <Icon name="plus" size={15} color={T.white} />
            Create Event
          </button>
        </div>

        {/* User */}
        <div className="p-3 pt-0" style={{ borderTop: `1px solid ${T.border}`, paddingTop: "12px" }}>
          <button onClick={() => { setView("settings"); setSidebarOpen(false); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 transition-colors text-left" aria-label="Account settings">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: T.accent }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{displayName}</div>
              {/* Plans are per event; only an account-wide plan (e.g. Event
                  Planner) is worth showing on the account itself. */}
              {user?.plan && user.plan !== "free" && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: T.surface, color: T.muted }}>{planLabel(user.plan)}</span>
                </div>
              )}
            </div>
            <Icon name="settings" size={14} color={T.muted} />
          </button>
          <div className="flex mt-1 gap-1">
            <button onClick={() => onNav("landing")} className="flex-1 text-xs text-center py-1.5 rounded-lg hover:bg-stone-50 transition-colors" style={{ color: T.muted }}>
              ← Homepage
            </button>
            <button onClick={handleLogout} className="flex-1 text-xs text-center py-1.5 rounded-lg hover:bg-stone-50 transition-colors" style={{ color: T.muted }}>
              Log out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/25 md:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}

      {/* ── MAIN ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="h-16 flex items-center justify-between px-5 md:px-7 flex-shrink-0" style={{ backgroundColor: T.white, borderBottom: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-stone-100 transition-colors">
              <Icon name="menu" size={18} />
            </button>
            {/* Breadcrumb */}
            <div className="hidden md:flex items-center gap-2 text-sm" style={{ color: T.muted }}>
              <span className="font-medium" style={{ color: T.charcoal }}>
                {view === "settings" ? "Settings" : navItems.find((n) => n.id === view)?.label ?? "Dashboard"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Search */}
            <button onClick={() => setSearchOpen(true)} className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors hover:bg-stone-100" style={{ color: T.muted, border: `1px solid ${T.border}` }}>
              <Icon name="search" size={14} color={T.muted} />
              <span>Search...</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: T.surface, color: T.muted }}>{SEARCH_SHORTCUT_LABEL}</span>
            </button>

            {/* Search (mobile — the labelled search box above is desktop-only) */}
            <button onClick={() => setSearchOpen(true)} className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-stone-100 transition-colors" aria-label="Search">
              <Icon name="search" size={17} />
            </button>

            {/* Notifications */}
            <NotificationsMenu onOpenGuests={() => setView("guests")} />

            {/* Avatar */}
            <button onClick={() => setView("settings")} className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: T.accent }} aria-label="Account settings">
              {initials}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-5 md:px-8 py-7">
            {view === "home" && <HomeView setView={setView} firstName={displayName.split(" ")[0] || "there"} events={events} isLoading={eventsLoading} />}
            {view === "events" && <EventsView />}
            {view === "guests" && <GuestsView onUpgrade={openUpgrade} />}
            {view === "checkin" && <CheckinView onUpgrade={openUpgrade} />}
            {view === "templates" && <TemplatesView onUpgrade={goToBilling} />}
            {view === "analytics" && <AnalyticsView onUpgrade={openUpgrade} />}
            {view === "billing" && <BillingView />}
            {view === "settings" && <SettingsView onOpenBilling={goToBilling} />}
          </div>
        </main>
      </div>

      {upgradeEvent && <UpgradeEventModal event={upgradeEvent} onClose={() => setUpgradeEvent(null)} />}

      {searchOpen && (
        <SearchPalette
          events={events}
          pages={navItems.map((n) => ({ id: n.id, label: n.label })).concat({ id: "settings", label: "Settings" })}
          onOpenEvent={(e) => navigate(`/dashboard/events/${e.id}/builder`)}
          onOpenPage={(id) => setView(id as View)}
          onCreateEvent={() => navigate("/dashboard/events/new")}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function HomeView({ setView, firstName, events, isLoading }: { setView: (v: View) => void; firstName: string; events: EventRecord[]; isLoading: boolean }) {
  const navigate = useNavigate();
  const totalGuests = events.reduce((sum, e) => sum + e.guestCount, 0);
  const confirmed = events.reduce((sum, e) => sum + e.confirmedGuestCount, 0);
  const pending = events.reduce((sum, e) => sum + e.pendingGuestCount, 0);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1" style={{ letterSpacing: "-0.025em" }}>
            {greeting()}, <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: T.accent }}>{firstName}</span>
          </h1>
          <p className="text-sm" style={{ color: T.muted }}>Here's what's happening with your events today.</p>
        </div>
        <button
          onClick={() => navigate("/dashboard/events/new")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 flex-shrink-0"
          style={{ backgroundColor: T.accent, color: T.white }}
        >
          <Icon name="plus" size={15} color={T.white} />
          Create Event
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Events" value={String(events.length)} />
        <StatCard label="Total Guests" value={String(totalGuests)} />
        <StatCard label="Confirmed RSVPs" value={String(confirmed)} accent="green" />
        <StatCard label="Pending RSVPs" value={String(pending)} />
      </div>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        {[
          { label: "Manage events", sub: "View and edit your events", onClick: () => setView("events") },
          { label: "Guest list", sub: "Add guests, track RSVPs", onClick: () => setView("guests") },
          { label: "Analytics", sub: "See how your invites perform", onClick: () => setView("analytics") },
        ].map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className="flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all hover:shadow-sm group"
            style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}
          >
            <div>
              <div className="text-sm font-semibold" style={{ color: T.charcoal }}>{a.label}</div>
              <div className="text-xs mt-0.5" style={{ color: T.muted }}>{a.sub}</div>
            </div>
            <span className="transition-transform group-hover:translate-x-0.5 flex-shrink-0">
              <Icon name="chevronRight" size={14} color={T.accent} />
            </span>
          </button>
        ))}
      </div>

      {/* Upcoming events */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Upcoming Events</h2>
        <button onClick={() => setView("events")} className="text-sm font-medium flex items-center gap-1" style={{ color: T.accent }}>
          View all <Icon name="chevronRight" size={13} color={T.accent} />
        </button>
      </div>
      {isLoading ? (
        <p className="text-sm text-center py-10" style={{ color: T.muted }}>Loading your events...</p>
      ) : events.length === 0 ? (
        <EmptyEventsState />
      ) : (
        <EventList events={events} />
      )}
    </div>
  );
}

// ─── Event list ───────────────────────────────────────────────────────────
function EventList({ events }: { events: EventRecord[] }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
      {events.map((e, i) => (
        <EventRow key={e.id} event={e} isLast={i === events.length - 1} />
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────
function EmptyEventsState() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center text-center py-16 rounded-2xl" style={{ backgroundColor: T.white, border: `1px dashed ${T.border}` }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: T.surface }}>
        <Icon name="calendar" size={20} color={T.accent} />
      </div>
      <h3 className="font-semibold mb-1">No events yet</h3>
      <p className="text-sm mb-5" style={{ color: T.muted }}>Your next celebration starts here.</p>
      <button
        onClick={() => navigate("/dashboard/events/new")}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
        style={{ backgroundColor: T.accent, color: T.white }}
      >
        <Icon name="plus" size={15} color={T.white} /> Create Your First Event
      </button>
    </div>
  );
}

// ─── Event row ────────────────────────────────────────────────────────────
function EventRow({ event: e, isLast }: { event: EventRecord; isLast: boolean }) {
  const pct = e.guestCount > 0 ? Math.round((e.confirmedGuestCount / e.guestCount) * 100) : 0;
  const isPublished = e.status === "published";
  const { updateEvent } = useEvents();
  const navigate = useNavigate();
  const publicUrl = `${window.location.origin}/i/${e.slug}`;
  const [upgrading, setUpgrading] = useState(false);

  async function handlePublishToggle() {
    try {
      await updateEvent(e.id, { status: isPublished ? "unpublished" : "published" });
    } catch (err) {
      console.error("Failed to update event status:", err);
    }
  }

  async function handleViewOrCopy() {
    if (isPublished) {
      window.open(publicUrl, "_blank", "noopener,noreferrer");
    } else {
      try {
        await navigator.clipboard.writeText(publicUrl);
      } catch {
        // clipboard access can be denied silently; not worth surfacing an error for this
      }
    }
  }

  return (
    <div
      className="group relative flex items-center gap-4 p-4 transition-colors hover:bg-[rgba(28, 41, 66,0.04)]"
      style={{ backgroundColor: T.white, borderBottom: isLast ? undefined : `1px solid ${T.border}` }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: T.accent }} />
      <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
        <img src={`https://images.unsplash.com/${e.imageUrl}?w=100&h=100&fit=crop&auto=format`} alt={e.name} className="w-full h-full object-cover" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold truncate">{e.name}</span>
          <Badge label={isPublished ? "Published" : "Draft"} variant={isPublished ? "gold" : "muted"} />
          <PlanBadge plan={e.ownerPlan} />
        </div>
        <div className="flex flex-wrap gap-3 text-xs mb-2.5" style={{ color: T.muted }}>
          <span>{categoryLabel(e.category)}</span>
          <span className="flex items-center gap-1"><Icon name="calendar" size={11} color={T.muted} />{formatEventDate(e.date)}</span>
          <span className="flex items-center gap-1"><Icon name="users" size={11} color={T.muted} />{e.guestCount} guests</span>
          {e.guestCount > 0 && <span style={{ color: T.green }}>✓ {e.confirmedGuestCount} confirmed</span>}
        </div>
        {e.guestCount > 0 && (
          <div className="flex items-center gap-2.5">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: T.surface }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: T.accent, transition: "width 0.5s ease" }} />
            </div>
            <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: T.muted }}>{pct}% confirmed</span>
          </div>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
        {!planAllows(e.ownerPlan, "personalized_links") && (
          <button
            onClick={() => setUpgrading(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
            style={{ backgroundColor: "rgba(201,166,107,0.18)", color: "#8A6A33" }}
          >
            Upgrade
          </button>
        )}
        <button
          onClick={() => navigate(`/dashboard/events/${e.id}/builder`)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:bg-stone-50"
          style={{ border: `1px solid ${T.border}`, color: T.charcoal }}
        >
          <Icon name="layout" size={12} color={T.muted} /> Edit invitation
        </button>
        <button
          onClick={handlePublishToggle}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:bg-stone-50"
          style={{ border: `1px solid ${T.border}`, color: T.charcoal }}
        >
          <Icon name="eye" size={12} color={T.muted} /> {isPublished ? "Unpublish" : "Publish"}
        </button>
        <button
          onClick={handleViewOrCopy}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90"
          style={{ backgroundColor: T.accent, color: T.white }}
        >
          <Icon name="share" size={12} color={T.white} /> {isPublished ? "View invitation" : "Copy link"}
        </button>
      </div>
      {upgrading && <UpgradeEventModal event={e} onClose={() => setUpgrading(false)} />}
    </div>
  );
}

// ─── Events view ──────────────────────────────────────────────────────────
function EventsView() {
  const [tab, setTab] = useState(0);
  const tabs = ["All Events", "Upcoming", "Past Events"];
  const { events, isLoading } = useEvents();
  const navigate = useNavigate();

  const today = new Date().toISOString().slice(0, 10);
  const filtered = events.filter((e) => {
    if (tab === 1) return e.date >= today;
    if (tab === 2) return e.date < today;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
        <h1 className="text-2xl font-bold" style={{ letterSpacing: "-0.025em" }}>Events</h1>
        <button onClick={() => navigate("/dashboard/events/new")} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90" style={{ backgroundColor: T.accent, color: T.white }}>
          <Icon name="plus" size={15} color={T.white} /> Create Event
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl self-start" style={{ backgroundColor: T.surface }}>
        {tabs.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: tab === i ? T.white : "transparent",
              color: tab === i ? T.charcoal : T.muted,
              boxShadow: tab === i ? "0 1px 3px rgba(0,0,0,0.08)" : undefined,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-center py-10" style={{ color: T.muted }}>Loading your events...</p>
      ) : filtered.length === 0 ? (
        <EmptyEventsState />
      ) : (
        <EventList events={filtered} />
      )}
    </div>
  );
}

// ─── Guests view ──────────────────────────────────────────────────────────
function GuestsView({ onUpgrade }: { onUpgrade: (event?: EventRecord) => void }) {
  const { events, isLoading: eventsLoading } = useEvents();
  const { guestsForEvent, addGuest, addGuests, updateGuest, deleteGuest } = useGuests();
  const [importOpen, setImportOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [guestsLoading, setGuestsLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"add" | GuestRecord | null>(null);
  const [qrGuest, setQrGuest] = useState<GuestRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const filters = ["All", "Confirmed", "Pending", "Declined"];
  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const eventPlan = selectedEvent?.ownerPlan ?? "free";
  const limit = guestLimit(eventPlan);
  const atLimit = limit !== null && guests.length >= limit;
  const canLink = planAllows(eventPlan, "personalized_links");
  const canQr = planAllows(eventPlan, "checkin");
  const upgradeThisEvent = () => onUpgrade(selectedEvent);

  function copyGuestLink(g: GuestRecord) {
    const ev = events.find((e) => e.id === selectedEventId);
    if (!ev) return;
    const url = `${window.location.origin}/i/${ev.slug}/g/${g.id}`;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopiedId(g.id);
        setTimeout(() => setCopiedId((c) => (c === g.id ? null : c)), 1500);
      },
      () => window.prompt("Copy this guest's invitation link:", url),
    );
  }

  useEffect(() => {
    if (!selectedEventId && events.length > 0) setSelectedEventId(events[0].id);
  }, [events, selectedEventId]);

  async function reloadGuests() {
    if (!selectedEventId) return;
    setGuestsLoading(true);
    const g = await guestsForEvent(selectedEventId);
    setGuests(g);
    setGuestsLoading(false);
  }

  useEffect(() => {
    if (!selectedEventId) {
      setGuests([]);
      setGuestsLoading(false);
      return;
    }
    reloadGuests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  const confirmed = guests.filter((g) => g.rsvpStatus === "confirmed");
  const pending = guests.filter((g) => g.rsvpStatus === "pending");
  const declined = guests.filter((g) => g.rsvpStatus === "declined");
  const confirmedHeadcount = confirmed.reduce((sum, g) => sum + g.numberOfGuests, 0);

  const filtered = guests
    .filter((g) => {
      if (filter === "Confirmed") return g.rsvpStatus === "confirmed";
      if (filter === "Pending") return g.rsvpStatus === "pending";
      if (filter === "Declined") return g.rsvpStatus === "declined";
      return true;
    })
    .filter((g) => !search.trim() || g.name.toLowerCase().includes(search.trim().toLowerCase()));

  async function handleSave(values: GuestFormValues) {
    if (!selectedEventId) return;
    if (modal && modal !== "add") {
      await updateGuest(modal.id, {
        name: values.name.trim(),
        email: values.email.trim() || null,
        phone: values.phone.trim() || null,
        groupName: values.groupName || null,
        rsvpStatus: values.rsvpStatus,
        numberOfGuests: values.numberOfGuests,
        notes: values.notes.trim() || null,
      });
    } else {
      await addGuest({
        eventId: selectedEventId,
        name: values.name.trim(),
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
        groupName: values.groupName || undefined,
        numberOfGuests: values.numberOfGuests,
        notes: values.notes.trim() || undefined,
      });
    }
    await reloadGuests();
  }

  async function handleDelete(id: string) {
    await deleteGuest(id);
    await reloadGuests();
  }

  if (!eventsLoading && events.length === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" style={{ letterSpacing: "-0.025em" }}>Guests</h1>
        <EmptyEventsState />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: "-0.025em" }}>Guests</h1>
          <select
            value={selectedEventId ?? ""}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.white, color: T.charcoal }}
          >
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            disabled={!selectedEventId || guestsLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-stone-100 disabled:opacity-60"
            style={{ border: `1px solid ${T.border}`, color: T.charcoal }}
          >
            Import CSV
          </button>
          <button
            onClick={() => setModal("add")}
            disabled={!selectedEventId || guestsLoading || atLimit}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: T.accent, color: T.white }}
          >
            <Icon name="plus" size={14} color={T.white} /> Add Guest
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total", value: String(guests.length), color: T.charcoal },
          { label: "Confirmed", value: String(confirmed.length), color: T.green },
          { label: "Pending", value: String(pending.length), color: T.accent },
          { label: "Declined", value: String(declined.length), color: T.red },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-4 text-center" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
            <div className="text-xl font-bold mb-0.5" style={{ color: s.color, letterSpacing: "-0.02em" }}>{s.value}</div>
            <div className="text-xs" style={{ color: T.muted }}>{s.label}</div>
          </div>
        ))}
      </div>
      <p className="text-xs mb-6" style={{ color: T.muted }}>
        {confirmedHeadcount} confirmed guests attending (including plus-ones)
        {limit !== null && ` · ${guests.length} / ${limit} guest entries on the ${planLabel(eventPlan)} plan`}
      </p>
      {atLimit && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl px-4 py-3 mb-6" style={{ backgroundColor: "rgba(229,87,87,0.08)", border: "1px solid rgba(229,87,87,0.25)" }}>
          <p className="text-sm" style={{ color: T.charcoal }}>
            This event has reached the {planLabel(eventPlan)} plan's {limit}-guest limit. New guests and public RSVPs can't be added.
          </p>
          <button onClick={upgradeThisEvent} className="text-xs font-semibold px-3.5 py-2 rounded-lg flex-shrink-0" style={{ backgroundColor: T.accent, color: T.white }}>
            Upgrade for unlimited guests
          </button>
        </div>
      )}

      {/* Filter + search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
            <Icon name="search" size={15} color={T.muted} />
          </div>
          <input
            placeholder="Search guests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-colors"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.white, color: T.charcoal }}
          />
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: T.surface }}>
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: filter === f ? T.white : "transparent",
                color: filter === f ? T.charcoal : T.muted,
                boxShadow: filter === f ? "0 1px 2px rgba(0,0,0,0.06)" : undefined,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {guestsLoading ? (
        <p className="text-sm text-center py-10" style={{ color: T.muted }}>Loading guests...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16 rounded-2xl" style={{ backgroundColor: T.white, border: `1px dashed ${T.border}` }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: T.surface }}>
            <Icon name="users" size={20} color={T.accent} />
          </div>
          <h3 className="font-semibold mb-1">{guests.length === 0 ? "No guests yet" : "No guests match this filter"}</h3>
          <p className="text-sm" style={{ color: T.muted }}>
            {guests.length === 0 ? "Add guests, or publish this event and share its link to start collecting RSVPs." : "Try a different filter or search."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: T.muted, borderBottom: `1px solid ${T.border}` }}>
            <span>Guest</span>
            <span className="hidden md:block">Group</span>
            <span>RSVP</span>
            <span className="hidden sm:block">+Guests</span>
            <span>Action</span>
          </div>

          {filtered.map((g, i) => (
            <div
              key={g.id}
              className="group relative grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-3.5 transition-colors hover:bg-[rgba(28, 41, 66,0.04)]"
              style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : undefined, backgroundColor: T.white }}
            >
              <span className="absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: T.accent }} />
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ backgroundColor: T.accent }}>
                  {g.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{g.name}</div>
                  {g.checkedIn && <div className="text-[11px]" style={{ color: T.green }}>✓ Checked in</div>}
                  {g.message && <div className="text-[11px] truncate" style={{ color: T.muted }}>"{g.message}"</div>}
                  {g.mealPreference && <div className="text-[11px] truncate" style={{ color: T.muted }}>{g.mealPreference}</div>}
                </div>
              </div>
              <span className="hidden md:inline text-sm" style={{ color: T.muted }}>{g.groupName ? GROUP_LABELS[g.groupName] : "—"}</span>
              <Badge
                label={g.rsvpStatus === "confirmed" ? "Confirmed" : g.rsvpStatus === "pending" ? "Pending" : "Declined"}
                variant={g.rsvpStatus === "confirmed" ? "green" : g.rsvpStatus === "pending" ? "gold" : "red"}
              />
              <span className="hidden sm:inline text-sm text-center" style={{ color: T.muted }}>{g.rsvpStatus !== "declined" ? g.numberOfGuests || "—" : "—"}</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => (canLink ? copyGuestLink(g) : upgradeThisEvent())}
                  title={canLink ? "Copy this guest's personal invitation link" : `Personalized links are a ${requiredPlanLabel("personalized_links")} feature`}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:bg-stone-100"
                  style={{ color: copiedId === g.id ? T.green : canLink ? T.charcoal : T.muted, border: `1px solid ${T.border}` }}
                >
                  {copiedId === g.id ? "Copied!" : canLink ? "Link" : `Link · ${requiredPlanLabel("personalized_links")}`}
                </button>
                <button
                  onClick={() => (canQr ? setQrGuest(g) : upgradeThisEvent())}
                  title={canQr ? "Show this guest's check-in QR code" : `QR check-in is a ${requiredPlanLabel("checkin")} feature`}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:bg-stone-100"
                  style={{ color: canQr ? T.charcoal : T.muted, border: `1px solid ${T.border}` }}
                >
                  {canQr ? "QR" : `QR · ${requiredPlanLabel("checkin")}`}
                </button>
                <button
                  onClick={() => setModal(g)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:bg-stone-100"
                  style={{ color: T.charcoal, border: `1px solid ${T.border}` }}
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {qrGuest && <GuestQrModal guest={qrGuest} onClose={() => setQrGuest(null)} />}

      {importOpen && selectedEventId && (
        <ImportGuestsModal
          eventName={events.find((e) => e.id === selectedEventId)?.name ?? ""}
          remainingSlots={limit === null ? null : Math.max(0, limit - guests.length)}
          onImport={async (rows) => {
            await addGuests(rows.map((g) => ({ ...g, eventId: selectedEventId })));
            await reloadGuests();
          }}
          onClose={() => setImportOpen(false)}
        />
      )}

      {modal && (
        <GuestFormModal
          guest={modal === "add" ? undefined : modal}
          onSave={handleSave}
          onDelete={modal !== "add" ? () => handleDelete(modal.id) : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ─── Templates ────────────────────────────────────────────────────────────
// Same catalog (src/data/templates.ts) the landing page and the Create
// Event wizard use — one source of truth for "which templates exist"
// instead of a separately-maintained copy that quietly falls behind.

function TemplatesView({ onUpgrade }: { onUpgrade: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canUsePremium = planAllows(user?.plan, "premium_templates");
  const [q, setQ] = useState("");
  const [previewName, setPreviewName] = useState<string | null>(null);
  const previewTemplate = CATALOG_TEMPLATES.find((t) => t.name === previewName);
  const previewLocked = !!previewTemplate?.premium && !canUsePremium;
  const results = CATALOG_TEMPLATES.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
        <h1 className="text-2xl font-bold" style={{ letterSpacing: "-0.025em" }}>Templates</h1>
        <div className="relative w-full sm:w-64">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
            <Icon name="search" size={15} color={T.muted} />
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.white, color: T.charcoal }}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {results.map((t) => (
          <div key={t.name} className="group rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
            <div className="relative overflow-hidden" style={{ aspectRatio: "3/4" }}>
              <img src={`https://images.unsplash.com/${t.img}?w=400&h=533&fit=crop&auto=format`} alt={t.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              {t.premium && (
                <span className="absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: T.accent, color: T.white }}>Premium</span>
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: "rgba(28, 41, 66,0.5)" }}>
                <button onClick={() => setPreviewName(t.name)} className="px-4 py-2.5 rounded-xl text-xs font-bold" style={{ backgroundColor: T.white, color: T.charcoal }}>Preview</button>
                {t.premium && !canUsePremium ? (
                  <button onClick={onUpgrade} className="px-4 py-2.5 rounded-xl text-xs font-bold" style={{ backgroundColor: T.accent, color: T.white }}>Upgrade to use</button>
                ) : (
                  <button onClick={() => navigate(`/dashboard/events/new?template=${t.id}`)} className="px-4 py-2.5 rounded-xl text-xs font-bold" style={{ backgroundColor: T.accent, color: T.white }}>Use this</button>
                )}
              </div>
            </div>
            <div className="px-4 py-3.5 flex items-center justify-between" style={{ backgroundColor: T.white }}>
              <div>
                <div className="text-sm font-semibold">{t.name}</div>
                <div className="text-xs mt-0.5" style={{ color: T.muted }}>{categoryLabel(t.category)}</div>
              </div>
              {!t.premium && <span className="text-[11px] font-medium px-2 py-1 rounded-full" style={{ backgroundColor: T.surface, color: T.muted }}>Free</span>}
            </div>
          </div>
        ))}
      </div>

      {previewName && (
        <TemplatePreviewModal
          templateName={previewName}
          ctaLabel={previewLocked ? "Upgrade to use this template" : "Use this template"}
          onCta={() => (previewLocked ? onUpgrade() : navigate(`/dashboard/events/new?template=${previewTemplate?.id ?? ""}`))}
          onClose={() => setPreviewName(null)}
        />
      )}
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────
// Calendar-day buckets for the last 14 days, counted from each guest's own
// `submittedAt` — the timestamp that already exists on every row (set at
// insert for an organizer-added guest, updated on an actual RSVP response),
// so this needs no new tracking of any kind.
function last14DayBuckets(guests: GuestRecord[]): { key: string; label: string; count: number }[] {
  const buckets: { key: string; label: string; count: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.push({ key, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), count: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const g of guests) {
    const bucket = byKey.get(g.submittedAt.slice(0, 10));
    if (bucket) bucket.count++;
  }
  return buckets;
}

function AnalyticsView({ onUpgrade }: { onUpgrade: (event?: EventRecord) => void }) {
  const { events, isLoading: eventsLoading } = useEvents();
  const { guestsForEvent } = useGuests();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [guestsLoading, setGuestsLoading] = useState(true);

  useEffect(() => {
    if (!selectedEventId && events.length > 0) setSelectedEventId(events[0].id);
  }, [events, selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) {
      setGuests([]);
      setGuestsLoading(false);
      return;
    }
    setGuestsLoading(true);
    guestsForEvent(selectedEventId).then((g) => {
      setGuests(g);
      setGuestsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  if (!eventsLoading && events.length === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" style={{ letterSpacing: "-0.025em" }}>Analytics</h1>
        <EmptyEventsState />
      </div>
    );
  }

  const event = events.find((e) => e.id === selectedEventId);
  const locked = !!event && !planAllows(event.ownerPlan, "analytics");
  const confirmed = guests.filter((g) => g.rsvpStatus === "confirmed");
  const pending = guests.filter((g) => g.rsvpStatus === "pending");
  const declined = guests.filter((g) => g.rsvpStatus === "declined");
  const responseRate = guests.length ? Math.round(((confirmed.length + declined.length) / guests.length) * 100) : 0;
  const confirmedHeadcount = confirmed.reduce((sum, g) => sum + g.numberOfGuests, 0);
  const checkedInCount = confirmed.filter((g) => g.checkedIn).length;

  const buckets = last14DayBuckets(guests);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));

  const groupTotals = new Map<string, number>();
  for (const g of guests) {
    const key = g.groupName ? GROUP_LABELS[g.groupName] : "No group";
    groupTotals.set(key, (groupTotals.get(key) ?? 0) + (g.numberOfGuests || 1));
  }
  const totalForGroups = [...groupTotals.values()].reduce((a, b) => a + b, 0) || 1;
  const groupRows = [...groupTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-7">
        <div>
          <h1 className="text-2xl font-bold mb-0.5" style={{ letterSpacing: "-0.025em" }}>Analytics</h1>
          <p className="text-sm" style={{ color: T.muted }}>{event ? event.name : "Select an event"}</p>
        </div>
        {events.length > 1 && (
          <select
            value={selectedEventId ?? ""}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.white, color: T.charcoal }}
          >
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        )}
      </div>

      {locked ? (
        <UpgradeNotice
          planName={requiredPlanLabel("analytics")}
          title="Analytics is a Premium feature"
          body="Upgrade this event to see RSVP activity over time, response rates, check-in progress and guest-group breakdowns."
          onUpgrade={() => onUpgrade(event)}
        />
      ) : guestsLoading ? (
        <p className="text-sm text-center py-10" style={{ color: T.muted }}>Loading analytics...</p>
      ) : guests.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16 rounded-2xl" style={{ backgroundColor: T.white, border: `1px dashed ${T.border}` }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: T.surface }}>
            <Icon name="chart" size={20} color={T.accent} />
          </div>
          <h3 className="font-semibold mb-1">No guests yet</h3>
          <p className="text-sm" style={{ color: T.muted }}>Publish this event and start collecting RSVPs to see analytics here.</p>
        </div>
      ) : (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Invited" value={String(guests.length)} />
            <StatCard label="Confirmed Guests" value={String(confirmedHeadcount)} accent="green" />
            <StatCard label="Response Rate" value={`${responseRate}%`} />
            <StatCard label="Checked In" value={confirmed.length ? `${checkedInCount}/${confirmed.length}` : "0"} />
          </div>

          {/* Bar chart */}
          <div className="rounded-2xl p-6 mb-5" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-sm">RSVP activity</h3>
                <p className="text-xs mt-0.5" style={{ color: T.muted }}>Guests added or responding, per day</p>
              </div>
              <span className="text-xs px-3 py-1.5 rounded-full font-medium" style={{ backgroundColor: T.surface, color: T.muted }}>Last 14 days</span>
            </div>
            <div className="flex items-end gap-1" style={{ height: "120px" }}>
              {buckets.map((b) => (
                <div
                  key={b.key}
                  className="flex-1 rounded-t-sm transition-all hover:opacity-70 cursor-pointer"
                  style={{
                    height: `${Math.max(3, (b.count / maxBucket) * 100)}%`,
                    backgroundColor: b.count > 0 ? T.accent : T.border,
                  }}
                  title={`${b.label}: ${b.count}`}
                />
              ))}
            </div>
            <div className="flex justify-between mt-2 text-[10px]" style={{ color: T.muted }}>
              <span>{buckets[0].label}</span>
              <span>{buckets[Math.floor(buckets.length / 2)].label}</span>
              <span>Today</span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* RSVP breakdown */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
              <h3 className="font-semibold text-sm mb-5">RSVP Breakdown</h3>
              <div className="space-y-4">
                {[
                  { label: "Confirmed", value: confirmed.length, color: T.green },
                  { label: "Pending", value: pending.length, color: T.accent },
                  { label: "Declined", value: declined.length, color: T.red },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span style={{ color: T.muted }}>{r.label}</span>
                      <span className="font-semibold">{r.value} <span style={{ color: T.muted }}>({guests.length ? Math.round((r.value / guests.length) * 100) : 0}%)</span></span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: T.surface }}>
                      <div className="h-full rounded-full" style={{ width: `${guests.length ? (r.value / guests.length) * 100 : 0}%`, backgroundColor: r.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Guest groups */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
              <h3 className="font-semibold text-sm mb-5">Guest Groups</h3>
              <div className="space-y-3">
                {groupRows.map(([label, value]) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color: T.muted }}>{label}</span>
                        <span className="font-semibold">{value}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: T.surface }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.round((value / totalForGroups) * 100)}%`, backgroundColor: T.accent }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Billing ──────────────────────────────────────────────────────────────
// Billing is per event: every event starts Free and is upgraded on its own
// with a one-time payment (PayMongo — GCash, Maya or card). This page
// explains the plans, lists each event with its plan and an Upgrade
// button, and shows the organizer's payment history.
const PAYMENT_STATUS: Record<Payment["status"], { label: string; variant: "green" | "gold" | "muted" | "red" }> = {
  paid: { label: "Paid", variant: "green" },
  pending: { label: "Pending", variant: "gold" },
  expired: { label: "Not completed", variant: "muted" },
  failed: { label: "Failed", variant: "red" },
};

function BillingView() {
  const { events, isLoading } = useEvents();
  const [upgradeEvent, setUpgradeEvent] = useState<EventRecord | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);

  useEffect(() => {
    listPayments().then(setPayments);
  }, []);

  const plans = [
    { tier: "free" as const, name: "Free", price: "₱0", sub: "every event starts here", highlight: false },
    { tier: "premium" as const, name: "Premium", price: formatPeso(upgradePriceCentavos("free", "premium")), sub: "one time, per event", highlight: true },
    { tier: "pro" as const, name: "Pro", price: formatPeso(upgradePriceCentavos("free", "pro")), sub: "one time, per event", highlight: false },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-bold mb-0.5" style={{ letterSpacing: "-0.025em" }}>Billing & Plans</h1>
        <p className="text-sm" style={{ color: T.muted }}>
          Plans are per event — upgrade only the events that need it. A one-time payment with GCash, Maya or card; no subscription.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-9">
        {plans.map((p) => (
          <div
            key={p.tier}
            className="rounded-2xl p-5"
            style={{ backgroundColor: p.highlight ? T.charcoal : T.white, color: p.highlight ? T.white : T.charcoal, border: `1px solid ${p.highlight ? T.charcoal : T.border}` }}
          >
            <div className="text-sm font-semibold mb-1" style={{ color: p.highlight ? "rgba(255,255,255,0.55)" : T.muted }}>{p.name}</div>
            <div className="text-3xl font-bold" style={{ letterSpacing: "-0.025em" }}>{p.price}</div>
            <div className="text-xs mb-4" style={{ color: p.highlight ? "rgba(255,255,255,0.45)" : T.muted }}>{p.sub}</div>
            <ul className="space-y-2">
              {PLAN_FEATURES[p.tier].map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs" style={{ color: p.highlight ? "rgba(255,255,255,0.75)" : T.muted }}>
                  <span style={{ color: p.highlight ? T.white : T.accent }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h2 className="font-semibold mb-3">Your events</h2>
      {isLoading ? (
        <p className="text-sm py-6" style={{ color: T.muted }}>Loading your events...</p>
      ) : events.length === 0 ? (
        <EmptyEventsState />
      ) : (
        <div className="rounded-2xl overflow-hidden mb-9" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
          {events.map((e, i) => {
            const maxed = planAllows(e.ownerPlan, "personalized_links");
            return (
              <div key={e.id} className="flex items-center justify-between gap-4 px-5 py-3.5" style={{ borderBottom: i < events.length - 1 ? `1px solid ${T.border}` : undefined }}>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{e.name}</div>
                  <div className="text-xs" style={{ color: T.muted }}>{formatEventDate(e.date)}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <PlanBadge plan={e.ownerPlan} />
                  {maxed ? (
                    <span className="text-xs w-[92px] text-right" style={{ color: T.muted }}>All features</span>
                  ) : (
                    <button onClick={() => setUpgradeEvent(e)} className="text-xs font-semibold px-3.5 py-2 rounded-lg w-[92px]" style={{ backgroundColor: T.accent, color: T.white }}>
                      Upgrade
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="font-semibold mb-3">Payment history</h2>
      {payments === null ? (
        <p className="text-sm py-6" style={{ color: T.muted }}>Loading payments...</p>
      ) : payments.length === 0 ? (
        <p className="text-sm py-6 px-5 rounded-2xl" style={{ color: T.muted, backgroundColor: T.white, border: `1px dashed ${T.border}` }}>No payments yet.</p>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
          {payments.map((p, i) => (
            <div key={p.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto] items-center gap-x-5 gap-y-1 px-5 py-3.5" style={{ borderBottom: i < payments.length - 1 ? `1px solid ${T.border}` : undefined }}>
              <div className="min-w-0">
                <div className="text-sm truncate">{p.description}</div>
                <div className="text-xs" style={{ color: T.muted }}>{new Date(p.paidAt ?? p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
              </div>
              <span className="text-sm font-semibold text-right">{formatPeso(p.amountCentavos)}</span>
              <span className="hidden sm:inline text-xs" style={{ color: T.muted }}>{paymentMethodLabel(p.paymentMethod)}</span>
              <span className="hidden sm:inline"><Badge label={PAYMENT_STATUS[p.status].label} variant={PAYMENT_STATUS[p.status].variant} /></span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] mt-4" style={{ color: T.muted }}>
        Payments are processed securely by PayMongo. Need a refund or an official receipt? Contact support with the event name and payment date.
      </p>

      {upgradeEvent && <UpgradeEventModal event={upgradeEvent} onClose={() => setUpgradeEvent(null)} />}
    </div>
  );
}

function PlanBadge({ plan }: { plan: EventRecord["ownerPlan"] }) {
  const paid = plan !== "free";
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
      style={{ backgroundColor: paid ? "rgba(201,166,107,0.18)" : T.surface, color: paid ? "#8A6A33" : T.muted }}
    >
      {planLabel(plan)}
    </span>
  );
}
