import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { resolveEventSlug } from "../../lib/custom-links";
import { useEvents, type EventRecord } from "../../lib/events-store";
import { useGuests } from "../../lib/guests-store";
import { SectionList } from "../../components/invitation/SectionList";
import { EnvelopeIntro } from "../../components/invitation/EnvelopeIntro";
import { resolveTheme } from "../../components/invitation/theme";
import MusicPlayer from "../../components/invitation/MusicPlayer";
import { planAllows } from "../../data/plan-limits";
import { T } from "../../lib/tokens";
import PageLoader from "../../components/PageLoader";

export default function PublicInvitationPage() {
  const { slug, guestId } = useParams<{ slug: string; guestId?: string }>();
  const { getEventBySlug } = useEvents();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventRecord | null | "loading">("loading");
  const { getGuestPublic } = useGuests();
  // A personal link addresses the envelope to its guest.
  const [guestName, setGuestName] = useState<string | undefined>();

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setEvent("loading");
    (async () => {
      const found = await getEventBySlug(slug);
      if (cancelled) return;
      if (found) {
        setEvent(found);
        return;
      }
      // An old link (the hosts changed it to a custom one): go to the
      // current link, keeping a personal guest path.
      const current = await resolveEventSlug(slug);
      if (cancelled) return;
      if (current && current !== slug) {
        navigate(`/i/${current}${guestId ? `/g/${guestId}` : ""}`, { replace: true });
        return;
      }
      setEvent(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // The tab shows the event, like its own website, with the browser chrome
  // tinted to the invitation's palette on phones.
  const loaded = event !== "loading" && event ? event : null;
  const coverTitle = loaded?.invitation.sections.find((s) => s.type === "cover")?.content.title;
  const pageTitle = loaded ? (typeof coverTitle === "string" && coverTitle.trim()) || loaded.name : null;
  const themeColor = loaded ? resolveTheme(loaded.invitation.theme).palette.background : null;
  useEffect(() => {
    if (!pageTitle) return;
    const previousTitle = document.title;
    document.title = pageTitle;
    const meta = document.querySelector('meta[name="theme-color"]');
    const previousColor = meta?.getAttribute("content") ?? null;
    if (meta && themeColor) meta.setAttribute("content", themeColor);
    return () => {
      document.title = previousTitle;
      if (meta && previousColor) meta.setAttribute("content", previousColor);
    };
  }, [pageTitle, themeColor]);

  const canPersonalize = loaded ? planAllows(loaded.ownerPlan, "personalized_links") : false;
  useEffect(() => {
    if (!guestId || !canPersonalize) return;
    let cancelled = false;
    getGuestPublic(guestId).then((guest) => {
      if (!cancelled && guest) setGuestName(guest.name);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestId, canPersonalize]);

  if (event === "loading") return <PageLoader label="Opening invitation" />;

  if (!event) {
    // RLS only exposes published events to anonymous visitors, so a draft
    // event and a nonexistent slug are indistinguishable here on purpose —
    // a draft's existence shouldn't leak to a stranger with a guessed link.
    return <StatusScreen emoji="🔍" title="Invitation not found" body="This invitation link doesn't exist or may have been removed." />;
  }

  const theme = resolveTheme(event.invitation.theme);
  // Pro; the database blocks adding it below Pro, and this also hides it
  // if an event's plan later drops.
  const music = planAllows(event.ownerPlan, "music") && event.invitation.music?.url.trim() ? event.invitation.music : null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.palette.background }}>
      {/* Full width, like the hosts' own website: panels run edge to edge
          and SectionList's site mode keeps the content itself in a
          readable column. */}
      <div>
        {/* Always mounted underneath the gate, so opening the envelope
            reveals the real page instantly instead of loading it in. */}
        <EnvelopeIntro event={event} theme={theme} guestName={guestName} />
        <SectionList
          invitation={event.invitation}
          event={event}
          interactive
          onEventUpdated={setEvent}
          guestId={guestId}
          showWatermark={event.ownerPlan === "free"}
          site
        />
        {music && <MusicPlayer url={music.url} title={music.title} theme={theme} />}
      </div>
    </div>
  );
}

function StatusScreen({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: T.cream }}>
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">{emoji}</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: T.charcoal }}>{title}</h1>
        <p className="text-sm" style={{ color: T.muted }}>{body}</p>
      </div>
    </div>
  );
}
