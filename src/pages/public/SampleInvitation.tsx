import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SectionList } from "../../components/invitation/SectionList";
import { EnvelopeIntro } from "../../components/invitation/EnvelopeIntro";
import { resolveTheme } from "../../components/invitation/theme";
import { TEMPLATE_PREVIEWS } from "../../data/landing-template-previews";
import type { EventRecord } from "../../lib/events-store";
import type { InvitationConfig } from "../../types/models";

const DEFAULT_SAMPLE = "Elegant Garden";

// /sample — a complete invitation anyone can open from the landing page,
// exactly as a guest would see it (envelope, countdown, gallery, RSVP),
// built from a template's sample content. Nothing here touches the
// database: the RSVP runs in demo mode and saves nothing. ?template=<name>
// shows another template's sample.
export default function SampleInvitationPage() {
  const [params] = useSearchParams();
  const seed = TEMPLATE_PREVIEWS[params.get("template") ?? ""] ?? TEMPLATE_PREVIEWS[DEFAULT_SAMPLE];

  // Shown with Pro features (a reply-by date and a custom question), so
  // visitors see what the RSVP can do.
  const event: EventRecord = { ...seed.event, slug: "sample", ownerPlan: "pro", plan: "pro" };
  const replyBy = new Date(`${event.date}T00:00:00Z`);
  replyBy.setUTCDate(replyBy.getUTCDate() - 30);
  const invitation: InvitationConfig = {
    ...seed.invitation,
    sections: seed.invitation.sections.map((s) =>
      s.type === "rsvp"
        ? { ...s, content: { ...s.content, deadline: replyBy.toISOString().slice(0, 10), questions: [{ id: "song", label: "Any song requests for the dance floor?", type: "text" }] } }
        : s,
    ),
  };
  const theme = resolveTheme(invitation.theme);

  useEffect(() => {
    const previous = document.title;
    document.title = `Sample invitation · Invyta`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.palette.background }}>
      <EnvelopeIntro event={event} theme={theme} />
      <SectionList invitation={invitation} event={event} interactive={false} demo showWatermark={false} site />
      {/* Room to scroll the last lines clear of the bar below. */}
      <div className="h-24" aria-hidden="true" />
      {/* Below the envelope gate (z-50), so it appears once it's opened. */}
      <div className="fixed z-40 left-0 right-0 bottom-0 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pointer-events-none">
        <div
          className="pointer-events-auto mx-auto max-w-md flex items-center justify-between gap-3 rounded-2xl pl-4 pr-2 py-2"
          style={{ backgroundColor: "#1C2942", color: "#FFFFFF", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}
        >
          <span className="text-xs leading-snug">
            A sample invitation made with <strong>Invyta</strong>
          </span>
          <Link to="/register" className="flex-shrink-0 text-xs font-semibold px-3.5 py-2 rounded-xl" style={{ backgroundColor: "#FFFFFF", color: "#1C2942" }}>
            Make yours — free
          </Link>
        </div>
      </div>
    </div>
  );
}
