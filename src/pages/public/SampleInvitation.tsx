import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SectionList } from "../../components/invitation/SectionList";
import { EnvelopeIntro } from "../../components/invitation/EnvelopeIntro";
import MusicPlayer from "../../components/invitation/MusicPlayer";
import { resolveTheme } from "../../components/invitation/theme";
import { TEMPLATE_PREVIEWS } from "../../data/landing-template-previews";
import type { EventRecord } from "../../lib/events-store";
import type { InvitationConfig } from "../../types/models";

const DEFAULT_SAMPLE = "Elegant Garden";

// Sample media, so visitors can try the Pro video section and background
// music. Keep the credits line below in step with this.
//  - Music: "Clair de lune" (Debussy), piano by Laurens Goedhart, 2011 —
//    public domain, via Wikimedia Commons; served from public/audio.
//  - Video: Jake Miller's official "Lucky Me (The proposal)" music video,
//    shown through YouTube's own player (the channel allows embedding).
const SAMPLE_MUSIC = { url: "/audio/clair-de-lune.mp3", title: "Clair de lune — Debussy" };
const SAMPLE_VIDEOS = [{ url: "https://www.youtube.com/watch?v=XysLGnlSjE0", title: "The proposal" }];
const SAMPLE_CREDITS = [
  { label: "Music: \"Clair de lune\" by Claude Debussy, performed by Laurens Goedhart (public domain)", href: "https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg" },
  { label: "Video: \"Lucky Me (The proposal)\" by Jake Miller, via YouTube", href: "https://www.youtube.com/watch?v=XysLGnlSjE0" },
];

// /sample — a complete invitation anyone can open from the landing page,
// exactly as a guest would see it (envelope, countdown, gallery, RSVP),
// built from a template's sample content. Nothing here touches the
// database: the RSVP runs in demo mode and saves nothing. ?template=<name>
// shows another template's sample.
export default function SampleInvitationPage() {
  const [params] = useSearchParams();
  const seed = TEMPLATE_PREVIEWS[params.get("template") ?? ""] ?? TEMPLATE_PREVIEWS[DEFAULT_SAMPLE];

  // Shown with Pro features (a reply-by date and a custom question on the
  // RSVP, a video section, background music), so visitors see what they get.
  const event: EventRecord = { ...seed.event, slug: "sample", ownerPlan: "pro", plan: "pro" };
  const replyBy = new Date(`${event.date}T00:00:00Z`);
  replyBy.setUTCDate(replyBy.getUTCDate() - 30);
  const invitation: InvitationConfig = {
    ...seed.invitation,
    music: SAMPLE_MUSIC,
    sections: seed.invitation.sections.map((s) =>
      s.type === "rsvp"
        ? { ...s, content: { ...s.content, deadline: replyBy.toISOString().slice(0, 10), questions: [{ id: "song", label: "Any song requests for the dance floor?", type: "text" }] } }
        : s.type === "video"
          ? { ...s, enabled: true, content: { ...s.content, heading: event.category === "wedding" ? "Our Film" : "A Little Glimpse", videos: SAMPLE_VIDEOS } }
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
      <div className="px-6 pt-8 text-center text-[11px] leading-relaxed space-y-0.5" style={{ color: theme.palette.text, opacity: 0.6 }}>
        <p className="font-semibold">Sample media</p>
        {SAMPLE_CREDITS.map((c) => (
          <p key={c.href}>
            <a href={c.href} target="_blank" rel="noopener noreferrer" className="underline">
              {c.label}
            </a>
          </p>
        ))}
      </div>
      {/* Room to scroll the last lines clear of the bar and music button below. */}
      <div className="h-36" aria-hidden="true" />
      {/* Above the call-to-action bar, which spans the bottom on phones. */}
      <MusicPlayer url={SAMPLE_MUSIC.url} title={SAMPLE_MUSIC.title} theme={theme} bottom="5.25rem" />
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
