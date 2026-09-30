import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import webAppLogo from "../assets/webApp-logo-mark.png";
import { useAuth } from "../lib/auth-context";
import { useEvents, type EventRecord } from "../lib/events-store";
import { useGuests, type GuestRecord } from "../lib/guests-store";
import { exportFileName, guestsToCsv } from "../lib/guest-export";
import { formatDeadline, rsvpSettings } from "../lib/rsvp-settings";
import { EVENT_CATEGORIES } from "../data/event-categories";
import { TEMPLATES as CATALOG_TEMPLATES } from "../data/templates";
import { GuestFormModal, GROUP_LABELS, type GuestFormValues } from "./dashboard/GuestFormModal";
import { GuestQrModal } from "./dashboard/GuestQrModal";
// Check-in carries the camera QR scanner (html5-qrcode, the largest
// dependency), so it loads only when the Check-in screen is opened.
const RemindGuestsModal = lazy(() => import("./dashboard/RemindGuestsModal"));
const CheckinView = lazy(() => import("./dashboard/CheckinView").then((m) => ({ default: m.CheckinView })));
import NotificationsMenu from "./dashboard/NotificationsMenu";
import SearchPalette, { SEARCH_SHORTCUT_LABEL } from "./dashboard/SearchPalette";
import SettingsView from "./dashboard/SettingsView";
import ImportGuestsModal from "./dashboard/ImportGuestsModal";
import UpgradeEventModal from "./dashboard/UpgradeEventModal";
import { listPayments, paymentMethodLabel } from "../lib/payments";
import { PLAN_FEATURES, formatPeso, upgradePriceCentavos } from "../data/pricing";
import type { Payment } from "../types/models";
import UpgradeNotice from "../components/UpgradeNotice";
import ConfirmDialog from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import TemplatePreviewModal from "../components/invitation/TemplatePreviewModal";
import { accountPlan, guestLimit, planAllows, planLabel, requiredPlanLabel, type PlanFeature } from "../data/plan-limits";
import { T } from "../lib/tokens";
import { useSelectedEvent } from "../lib/use-selected-event";

type NavTarget = "landing" | "dashboard" | "login";
const VIEWS = ["home", "events", "templates", "analytics", "billing", "guests", "checkin", "settings"] as const;
type View = (typeof VIEWS)[number];
const EVENT_SCOPED_VIEWS = ["guests", "checkin", "analytics"] as const;

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
    lock: <><rect x="3.5" y="8" width="11" height="8" rx="1.5"/><path d="M6 8V5.5a3 3 0 0 1 6 0V8"/></>,
    more: <><circle cx="4" cy="9" r="0.9" fill={color}/><circle cx="9" cy="9" r="0.9" fill={color}/><circle cx="14" cy="9" r="0.9" fill={color}/></>,
    link: <><path d="M7.5 10.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2L9 4.8"/><path d="M10.5 7.5a3 3 0 0 0-4.2 0L3.7 10.1a3 3 0 0 0 4.2 4.2L9 13.2"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────
type BadgeVariant = "green" | "amber" | "muted" | "red";

