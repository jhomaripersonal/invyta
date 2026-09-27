import { useEffect, useId, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { EventRecord } from "../../lib/events-store";
import type { InvitationConfig, InvitationSection, InvitationSectionType } from "../../types/models";
import { resolveTheme, type ResolvedTheme } from "./theme";
import {
  CoverSection,
  CountdownSection,
  DetailsSection,
  StorySection,
  ScheduleSection,
  VenueSection,
  GallerySection,
  DressCodeSection,
  EntourageSection,
  GiftRegistrySection,
  FaqSection,
  RsvpSection,
  sectionHasContent,
  type SectionProps,
} from "./sections";

const RENDERERS: Record<InvitationSectionType, (props: SectionProps) => ReactElement | null> = {
  cover: CoverSection,
  countdown: CountdownSection,
  details: DetailsSection,
  story: StorySection,
  schedule: ScheduleSection,
  venue: VenueSection,
  gallery: GallerySection,
  dress_code: DressCodeSection,
  entourage: EntourageSection,
  gift_registry: GiftRegistrySection,
  faq: FaqSection,
  rsvp: RsvpSection,
};

export const SECTION_LABELS: Record<InvitationSectionType, string> = {
  cover: "Cover",
  countdown: "Countdown",
  details: "Details",
  story: "Story",
  schedule: "Schedule",
  venue: "Venue",
  gallery: "Gallery",
  dress_code: "Dress Code",
  entourage: "Entourage",
  gift_registry: "Gift Registry",
  faq: "FAQ",
  rsvp: "RSVP",
};

interface SectionListProps {
  invitation: InvitationConfig;
  event: EventRecord;
  interactive?: boolean;
  onEventUpdated?: (e: EventRecord) => void;
  highlightType?: InvitationSectionType | null;
  guestId?: string;
  // Free-plan watermark — a tiled diagonal "Invyta" pattern over the whole
  // invitation plus a "Made with Invyta" credit at the bottom — shown to
  // guests on the published invitation (and to the organizer in the
  // Builder preview) until they upgrade. Defaults to true so a caller that
  // forgets to pass it fails toward showing the watermark rather than
  // silently giving a free event a paid-looking page.
  showWatermark?: boolean;
  // Height of "one screen" for the Story and Split layouts. Defaults to the
  // browser viewport (the public page); previews pass their own pane's
  // visible height (see useScrollportHeight).
  screenHeight?: string;
}

// Section types with a numbered eyebrow label above their heading — cover,
// countdown, and rsvp are chrome/CTA sections, not "content", so they're
// excluded from the count.
const NUMBERED_TYPES = new Set<InvitationSectionType>([
  "details", "story", "schedule", "venue", "gallery", "dress_code", "entourage", "gift_registry", "faq",
]);

// Each section fades up into place the first time it's on screen — the
// cover included, so a guest opening the link gets a gentle entrance too,
// not just guests scrolling further down. `once: true` so re-scrolling
// past a section (or, in the builder, re-rendering while editing content —
// same React key, so this never remounts on a keystroke) doesn't replay it.
const EASE = [0.22, 1, 0.36, 1] as const;
const sectionReveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: EASE },
} as const;

// One enabled section, resolved for rendering: whether it will actually
// show anything, and its eyebrow numeral.
interface PlannedSection {
  section: InvitationSection;
  willRender: boolean;
  index?: number;
}

