import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useEvents, type EventRecord } from "../../lib/events-store";
import { SectionList } from "../../components/invitation/SectionList";
import { EnvelopeIntro } from "../../components/invitation/EnvelopeIntro";
import { resolveTheme } from "../../components/invitation/theme";

const T = { cream: "#FAF8F5", charcoal: "#1C2942", muted: "#78716C" };

export default function PublicInvitationPage() {
  const { slug, guestId } = useParams<{ slug: string; guestId?: string }>();
  const { getEventBySlug } = useEvents();
  const [event, setEvent] = useState<EventRecord | null | "loading">("loading");

  useEffect(() => {
    if (!slug) return;
    setEvent("loading");
    getEventBySlug(slug).then(setEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (event === "loading") return null;

  if (!event) {
    // RLS only exposes published events to anonymous visitors, so a draft
    // event and a nonexistent slug are indistinguishable here on purpose —
    // a draft's existence shouldn't leak to a stranger with a guessed link.
    return <StatusScreen emoji="🔍" title="Invitation not found" body="This invitation link doesn't exist or may have been removed." />;
  }

  const theme = resolveTheme(event.invitation.theme);

  return (
    <div style={{ backgroundColor: theme.palette.background }}>
      {/* Same three width buckets as the Invitation Builder's own device
          preview (380/700/1040) and the landing page's template preview
          modal, but picked by the visitor's actual viewport via breakpoints
          instead of a manual toggle — so a guest opening the link on a
          tablet or desktop browser isn't stuck looking at a phone-width
          strip in the middle of their screen. */}
      <div className="max-w-lg md:max-w-[700px] xl:max-w-[1040px] mx-auto min-h-screen" style={{ backgroundColor: "#FFFFFF" }}>
        {/* Always mounted underneath the gate, so opening the envelope
            reveals the real page instantly instead of loading it in. */}
        <EnvelopeIntro event={event} theme={theme} />
        <SectionList
          invitation={event.invitation}
          event={event}
          interactive
          onEventUpdated={setEvent}
          guestId={guestId}
          showWatermark={event.ownerPlan === "free"}
        />
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
