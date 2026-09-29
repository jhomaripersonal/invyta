import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useEvents, type EventRecord } from "../../../lib/events-store";
import type { InvitationConfig, InvitationSectionType } from "../../../types/models";
import { SectionList, SECTION_LABELS } from "../../../components/invitation/SectionList";
import { useScrollportHeight } from "../../../components/invitation/useScrollportHeight";
import { SectionSidebar } from "./SectionSidebar";
import { ContentForm } from "./ContentForms";
import { DesignPanel } from "./DesignPanel";
import UpgradeEventModal from "../UpgradeEventModal";
import LinkModal from "./LinkModal";
import { EventPlanProvider } from "../../../lib/event-plan-context";
import { planLabel } from "../../../data/plan-limits";
import { useToast } from "../../../components/Toast";
import PageLoader from "../../../components/PageLoader";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { T } from "../../../lib/tokens";

// How long typing has to pause before the invitation saves on its own.
const AUTOSAVE_DELAY_MS = 1200;

type SaveState = "saved" | "unsaved" | "saving" | "error";

// The database rejects a gallery over the plan's photo limit, or a Premium
// gallery style / page layout / cover style on a lower plan, with a
// readable message (see gallery_photo_limit, gallery_style_is_premium and
// design_style_is_premium in schema.sql) — show it rather than the generic
// failure.
function saveErrorMessage(err: unknown): string {
  const message = (err as { message?: string } | null)?.message ?? "";
  return /gallery photos|Premium plan|Pro plan/.test(message) ? message : "Couldn't save — check your connection";
}

const DEVICE_WIDTH: Record<"mobile" | "tablet" | "desktop", number> = { mobile: 380, tablet: 700, desktop: 1040 };