// Subtle paper grain for the Stationery layout — generated SVG noise, so
// there's no texture image to download and it tints to any palette.
const PAPER_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function SectionList({ invitation, event, interactive = true, onEventUpdated, highlightType, guestId, showWatermark = true, screenHeight = "100svh" }: SectionListProps) {
  const theme = resolveTheme(invitation.theme);
  const ordered = [...invitation.sections].filter((s) => s.enabled).sort((a, b) => a.order - b.order);

  // Numerals skip a section that will render nothing (e.g. an enabled-but-
  // empty Details, or a Countdown whose date has passed), so an invisible
  // section never eats a numeral.
  let contentIdx = 0;
  const planned: PlannedSection[] = ordered.map((section) => {
    const willRender = section.type === "cover" || sectionHasContent(section.type, section.content, event);
    const index = NUMBERED_TYPES.has(section.type) && willRender ? ++contentIdx : undefined;
    return { section, willRender, index };
  });

  const highlight = (type: InvitationSectionType) =>
    highlightType === type ? { outline: `2px dashed ${theme.palette.primary}`, outlineOffset: "-2px" } : undefined;

  function renderContent({ section, index }: PlannedSection, fill?: SectionProps["fill"]) {
    if (section.type === "rsvp") {
      return (
        <div className="px-6 py-10">
          <RsvpSection content={section.content} event={event} theme={theme} interactive={interactive} onEventUpdated={onEventUpdated} guestId={guestId} />
        </div>
      );
    }
    const Renderer = RENDERERS[section.type];
    return <Renderer content={section.content} event={event} theme={theme} index={index} fill={fill} />;
  }

  // Classic (and the fallback for any layout): stacked sections with
  // alternating panel backgrounds for rhythm — the cover's own photo needs
  // no background. Returns the stack plus the final panel count, so the
  // watermark footer can continue the alternation.
  function classicStack(items: PlannedSection[], editorial = false) {
    let panelIdx = 0;
    const nodes = items.map((item) => {
      const { section, willRender } = item;
      const isCover = section.type === "cover";
      // Editorial runs on one continuous page color, with a hairline rule
      // opening each content section instead of alternating panels.
      const bg = isCover ? undefined : editorial ? theme.palette.background : panelIdx % 2 === 0 ? theme.palette.background : theme.palette.surface;
      if (!isCover && willRender) panelIdx++;
      const ruled = editorial && willRender && item.index != null;
      return (
        <motion.div key={section.type} {...sectionReveal} style={{ backgroundColor: bg, ...highlight(section.type) }}>
          {ruled && <div className="mx-6" style={{ borderTop: `1px solid ${theme.palette.text}26` }} />}
          {renderContent(item)}
        </motion.div>
      );
    });
    return { nodes, panelCount: editorial ? 0 : panelIdx };
  }

  let body: ReactNode;
  let footerBg = theme.palette.background;
  const cover = planned.find((p) => p.section.type === "cover");

  if (theme.layout === "stationery") {
    // The whole invitation printed on one card: textured paper backdrop,
    // double hairline border with corner flourishes, small ornaments
    // between sections instead of alternating panels.
    const visible = planned.filter((p) => p.willRender);
    body = (
      <div className="px-3 py-6 @lg/page:px-8 @lg/page:py-10" style={{ backgroundColor: theme.palette.surface, backgroundImage: PAPER_GRAIN }}>
        <div className="relative mx-auto max-w-[640px]" style={{ backgroundColor: theme.palette.background, backgroundImage: PAPER_GRAIN, boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
          <div className="absolute inset-2.5 pointer-events-none" style={{ border: `1px solid ${theme.palette.primary}59` }} />
          <div className="absolute inset-4 pointer-events-none" style={{ border: `1px solid ${theme.palette.primary}26` }} />
          {([0, 90, 180, 270] as const).map((deg) => <CornerOrnament key={deg} rotate={deg} color={theme.palette.primary} />)}
          <div className="relative px-5 py-7">
            {visible.map((item, i) => (
              <motion.div key={item.section.type} {...sectionReveal} style={highlight(item.section.type)}>
                {i > 0 && <OrnamentDivider color={theme.palette.primary} />}
                {item.section.type === "cover" ? <div className="overflow-hidden">{renderContent(item)}</div> : renderContent(item)}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    );
    footerBg = theme.palette.surface;
  } else if (theme.layout === "story") {
    // One full-screen panel per section, like swiping through stories —
    // only sections with something to show get a panel, so an empty one
    // never leaves a blank screen.
    const visible = planned.filter((p) => p.willRender);
    body = <StoryPanels items={visible} theme={theme} highlight={highlight} renderContent={renderContent} />;
    footerBg = visible.length % 2 === 0 ? theme.palette.surface : theme.palette.background;
  } else if (theme.layout === "split" && cover) {
    // Wide screens: the cover stays pinned in the left column while the
    // rest scrolls on the right. Narrow screens stack exactly like Classic.
    const rest = planned.filter((p) => p !== cover);
    const { nodes, panelCount } = classicStack(rest);
    body = (
      <div className="@2xl/page:grid @2xl/page:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] @2xl/page:items-start">
        <div className="@2xl/page:sticky @2xl/page:top-0 @2xl/page:h-[var(--invite-screen)]" style={highlight("cover")}>
          {renderContent(cover, "wide")}
        </div>
        <div>{nodes}</div>
      </div>
    );
    footerBg = panelCount % 2 === 0 ? theme.palette.background : theme.palette.surface;
  } else {
    const { nodes, panelCount } = classicStack(planned, theme.layout === "editorial");
    body = nodes;
    footerBg = panelCount % 2 === 0 ? theme.palette.background : theme.palette.surface;
  }

  return (
    <div
      className="@container/page relative"
      style={{ fontFamily: theme.fonts.bodyFont, backgroundColor: theme.palette.background, ["--invite-screen" as string]: screenHeight }}
    >
      {body}
      {showWatermark && (
        <div className="px-6 py-4 text-center" style={{ backgroundColor: footerBg, borderTop: `1px solid ${theme.palette.text}1F` }}>
          <Watermark interactive={interactive} theme={theme} />
        </div>
      )}
      {showWatermark && <WatermarkPattern theme={theme} />}
    </div>
  );
}

// Story layout: full-height panels with alternating backgrounds, a
// stronger entrance per panel, and a progress rail of dots pinned to the
// right edge that tracks which panel is on screen (tap a dot to jump).
function StoryPanels({ items, theme, highlight, renderContent }: {
  items: PlannedSection[];
  theme: ResolvedTheme;
  highlight: (type: InvitationSectionType) => CSSProperties | undefined;
  renderContent: (item: PlannedSection, fill?: SectionProps["fill"]) => ReactNode;
}) {
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.panel));
        }
      },
      { threshold: 0.5 },
    );
    panelRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [items.length]);

  return (
    <div className="relative">
      {items.map((item, i) => {
        const isCover = item.section.type === "cover";
        return (
          <div
            key={item.section.type}
            ref={(el) => { panelRefs.current[i] = el; }}
            data-panel={i}
            className={isCover ? "h-[var(--invite-screen)]" : "min-h-[var(--invite-screen)] flex flex-col justify-center"}
            style={{ backgroundColor: isCover ? undefined : i % 2 === 0 ? theme.palette.surface : theme.palette.background, ...highlight(item.section.type) }}
          >
            {isCover ? (
              renderContent(item, "always")
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 24 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.7, ease: EASE }}
              >
                {renderContent(item)}
              </motion.div>
            )}
          </div>
        );
      })}
      {items.length > 1 && (
        <div className="absolute top-0 bottom-0 right-2.5 pointer-events-none z-[5]">
          <div className="sticky top-1/2 -translate-y-1/2 flex flex-col gap-2 pointer-events-auto">
            {items.map((item, i) => (
              <button
                key={item.section.type}
                type="button"
                aria-label={`Go to ${SECTION_LABELS[item.section.type]}`}
                onClick={() => panelRefs.current[i]?.scrollIntoView({ behavior: "smooth" })}
                className="w-1.5 rounded-full transition-all"
                style={{ height: i === active ? 18 : 6, backgroundColor: theme.palette.primary, opacity: i === active ? 0.9 : 0.35 }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Corner flourish for the Stationery card, drawn for the top-left corner
// and rotated into place for the other three.
function CornerOrnament({ rotate, color }: { rotate: 0 | 90 | 180 | 270; color: string }) {
  const position = { 0: "top-1.5 left-1.5", 90: "top-1.5 right-1.5", 180: "bottom-1.5 right-1.5", 270: "bottom-1.5 left-1.5" }[rotate];
  return (
    <svg className={`absolute ${position} pointer-events-none`} width="44" height="44" viewBox="0 0 44 44" fill="none" style={{ transform: `rotate(${rotate}deg)` }} aria-hidden="true">
      <path d="M3 41V15C3 8.4 8.4 3 15 3h26" stroke={color} strokeOpacity="0.7" />
      <path d="M9 41V21c0-6.6 5.4-12 12-12h20" stroke={color} strokeOpacity="0.35" />
      <circle cx="15" cy="15" r="2.2" fill={color} fillOpacity="0.7" />
    </svg>
  );
}

function OrnamentDivider({ color }: { color: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-2" aria-hidden="true">
      <span className="w-12 h-px" style={{ backgroundColor: color, opacity: 0.4 }} />
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M5 0l5 5-5 5-5-5z" fill={color} fillOpacity="0.6" />
      </svg>
      <span className="w-12 h-px" style={{ backgroundColor: color, opacity: 0.4 }} />
    </div>
  );
}

// Repeating diagonal "Invyta" text across the full height of the
// invitation, like a watermarked document. An inline SVG <pattern> rather
// than a CSS background image, so it can use the theme's own heading font
// (a background-image SVG can't see the page's web fonts). Mid-grey at low
// opacity so it reads on both light panels and dark cover photos, and
// pointer-events: none so every button, form field and photo underneath
// keeps working. Two words per tile, offset by half a tile, for a
// staggered brick layout instead of rigid columns.
function WatermarkPattern({ theme }: { theme: ResolvedTheme }) {
  const patternId = `invyta-watermark-${useId().replace(/:/g, "")}`;
  const textProps = {
    fill: "#808080",
    fillOpacity: 0.16,
    fontFamily: theme.fonts.headingFont,
    fontStyle: "italic",
    fontSize: 30,
    textAnchor: "middle" as const,
    dominantBaseline: "middle" as const,
  };
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none select-none z-10" aria-hidden="true">
      <defs>
        <pattern id={patternId} width="240" height="180" patternUnits="userSpaceOnUse">
          <text x="60" y="45" transform="rotate(-30 60 45)" {...textProps}>Invyta</text>
          <text x="180" y="135" transform="rotate(-30 180 135)" {...textProps}>Invyta</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

function Watermark({ interactive, theme }: { interactive: boolean; theme: ResolvedTheme }) {
  const body = (
    <p className="text-xs font-medium" style={{ color: theme.palette.text, opacity: 0.7 }}>
      Made with <span style={{ fontFamily: theme.fonts.headingFont, fontStyle: "italic", color: theme.palette.primary }}>Invyta</span>
      {" · "}Create your own free invitation
    </p>
  );
  if (!interactive) return body;
  return (
    <a href="/register" className="inline-block hover:opacity-80 transition-opacity">
      {body}
    </a>
  );
}