function Badge({ label, variant }: { label: string; variant: BadgeVariant }) {
  const color = { green: T.green, amber: T.amber, muted: T.muted, red: T.red }[variant];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// ─── Row menu ─────────────────────────────────────────────────────────────
// A "⋯" button with a small dropdown of actions — the full set of a row's
// actions on phones, and the less-used ones on wider screens.
type MenuItem = { label: string; onClick: () => void; tone?: "danger" | "muted" };

function RowMenu({ items, label, className = "" }: { items: (MenuItem | false | null | undefined)[]; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = items.filter(Boolean) as MenuItem[];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (visible.length === 0) return null;
  return (
    <div ref={ref} className={`relative flex-shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-stone-100"
        style={{ border: `1px solid ${T.border}`, backgroundColor: open ? T.surface : T.white }}
      >
        <Icon name="more" size={16} color={T.charcoal} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-30 min-w-[200px] py-1.5 rounded-xl"
          style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: "0 8px 24px rgba(28,41,66,0.12)" }}
        >
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="w-full text-left px-3.5 py-2.5 text-sm transition-colors hover:bg-stone-50"
              style={{ color: item.tone === "danger" ? "#B42318" : item.tone === "muted" ? T.muted : T.charcoal }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Copies text, confirming with a toast; where the clipboard is blocked,
// falls back to a prompt the user can copy from.
async function copyWithToast(text: string, toast: ReturnType<typeof useToast>, done: string, fallbackPrompt: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    window.prompt(fallbackPrompt, text);
  }
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

// Today as YYYY-MM-DD in the organizer's own timezone (toISOString is UTC,
// which in the Philippines still says "yesterday" until 8 a.m.).
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// An event without a date yet counts as upcoming — it hasn't happened.
function isUpcoming(e: EventRecord, today: string): boolean {
  return !e.date || e.date >= today;
}

// Soonest first; undated events last.
function bySoonest(a: EventRecord, b: EventRecord): number {
  if (!a.date || !b.date) return a.date ? -1 : b.date ? 1 : 0;
  return a.date.localeCompare(b.date);
}

function categoryLabel(category: EventRecord["category"]): string {
  return EVENT_CATEGORIES.find((c) => c.id === category)?.label ?? category;
}

// ─── Main layout ──────────────────────────────────────────────────────────
export default function Dashboard({ onNav }: { onNav: (p: NavTarget) => void }) {
  // Each view has its own URL (/dashboard/guests …), so a refresh stays put,
  // the browser's Back button goes to the previous view, and views can be
  // linked to directly.
  const { view: viewParam } = useParams<{ view?: string }>();
  const view: View = (VIEWS as readonly string[]).includes(viewParam ?? "") ? (viewParam as View) : "home";
  const unknownView = viewParam !== undefined && view === "home";
  const mainRef = useRef<HTMLElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { user, logout } = useAuth();
  const { events, isLoading: eventsLoading } = useEvents();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Moving between the per-event views keeps the event that's being looked at.
  const setView = (v: View) => {
    const eventId = searchParams.get("event");
    const keep = eventId && (EVENT_SCOPED_VIEWS as readonly View[]).includes(v) ? `?event=${eventId}` : "";
    navigate((v === "home" ? "/dashboard" : `/dashboard/${v}`) + keep);
  };
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

  // Start each view at the top rather than at the last view's scroll offset.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [view]);

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

  if (unknownView) return <Navigate to="/dashboard" replace />;

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
          {user?.isAdmin && (
            <button onClick={() => navigate("/admin")} className="w-full mt-0.5 text-xs font-semibold text-center py-1.5 rounded-lg hover:bg-stone-50 transition-colors" style={{ color: T.accent }}>
              Admin
            </button>
          )}
        </div>
      </aside>

      {/* Mobile backdrop */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/25 md:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}

      {/* ── MAIN ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="h-16 flex items-center justify-between px-5 md:px-7 flex-shrink-0" style={{ backgroundColor: T.white, borderBottom: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" aria-expanded={sidebarOpen} className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-stone-100 transition-colors">
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
        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <div className="px-5 md:px-8 py-7">
            {view === "home" && <HomeView setView={setView} firstName={displayName.split(" ")[0] || "there"} events={events} isLoading={eventsLoading} />}
            {view === "events" && <EventsView />}
            {view === "guests" && <GuestsView onUpgrade={openUpgrade} />}
            {view === "checkin" && (
              <Suspense fallback={<p className="text-sm text-center py-10" style={{ color: T.muted }}>Loading check-in...</p>}>
                <CheckinView onUpgrade={openUpgrade} />
              </Suspense>
            )}
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
  const today = todayIso();
  const upcoming = events.filter((e) => isUpcoming(e, today)).sort(bySoonest);
  const HOME_LIST_LIMIT = 5;

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
        {/* With no events yet, the empty state below carries this button. */}
        {events.length > 0 && (
          <button
            onClick={() => navigate("/dashboard/events/new")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 flex-shrink-0 self-start sm:self-auto"
            style={{ backgroundColor: T.accent, color: T.white }}
          >
            <Icon name="plus" size={15} color={T.white} />
            Create Event
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Upcoming Events" value={String(upcoming.length)} />
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
        {events.length > 0 && (
          <button onClick={() => setView("events")} className="text-sm font-medium flex items-center gap-1" style={{ color: T.accent }}>
            View all {events.length} <Icon name="chevronRight" size={13} color={T.accent} />
          </button>
        )}
      </div>
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : events.length === 0 ? (
        <EmptyEventsState />
      ) : upcoming.length === 0 ? (
        <EmptyNote icon="calendar" title="No upcoming events" body="Your past events are under Events → Past Events." />
      ) : (
        <EventList events={upcoming.slice(0, HOME_LIST_LIMIT)} />
      )}
    </div>
  );
}

// ─── Event list ───────────────────────────────────────────────────────────
function EventList({ events }: { events: EventRecord[] }) {
  return (
    <div className="rounded-2xl" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
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

// A quieter empty state for "nothing matches" (as opposed to "no events at
// all", which gets the Create button above).
function EmptyNote({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6 rounded-2xl" style={{ backgroundColor: T.white, border: `1px dashed ${T.border}` }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: T.surface }}>
        <Icon name={icon} size={20} color={T.accent} />
      </div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm" style={{ color: T.muted }}>{body}</p>
    </div>
  );
}

// Placeholder rows while a list loads — keeps the layout from jumping when
// the real rows arrive.
function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-2xl" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 animate-pulse" style={{ borderBottom: i < rows - 1 ? `1px solid ${T.border}` : undefined }}>
          <div className="w-12 h-12 rounded-xl flex-shrink-0" style={{ backgroundColor: T.surface }} />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 rounded w-2/5" style={{ backgroundColor: T.surface }} />
            <div className="h-3 rounded w-3/5" style={{ backgroundColor: T.surface }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Event row ────────────────────────────────────────────────────────────
// Tapping the row opens the builder. Only a published event has a working
// public link (drafts are hidden from guests), so sharing is offered only
// once it's published — a draft's primary action is Publish instead.
function EventRow({ event: e, isLast }: { event: EventRecord; isLast: boolean }) {
  const pct = e.guestCount > 0 ? Math.round((e.confirmedGuestCount / e.guestCount) * 100) : 0;
  const isPublished = e.status === "published";
  const { updateEvent } = useEvents();
  const navigate = useNavigate();
  const toast = useToast();
  const publicUrl = `${window.location.origin}/i/${e.slug}`;
  const [upgrading, setUpgrading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const canUpgrade = !planAllows(e.ownerPlan, "personalized_links");
  const openBuilder = () => navigate(`/dashboard/events/${e.id}/builder`);
  const openGuests = () => navigate(`/dashboard/guests?event=${e.id}`);
  const openCheckin = () => navigate(`/dashboard/checkin?event=${e.id}`);

  async function handlePublishToggle() {
    const publish = !isPublished;
    setPublishing(true);
    try {
      await updateEvent(e.id, { status: publish ? "published" : "unpublished" });
      toast(publish ? `"${e.name}" is live — copy the link to share it` : `"${e.name}" is unpublished`);
    } catch {
      toast(publish ? "Couldn't publish. Please try again." : "Couldn't unpublish. Please try again.", "error");
    } finally {
      setPublishing(false);
    }
  }

  const copyLink = () => copyWithToast(publicUrl, toast, "Invitation link copied", "Copy your invitation link:");
  const viewInvitation = () => window.open(publicUrl, "_blank", "noopener,noreferrer");

  return (
    <div
      className="group relative flex items-center gap-3 sm:gap-4 p-4 first:rounded-t-2xl last:rounded-b-2xl transition-colors hover:bg-[rgba(28,41,66,0.04)]"
      style={{ borderBottom: isLast ? undefined : `1px solid ${T.border}` }}
    >
      <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: T.accent }} />
      <button type="button" onClick={openBuilder} className="flex-1 min-w-0 flex items-center gap-3 sm:gap-4 text-left" aria-label={`Edit ${e.name}`}>
        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
          <img src={`https://images.unsplash.com/${e.imageUrl}?w=100&h=100&fit=crop&auto=format`} alt="" className="w-full h-full object-cover" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-0.5">
            <span className="text-sm font-semibold truncate max-w-full">{e.name}</span>
            <Badge label={isPublished ? "Published" : "Draft"} variant={isPublished ? "green" : "muted"} />
            <PlanBadge plan={e.ownerPlan} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs mb-2.5" style={{ color: T.muted }}>
            <span className="hidden sm:inline">{categoryLabel(e.category)}</span>
            <span className="flex items-center gap-1"><Icon name="calendar" size={11} color={T.muted} />{formatEventDate(e.date)}</span>
            <span className="flex items-center gap-1"><Icon name="users" size={11} color={T.muted} />{e.guestCount} guests</span>
            {e.guestCount > 0 && <span className="hidden sm:inline" style={{ color: T.green }}>✓ {e.confirmedGuestCount} confirmed</span>}
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
      </button>

      <div className="flex items-center gap-2 flex-shrink-0">
        {canUpgrade && (
          <button
            onClick={() => setUpgrading(true)}
            className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
            style={{ backgroundColor: T.goldTint, color: T.gold }}
          >
            Upgrade
          </button>
        )}
        <button
          onClick={openBuilder}
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:bg-stone-50"
          style={{ border: `1px solid ${T.border}`, color: T.charcoal }}
        >
          <Icon name="layout" size={12} color={T.muted} /> Edit invitation
        </button>
        {isPublished ? (
          <button
            onClick={copyLink}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90"
            style={{ backgroundColor: T.accent, color: T.white }}
          >
            <Icon name="link" size={12} color={T.white} /> Copy link
          </button>
        ) : (
          <button
            onClick={handlePublishToggle}
            disabled={publishing}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: T.accent, color: T.white }}
          >
            <Icon name="eye" size={12} color={T.white} /> {publishing ? "Publishing..." : "Publish"}
          </button>
        )}
        <RowMenu
          label={`More actions for ${e.name}`}
          items={[
            { label: "Edit invitation", onClick: openBuilder },
            { label: "Manage guests", onClick: openGuests },
            { label: "Check-in", onClick: openCheckin },
            isPublished && { label: "Copy invitation link", onClick: copyLink },
            isPublished && { label: "View invitation", onClick: viewInvitation },
            { label: isPublished ? "Unpublish" : "Publish", onClick: handlePublishToggle },
            canUpgrade && { label: "Upgrade this event", onClick: () => setUpgrading(true) },
          ]}
        />
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

  const today = todayIso();
  const filtered =
    tab === 1
      ? events.filter((e) => isUpcoming(e, today)).sort(bySoonest)
      : tab === 2
        ? events.filter((e) => !isUpcoming(e, today)).sort((a, b) => bySoonest(b, a))
        : events;

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
        <ListSkeleton rows={3} />
      ) : events.length === 0 ? (
        <EmptyEventsState />
      ) : filtered.length === 0 ? (
        tab === 1 ? (
          <EmptyNote icon="calendar" title="No upcoming events" body="Create an event, or find earlier ones under Past Events." />
        ) : (
          <EmptyNote icon="calendar" title="No past events yet" body="Events move here the day after they happen." />
        )
      ) : (
        <EventList events={filtered} />
      )}
    </div>
  );
}