export default function InvitationBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id!;
  const navigate = useNavigate();
  const { getEvent, getEventById, isLoading: eventsLoading, updateInvitation, updateEvent, refresh } = useEvents();

  const liveEvent = getEvent(eventId);
  const [resolvedEvent, setResolvedEvent] = useState<EventRecord | null | "loading">("loading");
  const [config, setConfig] = useState<InvitationConfig | null>(null);
  const [selected, setSelected] = useState<InvitationSectionType | null>(null);
  const [rightTab, setRightTab] = useState<"content" | "design">("content");
  // Below the lg breakpoint the side panels don't fit beside the preview,
  // so they open as a bottom sheet from a toolbar instead.
  const [sheet, setSheet] = useState<null | "sections" | "edit" | "design">(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [device, setDevice] = useState<"mobile" | "tablet" | "desktop">("mobile");
  const [previewRef, previewHeight] = useScrollportHeight();
  const toast = useToast();
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // What's in the database, as JSON — the config is "dirty" when it differs.
  const savedJson = useRef<string | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const inFlight = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (liveEvent) {
      setResolvedEvent(liveEvent);
      return;
    }
    if (!eventsLoading) {
      getEventById(eventId).then(setResolvedEvent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEvent, eventsLoading, eventId]);

  const event = resolvedEvent === "loading" ? null : resolvedEvent;

  useEffect(() => {
    if (event && !config) {
      setConfig(event.invitation);
      savedJson.current = JSON.stringify(event.invitation);
      const first = [...event.invitation.sections].sort((a, b) => a.order - b.order)[0];
      setSelected(first?.type ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  // Saves the current config if it has unsaved changes. Resolves true once
  // everything on screen is in the database.
  const saveNow = useCallback(async (): Promise<boolean> => {
    // Let a save that's already running finish first, then re-check.
    if (inFlight.current) await inFlight.current;
    const current = configRef.current;
    if (!current) return true;
    const json = JSON.stringify(current);
    if (json === savedJson.current) return true;
    const run = (async () => {
      setSaveState("saving");
      try {
        await updateInvitation(eventId, current);
        savedJson.current = json;
        setSaveError("");
        setSaveState(JSON.stringify(configRef.current) === json ? "saved" : "unsaved");
        return true;
      } catch (err) {
        setSaveError(saveErrorMessage(err));
        setSaveState("error");
        return false;
      }
    })();
    inFlight.current = run;
    try {
      return await run;
    } finally {
      inFlight.current = null;
    }
  }, [eventId, updateInvitation]);

  // Autosave a moment after the last change.
  useEffect(() => {
    if (!config || savedJson.current === null) return;
    if (JSON.stringify(config) === savedJson.current) return;
    setSaveState((s) => (s === "saving" ? s : "unsaved"));
    const timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [config, saveNow]);

  // Closing the tab or reloading with unsaved changes: ask the browser to
  // confirm. Leaving within the app (browser Back) flushes on unmount below.
  const hasPending = saveState !== "saved";
  useEffect(() => {
    if (!hasPending) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasPending]);

  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;
  useEffect(() => () => void saveNowRef.current(), []);

  if (resolvedEvent === "loading" || !config) {
    return <PageLoader label="Loading invitation" />;
  }

  if (resolvedEvent === null || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-3" style={{ backgroundColor: T.cream }}>
        <p className="text-sm" style={{ color: T.muted }}>Event not found.</p>
        <Link to="/dashboard" className="text-sm font-semibold" style={{ color: T.accent }}>Back to dashboard</Link>
      </div>
    );
  }

  function toggleSection(type: InvitationSectionType) {
    setConfig((c) => c && { ...c, sections: c.sections.map((s) => (s.type === type ? { ...s, enabled: !s.enabled } : s)) });
  }

  function reorderSections(order: InvitationSectionType[]) {
    setConfig((c) => {
      if (!c) return c;
      const orderIndex = new Map(order.map((type, i) => [type, i]));
      return { ...c, sections: c.sections.map((s) => ({ ...s, order: orderIndex.get(s.type) ?? s.order })) };
    });
  }

  function updateSectionContent(type: InvitationSectionType, content: Record<string, unknown>) {
    setConfig((c) => c && { ...c, sections: c.sections.map((s) => (s.type === type ? { ...s, content } : s)) });
  }

  async function handleBack() {
    if (!(await saveNow())) {
      setConfirmLeave(true);
      return;
    }
    navigate("/dashboard");
  }

  async function handlePublishToggle() {
    if (!event) return;
    const publish = event.status !== "published";
    setPublishing(true);
    try {
      // Publish what's on screen, not the last autosave.
      if (publish && !(await saveNow())) {
        toast("Couldn't publish — your latest changes aren't saved yet.", "error");
        return;
      }
      await updateEvent(event.id, { status: publish ? "published" : "unpublished" });
      toast(publish ? "Published — your invitation is live" : "Unpublished — the link is offline");
    } catch {
      toast(publish ? "Couldn't publish. Please try again." : "Couldn't unpublish. Please try again.", "error");
    } finally {
      setPublishing(false);
    }
  }

  const selectedSection = config.sections.find((s) => s.type === selected);
  const isPublished = event.status === "published";

  // Shared between the desktop side panels and the mobile bottom sheet.
  const editPanel = selectedSection ? (
    <div>
      <p className="text-sm font-semibold mb-4" style={{ color: T.charcoal }}>{SECTION_LABELS[selectedSection.type]}</p>
      <ContentForm type={selectedSection.type} content={selectedSection.content} onChange={(content) => updateSectionContent(selectedSection.type, content)} eventId={event.id} />
    </div>
  ) : (
    <p className="text-xs" style={{ color: T.muted }}>Select a section to edit its content.</p>
  );
  const designPanel = <DesignPanel config={config} onChange={setConfig} category={event.category} eventId={event.id} />;
  const sectionList = (onPick: (t: InvitationSectionType) => void) => (
    <SectionSidebar sections={config.sections} selected={selected} onSelect={onPick} onToggle={toggleSection} onReorder={reorderSections} />
  );

  return (
    <EventPlanProvider plan={event.ownerPlan}>
      <div className="flex flex-col h-screen" style={{ backgroundColor: T.cream }}>
        {/* Toolbar */}
        <header className="h-14 flex items-center justify-between px-4 flex-shrink-0" style={{ backgroundColor: T.white, borderBottom: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={handleBack} className="text-sm font-medium flex-shrink-0" style={{ color: T.muted }}>
              ← Back
            </button>
            <span className="text-sm font-semibold truncate" style={{ color: T.charcoal }}>{event.name}</span>
            <span className="hidden sm:inline text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: T.surface, color: T.muted }}>
              {planLabel(event.ownerPlan)}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1 p-1 rounded-lg" style={{ backgroundColor: T.surface }}>
            {(["mobile", "tablet", "desktop"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className="px-3 py-1 rounded-md text-xs font-medium capitalize"
                style={{ backgroundColor: device === d ? T.white : "transparent", color: device === d ? T.charcoal : T.muted }}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <SaveStatus state={saveState} error={saveError} />
            <button
              onClick={() => setLinkOpen(true)}
              className="hidden sm:block px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:bg-stone-100"
              style={{ border: `1px solid ${T.border}`, color: T.charcoal }}
            >
              Link
            </button>
            {event.ownerPlan !== "pro" && event.ownerPlan !== "event_planner" && (
              <button
                onClick={() => setUpgradeOpen(true)}
                className="px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
                style={{ backgroundColor: T.goldTint, color: T.gold }}
              >
                Upgrade
              </button>
            )}
            {saveState === "error" && (
              <button
                onClick={() => void saveNow()}
                className="px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:bg-stone-100"
                style={{ border: `1px solid ${T.border}`, color: T.charcoal }}
              >
                Retry save
              </button>
            )}
            <button
              onClick={handlePublishToggle}
              disabled={publishing}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: T.accent, color: T.white }}
            >
              {publishing ? (isPublished ? "Unpublishing..." : "Publishing...") : isPublished ? "Unpublish" : "Publish"}
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          <aside className="w-56 flex-shrink-0 hidden sm:block" style={{ backgroundColor: T.white, borderRight: `1px solid ${T.border}` }}>
            {sectionList((t) => { setSelected(t); setRightTab("content"); })}
          </aside>

          <main ref={previewRef} className="flex-1 overflow-y-auto flex justify-center py-8 px-4">
            <div
              className="rounded-2xl overflow-hidden shadow-lg transition-all"
              style={{ width: DEVICE_WIDTH[device], maxWidth: "100%", border: `1px solid ${T.border}`, backgroundColor: T.white, height: "fit-content" }}
            >
              {/* No inner max-width here — this box is already sized to the
                  selected device (380/700/1040), matching the public page's
                  own per-device breakpoints. A fixed max-w-lg here used to
                  cap the actual content at ~512px even in Tablet/Desktop
                  mode, leaving the rest of the (correctly wider) box as dead
                  white space instead of real preview area. */}
              <SectionList
                invitation={config}
                event={event}
                interactive={false}
                highlightType={selected}
                showWatermark={event.ownerPlan === "free"}
                screenHeight={previewHeight}
                site
              />
            </div>
          </main>

          <aside className="w-80 flex-shrink-0 overflow-y-auto hidden lg:block p-4" style={{ backgroundColor: T.white, borderLeft: `1px solid ${T.border}` }}>
            <div className="flex gap-1 mb-5 p-1 rounded-lg" style={{ backgroundColor: T.surface }}>
              {(["content", "design"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  className="flex-1 py-1.5 rounded-md text-xs font-semibold capitalize"
                  style={{ backgroundColor: rightTab === tab ? T.white : "transparent", color: rightTab === tab ? T.charcoal : T.muted }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {rightTab === "content" ? editPanel : designPanel}
          </aside>
        </div>

        {/* Phone/tablet toolbar — the side panels are hidden below lg. */}
        <nav className="lg:hidden flex-shrink-0 grid grid-cols-3 sm:grid-cols-2" style={{ backgroundColor: T.white, borderTop: `1px solid ${T.border}` }}>
          {([
            ["sections", "Sections", "sm:hidden"],
            ["edit", selectedSection ? `Edit ${SECTION_LABELS[selectedSection.type]}` : "Edit", ""],
            ["design", "Design", ""],
          ] as const).map(([id, label, hide]) => (
            <button
              key={id}
              onClick={() => setSheet(id === "edit" && !selectedSection ? "sections" : id)}
              className={`py-3.5 text-xs font-semibold truncate px-2 ${hide}`}
              style={{ color: sheet === id ? T.accent : T.charcoal }}
            >
              {label}
            </button>
          ))}
        </nav>

        {sheet && (
          <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end" style={{ backgroundColor: "rgba(28, 41, 66,0.35)" }} onClick={() => setSheet(null)}>
            <div
              className="rounded-t-2xl max-h-[78vh] flex flex-col"
              style={{ backgroundColor: T.white, boxShadow: "0 -8px 30px rgba(0,0,0,0.12)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0" style={{ borderBottom: `1px solid ${T.border}` }}>
                <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: T.surface }}>
                  {(["sections", "edit", "design"] as const).map((id) => (
                    <button
                      key={id}
                      onClick={() => setSheet(id)}
                      className="px-3 py-1 rounded-md text-xs font-semibold capitalize"
                      style={{ backgroundColor: sheet === id ? T.white : "transparent", color: sheet === id ? T.charcoal : T.muted }}
                    >
                      {id}
                    </button>
                  ))}
                </div>
                <button onClick={() => setSheet(null)} className="text-xs font-semibold px-3 py-1.5" style={{ color: T.accent }}>
                  Done
                </button>
              </div>
              <div className="overflow-y-auto p-4">
                {sheet === "sections" && sectionList((t) => { setSelected(t); setSheet("edit"); })}
                {sheet === "edit" && editPanel}
                {sheet === "design" && designPanel}
              </div>
            </div>
          </div>
        )}

        {confirmLeave && (
          <ConfirmDialog
            title="Leave without saving?"
            body={`Your latest changes couldn't be saved (${saveError || "unknown error"}). If you leave now, they'll be lost.`}
            confirmLabel="Leave anyway"
            cancelLabel="Stay"
            danger
            onConfirm={() => navigate("/dashboard")}
            onCancel={() => setConfirmLeave(false)}
          />
        )}
        {upgradeOpen && <UpgradeEventModal event={event} onClose={() => setUpgradeOpen(false)} />}
        {linkOpen && (
          <LinkModal
            event={event}
            onSaved={refresh}
            onUpgrade={() => { setLinkOpen(false); setUpgradeOpen(true); }}
            onClose={() => setLinkOpen(false)}
          />
        )}
      </div>
    </EventPlanProvider>
  );
}

function SaveStatus({ state, error }: { state: SaveState; error: string }) {
  const label = { saved: "All changes saved", unsaved: "Unsaved changes", saving: "Saving...", error }[state];
  return (
    <span
      role="status"
      title={label}
      className={`text-xs max-w-[9rem] sm:max-w-[16rem] truncate ${state === "error" ? "" : "hidden md:inline"}`}
      style={{ color: state === "error" ? T.error : T.muted }}
    >
      {label}
    </span>
  );
}