// ─── Guests view ──────────────────────────────────────────────────────────
function GuestsView({ onUpgrade }: { onUpgrade: (event?: EventRecord) => void }) {
  const { events, isLoading: eventsLoading } = useEvents();
  const { guestsForEvent, addGuest, addGuests, updateGuest, updateGuests, deleteGuest, deleteGuests } = useGuests();
  const [importOpen, setImportOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useSelectedEvent(events);
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [guestsLoading, setGuestsLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"add" | GuestRecord | null>(null);
  const [qrGuest, setQrGuest] = useState<GuestRecord | null>(null);
  const toast = useToast();
  const [remindOpen, setRemindOpen] = useState(false);
  // Bulk selection (Pro): null = not selecting.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);
  const filters = ["All", "Confirmed", "Pending", "Declined"];
  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const eventPlan = selectedEvent?.ownerPlan ?? "free";
  const limit = guestLimit(eventPlan);
  const atLimit = limit !== null && guests.length >= limit;
  const canLink = planAllows(eventPlan, "personalized_links");
  const canQr = planAllows(eventPlan, "checkin");
  const canTools = planAllows(eventPlan, "guest_tools");
  const upgradeThisEvent = () => onUpgrade(selectedEvent);
  const rsvp = rsvpSettings(selectedEvent?.invitation.sections.find((s) => s.type === "rsvp")?.content ?? {});
  const questionLabel = (id: string) => rsvp.questions.find((q) => q.id === id)?.label;

  function exportCsv() {
    if (!selectedEvent) return;
    const csv = guestsToCsv(
      guests.map((g) => ({ ...g, group: g.groupName ? GROUP_LABELS[g.groupName] : undefined })),
      canTools ? rsvp.questions : [],
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(selectedEvent.name);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toggleSelected(id: string) {
    setSelected((cur) => {
      const next = new Set(cur ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(action: () => Promise<void>, done: string) {
    setBulkBusy(true);
    setBulkError("");
    try {
      await action();
      toast(done);
      setSelected(new Set());
      await reloadGuests();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Couldn't update those guests. Please try again.");
    } finally {
      setBulkBusy(false);
    }
  }

  function copyGuestLink(g: GuestRecord) {
    const ev = events.find((e) => e.id === selectedEventId);
    if (!ev) return;
    const url = `${window.location.origin}/i/${ev.slug}/g/${g.id}`;
    const note = ev.status === "published" ? "" : " — publish the event so it opens for guests";
    copyWithToast(url, toast, `${g.name}'s link copied${note}`, "Copy this guest's invitation link:");
  }

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
    setSelected(null);
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
        ...(canTools ? { maxPartySize: values.maxPartySize || null } : {}),
      });
      toast("Guest updated");
    } else {
      await addGuest({
        eventId: selectedEventId,
        name: values.name.trim(),
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
        groupName: values.groupName || undefined,
        numberOfGuests: values.numberOfGuests,
        notes: values.notes.trim() || undefined,
        maxPartySize: canTools && values.maxPartySize ? values.maxPartySize : undefined,
      });
      toast(`${values.name.trim()} added`);
    }
    await reloadGuests();
  }

  async function handleDelete(id: string) {
    await deleteGuest(id);
    toast("Guest removed");
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            disabled={!selectedEventId || guestsLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-stone-100 disabled:opacity-60"
            style={{ border: `1px solid ${T.border}`, color: T.charcoal }}
          >
            Import CSV
          </button>
          <button
            onClick={exportCsv}
            disabled={!selectedEventId || guestsLoading || guests.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-stone-100 disabled:opacity-60"
            style={{ border: `1px solid ${T.border}`, color: T.charcoal }}
            title="Download the guest list as a spreadsheet (CSV)"
          >
            Export CSV
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
          { label: "Pending", value: String(pending.length), color: T.amber },
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
      {pending.length > 0 && selectedEvent && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl px-4 py-3 mb-6" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
          <p className="text-sm" style={{ color: T.charcoal }}>
            <strong>{pending.length}</strong> {pending.length === 1 ? "guest hasn't" : "guests haven't"} replied yet
            {rsvp.deadline && <span style={{ color: T.muted }}> · RSVPs close {formatDeadline(rsvp.deadline)}</span>}
          </p>
          <button onClick={() => setRemindOpen(true)} className="text-xs font-semibold px-3.5 py-2 rounded-lg flex-shrink-0" style={{ backgroundColor: T.accent, color: T.white }}>
            Send reminders
          </button>
        </div>
      )}
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

      {(!canLink || !canQr) && guests.length > 0 && !atLimit && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl px-4 py-3 mb-6" style={{ backgroundColor: T.goldTint }}>
          <p className="text-sm flex items-center gap-2" style={{ color: T.charcoal }}>
            <Icon name="lock" size={14} color={T.gold} />
            <span>
              {[
                !canLink && `personal invitation links (${requiredPlanLabel("personalized_links")})`,
                !canQr && `QR check-in (${requiredPlanLabel("checkin")})`,
              ]
                .filter(Boolean)
                .join(" and ")
                .replace(/^./, (c) => c.toUpperCase())}{" "}
              unlock when you upgrade this event.
            </span>
          </p>
          <button onClick={upgradeThisEvent} className="text-xs font-semibold px-3.5 py-2 rounded-lg flex-shrink-0 self-start sm:self-auto" style={{ backgroundColor: T.accent, color: T.white }}>
            See plans
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
        <button
          onClick={() => (canTools ? setSelected((cur) => (cur ? null : new Set())) : upgradeThisEvent())}
          title={canTools ? "Select guests to change or remove several at once" : `Bulk actions are a ${requiredPlanLabel("guest_tools")} feature`}
          className="px-3.5 py-2 rounded-xl text-xs font-medium transition-all hover:bg-stone-100 flex-shrink-0"
          style={{ border: `1px solid ${T.border}`, color: canTools ? T.charcoal : T.muted, backgroundColor: selected ? T.surface : undefined }}
        >
          <span className="flex items-center gap-1">{!canTools && <Icon name="lock" size={11} color={T.muted} />}{selected ? "Done" : "Select"}</span>
        </button>
      </div>

      {selected && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
          <label className="flex items-center gap-2 text-xs font-medium mr-1" style={{ color: T.charcoal }}>
            <input
              type="checkbox"
              checked={filtered.length > 0 && filtered.every((g) => selected.has(g.id))}
              onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((g) => g.id)) : new Set())}
            />
            {selected.size} selected
          </label>
          <select
            value=""
            disabled={bulkBusy || selected.size === 0}
            onChange={(e) => {
              const v = e.target.value;
              if (v) runBulk(() => updateGuests([...selected], { groupName: v === "none" ? null : (v as keyof typeof GROUP_LABELS) }), `Updated ${selected.size} ${selected.size === 1 ? "guest" : "guests"}`);
            }}
            className="px-2.5 py-1.5 rounded-lg text-xs outline-none disabled:opacity-60"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.white, color: T.charcoal }}
            aria-label="Set group for selected guests"
          >
            <option value="">Set group…</option>
            {Object.entries(GROUP_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            <option value="none">No group</option>
          </select>
          <select
            value=""
            disabled={bulkBusy || selected.size === 0}
            onChange={(e) => {
              const v = e.target.value as "confirmed" | "pending" | "declined" | "";
              if (v) runBulk(() => updateGuests([...selected], { rsvpStatus: v }), `Updated ${selected.size} ${selected.size === 1 ? "guest" : "guests"}`);
            }}
            className="px-2.5 py-1.5 rounded-lg text-xs outline-none disabled:opacity-60"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.white, color: T.charcoal }}
            aria-label="Set RSVP for selected guests"
          >
            <option value="">Mark as…</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="declined">Declined</option>
          </select>
          <button
            disabled={bulkBusy || selected.size === 0}
            onClick={() => setConfirmBulkRemove(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
            style={{ color: T.red, border: `1px solid ${T.border}`, backgroundColor: T.white }}
          >
            Remove
          </button>
          {bulkBusy && <span className="text-xs" style={{ color: T.muted }}>Saving…</span>}
          {bulkError && <span className="text-xs" style={{ color: T.red }}>{bulkError}</span>}
        </div>
      )}

      {/* Table */}
      {guestsLoading ? (
        <ListSkeleton rows={4} />
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
        <div className="rounded-2xl" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: T.muted, borderBottom: `1px solid ${T.border}` }}>
            <span>Guest</span>
            <span className="hidden md:block">Group</span>
            <span>RSVP</span>
            <span className="hidden sm:block">+Guests</span>
            <span>Action</span>
          </div>

          {filtered.map((g, i) => (
            <div
              key={g.id}
              className="group relative grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] gap-3 sm:gap-4 items-center px-4 sm:px-5 py-3.5 last:rounded-b-2xl transition-colors hover:bg-[rgba(28,41,66,0.04)]"
              style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : undefined, backgroundColor: T.white }}
            >
              <span className="absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: T.accent }} />
              <div className="flex items-center gap-3 min-w-0">
                {selected && (
                  <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSelected(g.id)} aria-label={`Select ${g.name}`} className="flex-shrink-0" />
                )}
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ backgroundColor: T.accent }}>
                  {g.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{g.name}</div>
                  {g.checkedIn && <div className="text-[11px]" style={{ color: T.green }}>✓ Checked in</div>}
                  {g.message && <div className="text-[11px] truncate" style={{ color: T.muted }}>"{g.message}"</div>}
                  {g.mealPreference && <div className="text-[11px] truncate" style={{ color: T.muted }}>{g.mealPreference}</div>}
                  {Object.entries(g.answers).map(([id, answer]) => (
                    <div key={id} className="text-[11px] truncate" style={{ color: T.muted }}>{questionLabel(id) ?? "Answer"}: {answer}</div>
                  ))}
                  {g.rsvpStatus === "pending" && g.remindedAt && (
                    <div className="text-[11px]" style={{ color: T.muted }}>Reminded {new Date(g.remindedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                  )}
                  {g.maxPartySize && <div className="text-[11px]" style={{ color: T.muted }}>Up to {g.maxPartySize} {g.maxPartySize === 1 ? "person" : "people"}</div>}
                </div>
              </div>
              <span className="hidden md:inline text-sm" style={{ color: T.muted }}>{g.groupName ? GROUP_LABELS[g.groupName] : "—"}</span>
              <Badge
                label={g.rsvpStatus === "confirmed" ? "Confirmed" : g.rsvpStatus === "pending" ? "Pending" : "Declined"}
                variant={g.rsvpStatus === "confirmed" ? "green" : g.rsvpStatus === "pending" ? "amber" : "red"}
              />
              <span className="hidden sm:inline text-sm text-center" style={{ color: T.muted }}>{g.rsvpStatus !== "declined" ? g.numberOfGuests || "—" : "—"}</span>
              <div className="hidden sm:flex items-center gap-1.5">
                <button
                  onClick={() => (canLink ? copyGuestLink(g) : upgradeThisEvent())}
                  title={canLink ? "Copy this guest's personal invitation link" : `Personalized links are a ${requiredPlanLabel("personalized_links")} feature`}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:bg-stone-100"
                  style={{ color: canLink ? T.charcoal : T.muted, border: `1px solid ${T.border}` }}
                >
                  <span className="flex items-center gap-1">{!canLink && <Icon name="lock" size={11} color={T.muted} />}Link</span>
                </button>
                <button
                  onClick={() => (canQr ? setQrGuest(g) : upgradeThisEvent())}
                  title={canQr ? "Show this guest's check-in QR code" : `QR check-in is a ${requiredPlanLabel("checkin")} feature`}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:bg-stone-100"
                  style={{ color: canQr ? T.charcoal : T.muted, border: `1px solid ${T.border}` }}
                >
                  <span className="flex items-center gap-1">{!canQr && <Icon name="lock" size={11} color={T.muted} />}QR</span>
                </button>
                <button
                  onClick={() => setModal(g)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:bg-stone-100"
                  style={{ color: T.charcoal, border: `1px solid ${T.border}` }}
                >
                  Edit
                </button>
              </div>
              <RowMenu
                className="sm:hidden"
                label={`Actions for ${g.name}`}
                items={[
                  { label: "Edit guest", onClick: () => setModal(g) },
                  canLink
                    ? { label: "Copy personal link", onClick: () => copyGuestLink(g) }
                    : { label: `Personal link · ${requiredPlanLabel("personalized_links")}`, onClick: upgradeThisEvent, tone: "muted" },
                  canQr
                    ? { label: "Show check-in QR", onClick: () => setQrGuest(g) }
                    : { label: `Check-in QR · ${requiredPlanLabel("checkin")}`, onClick: upgradeThisEvent, tone: "muted" },
                ]}
              />
            </div>
          ))}
        </div>
      )}

      {confirmBulkRemove && selected && (
        <ConfirmDialog
          title={`Remove ${selected.size} ${selected.size === 1 ? "guest" : "guests"}?`}
          body="They'll be deleted from this event along with their RSVPs. This can't be undone."
          confirmLabel="Remove"
          danger
          onConfirm={() => {
            setConfirmBulkRemove(false);
            runBulk(() => deleteGuests([...selected]), `Removed ${selected.size} ${selected.size === 1 ? "guest" : "guests"}`);
          }}
          onCancel={() => setConfirmBulkRemove(false)}
        />
      )}

      {qrGuest && <GuestQrModal guest={qrGuest} onClose={() => setQrGuest(null)} />}

      {remindOpen && selectedEvent && (
        <Suspense fallback={null}>
          <RemindGuestsModal
            event={selectedEvent}
            guests={pending}
            personalLinks={canLink}
            deadline={rsvp.deadline ? formatDeadline(rsvp.deadline) : undefined}
            onReminded={(id) => updateGuest(id, { remindedAt: new Date().toISOString() })}
            onClose={() => {
              setRemindOpen(false);
              reloadGuests();
            }}
          />
        </Suspense>
      )}

      {importOpen && selectedEventId && (
        <ImportGuestsModal
          eventName={events.find((e) => e.id === selectedEventId)?.name ?? ""}
          remainingSlots={limit === null ? null : Math.max(0, limit - guests.length)}
          onImport={async (rows) => {
            await addGuests(rows.map((g) => ({ ...g, eventId: selectedEventId })));
            toast(`Imported ${rows.length} ${rows.length === 1 ? "guest" : "guests"}`);
            await reloadGuests();
          }}
          onClose={() => setImportOpen(false)}
        />
      )}

      {modal && (
        <GuestFormModal
          guest={modal === "add" ? undefined : modal}
          canLimitParty={canTools}
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
  const canUsePremium = planAllows(accountPlan(user), "premium_templates");
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
              {/* Always shown on touch screens (there's no hover to reveal it); on
                  pointer devices it appears on hover or keyboard focus. */}
              <div className="hover-reveal absolute inset-0 flex items-end justify-center gap-2 pb-4" style={{ background: "linear-gradient(to top, rgba(28,41,66,0.75), rgba(28,41,66,0) 55%)" }}>
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
  const [selectedEventId, setSelectedEventId] = useSelectedEvent(events);
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [guestsLoading, setGuestsLoading] = useState(true);

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
            <div className="flex items-end gap-1" style={{ height: "120px" }} role="img" aria-label={`RSVP activity, last 14 days: ${buckets.map((b) => `${b.label} ${b.count}`).join(", ")}`}>
              {buckets.map((b) => (
                <div
                  key={b.key}
                  className="flex-1 rounded-t-sm transition-all hover:opacity-70"
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
                  { label: "Pending", value: pending.length, color: T.amber },
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
// with a one-time payment (PayMongo — QR Ph). This page
// explains the plans, lists each event with its plan and an Upgrade
// button, and shows the organizer's payment history.
const PAYMENT_STATUS: Record<Payment["status"], { label: string; variant: BadgeVariant }> = {
  paid: { label: "Paid", variant: "green" },
  pending: { label: "Pending", variant: "amber" },
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
          Plans are per event — upgrade only the events that need it. A one-time QR Ph payment (scan with GCash, Maya or any bank app); no subscription.
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
        <ListSkeleton rows={2} />
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
      style={{ backgroundColor: paid ? T.goldTint : T.surface, color: paid ? T.gold : T.muted }}
    >
      {planLabel(plan)}
    </span>
  );
}
