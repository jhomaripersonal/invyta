import { useEffect, useId, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { EventRecord } from "../../lib/events-store";
import type { InvitationConfig, InvitationSection, InvitationSectionType } from "../../types/models";
import { buttonRadiusClass, buttonStyleProps, resolveTheme, type ResolvedTheme } from "./theme";
import { formatLongDate, formatTime } from "./format";
import { categoryProfile, type SectionCopy } from "../../data/category-profiles";
import {
  CoverSection,
  CountdownSection,
  DetailsSection,
  StorySection,
  ScheduleSection,
  VenueSection,
  GallerySection,
  VideoSection,
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
  video: VideoSection,
  dress_code: DressCodeSection,
  entourage: EntourageSection,
  gift_registry: GiftRegistrySection,
  faq: FaqSection,
  rsvp: RsvpSection,
};

interface SectionListProps {
  invitation: InvitationConfig;
  event: EventRecord;
  interactive?: boolean;
  onEventUpdated?: (e: EventRecord) => void;
  highlightType?: InvitationSectionType | null;
  guestId?: string;
  // The public sample invitation (/sample): RSVP works but saves nothing.
  demo?: boolean;
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
  // Present the invitation as the hosts' own website: sticky top bar with
  // section links and RSVP, full-screen hero, readable content column on
  // full-width panels, site footer. Used by the public page and the
  // previews; off for small embedded mockups.
  site?: boolean;
}

// Section types with a numbered eyebrow label above their heading — cover,
// countdown, and rsvp are chrome/CTA sections, not "content", so they're
// excluded from the count.
const NUMBERED_TYPES = new Set<InvitationSectionType>([
  "details", "story", "schedule", "venue", "gallery", "video", "dress_code", "entourage", "gift_registry", "faq",
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

export function SectionList({ invitation, event, interactive = true, onEventUpdated, highlightType, guestId, demo = false, showWatermark = true, screenHeight = "100svh", site = false }: SectionListProps) {
  const theme = resolveTheme(invitation.theme);
  // Section names follow the event's category (a wake's Story is "Tribute").
  const copy = categoryProfile(event.category).sections;
  // Per-instance prefix for section anchors, so two invitations on one page
  // (e.g. a preview modal over the landing page) never share ids.
  const anchorPrefix = `inv-${useId().replace(/:/g, "")}`;
  const anchorId = (type: InvitationSectionType) => `${anchorPrefix}-${type}`;
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
    let node: ReactNode;
    if (section.type === "rsvp") {
      node = (
        <div className="px-6 py-10">
          <RsvpSection content={section.content} event={event} theme={theme} interactive={interactive} onEventUpdated={onEventUpdated} guestId={guestId} demo={demo} />
        </div>
      );
    } else {
      const Renderer = RENDERERS[section.type];
      node = <Renderer content={section.content} event={event} theme={theme} index={index} fill={fill} />;
    }
    if (!site) return node;
    // Site mode: every section is an anchor the top bar can scroll to (clear
    // of the sticky bar), and content sits in a readable column — a bit
    // wider for the gallery — while its panel stays full width.
    const isCover = section.type === "cover";
    return (
      <div id={anchorId(section.type)} className={isCover ? "h-full" : ""} style={{ scrollMarginTop: "var(--invite-nav)" }}>
        {isCover ? node : <div className={section.type === "gallery" ? "max-w-5xl mx-auto" : "max-w-3xl mx-auto"}>{node}</div>}
      </div>
    );
  }

  // Site mode: the cover is a full-screen hero (minus the top bar).
  const heroClass = "h-[calc(var(--invite-screen)-var(--invite-nav))]";

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
        <motion.div key={section.type} {...sectionReveal} className={site && isCover ? heroClass : undefined} style={{ backgroundColor: bg, ...highlight(section.type) }}>
          {ruled && <div className={site ? "max-w-3xl mx-auto px-6" : "mx-6"}><div style={{ borderTop: `1px solid ${theme.palette.text}26` }} /></div>}
          {renderContent(item, site && isCover ? "always" : undefined)}
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
    body = <StoryPanels items={visible} theme={theme} copy={copy} highlight={highlight} renderContent={renderContent} />;
    footerBg = visible.length % 2 === 0 ? theme.palette.surface : theme.palette.background;
  } else if (theme.layout === "split" && cover) {
    // Wide screens: the cover stays pinned in the left column while the
    // rest scrolls on the right. Narrow screens stack exactly like Classic.
    const rest = planned.filter((p) => p !== cover);
    const { nodes, panelCount } = classicStack(rest);
    body = (
      <div className="@2xl/page:grid @2xl/page:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] @2xl/page:items-start">
        <div className="@2xl/page:sticky @2xl/page:top-[var(--invite-nav)] @2xl/page:h-[calc(var(--invite-screen)-var(--invite-nav))]" style={highlight("cover")}>
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

  const coverTitle = (typeof cover?.section.content.title === "string" && cover.section.content.title.trim()) || event.name;
  const navLinks = planned
    .filter((p) => p.willRender && NAV_TYPES.includes(p.section.type))
    .map((p) => ({ id: anchorId(p.section.type), label: copy[p.section.type].short ?? copy[p.section.type].name }));
  const hasRsvp = planned.some((p) => p.section.type === "rsvp");
  const topId = anchorId(cover ? "cover" : planned[0]?.section.type ?? "cover");

  return (
    <div
      className="@container/page relative"
      style={{
        fontFamily: theme.fonts.bodyFont,
        backgroundColor: theme.palette.background,
        // Native form controls (RSVP inputs, selects) follow the palette.
        colorScheme: theme.palette.dark ? "dark" : "light",
        ["--invite-screen" as string]: screenHeight,
        ["--invite-nav" as string]: site ? `${SITE_NAV_HEIGHT}px` : "0px",
      }}
    >
      {site && <SiteNav brand={coverTitle} links={navLinks} rsvpId={hasRsvp ? anchorId("rsvp") : undefined} topId={topId} theme={theme} />}
      {body}
      {site && <SiteFooter title={coverTitle} event={event} theme={theme} topId={topId} bg={footerBg} />}
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
function StoryPanels({ items, theme, copy, highlight, renderContent }: {
  items: PlannedSection[];
  theme: ResolvedTheme;
  copy: Record<InvitationSectionType, SectionCopy>;
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
            className={isCover ? "h-[calc(var(--invite-screen)-var(--invite-nav))]" : "min-h-[calc(var(--invite-screen)-var(--invite-nav))] flex flex-col justify-center"}
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
                aria-label={`Go to ${copy[item.section.type].name}`}
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

// ─── Website chrome (site mode) ──────────────────────────────────────────
// With `site`, the invitation presents as the hosts' own website: a sticky
// top bar (monogram/name, links to the sections that have content, an RSVP
// button; a menu on narrow screens), a full-screen hero cover, content in
// a readable column on full-width panels, and a site footer.

// Sections worth a link in the top bar (cover/countdown/rsvp are the page
// itself, the hero, and the call to action).
const NAV_TYPES: InvitationSectionType[] = ["details", "story", "schedule", "venue", "gallery", "video", "entourage", "dress_code", "gift_registry", "faq"];

export const SITE_NAV_HEIGHT = 56;

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function SiteNav({ brand, links, rsvpId, topId, theme }: {
  brand: string;
  links: { id: string; label: string }[];
  rsvpId?: string;
  topId: string;
  theme: ResolvedTheme;
}) {
  const [open, setOpen] = useState(false);
  const go = (id: string) => {
    setOpen(false);
    scrollToSection(id);
  };
  const linkColor = { color: theme.palette.text };

  return (
    <nav
      className="sticky top-0 z-20"
      style={{ height: SITE_NAV_HEIGHT, backgroundColor: `${theme.palette.background}EB`, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderBottom: `1px solid ${theme.palette.text}1F` }}
      aria-label="Invitation"
    >
      <div className="h-full max-w-6xl mx-auto px-5 flex items-center justify-between gap-4">
        <button onClick={() => go(topId)} className="text-lg truncate min-w-0" style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.text }}>
          {brand}
        </button>

        <div className="hidden @3xl/page:flex items-center gap-5 min-w-0">
          {links.map((l) => (
            <button key={l.id} onClick={() => go(l.id)} className="text-[13px] font-medium whitespace-nowrap hover:opacity-70 transition-opacity" style={linkColor}>
              {l.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {rsvpId && (
            <button
              onClick={() => go(rsvpId)}
              className={`px-4 py-2 text-xs font-semibold ${buttonRadiusClass(theme.buttonStyle)}`}
              style={buttonStyleProps(theme.buttonStyle, theme.palette)}
            >
              RSVP
            </button>
          )}
          {links.length > 0 && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="@3xl/page:hidden w-9 h-9 flex items-center justify-center rounded-lg"
              style={linkColor}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                {open ? <path d="M4 4l10 10M14 4L4 14" /> : <path d="M3 5h12M3 9h12M3 13h12" />}
              </svg>
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="@3xl/page:hidden absolute left-0 right-0 top-full py-2 shadow-lg" style={{ backgroundColor: theme.palette.background, borderBottom: `1px solid ${theme.palette.text}1F` }}>
          {links.map((l) => (
            <button key={l.id} onClick={() => go(l.id)} className="block w-full text-left px-5 py-3 text-sm" style={linkColor}>
              {l.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}

function SiteFooter({ title, event, theme, topId, bg }: { title: string; event: EventRecord; theme: ResolvedTheme; topId: string; bg: string }) {
  const time = formatTime(event);
  const where = [event.venueName, event.venueAddress].filter(Boolean).join(", ");
  return (
    <footer className="px-6 py-12 text-center" style={{ backgroundColor: bg, borderTop: `1px solid ${theme.palette.text}1F` }}>
      <div className="text-2xl mb-2" style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.text }}>{title}</div>
      <p className="text-sm" style={{ color: theme.palette.text, opacity: 0.7 }}>
        {formatLongDate(event)}{time ? ` · ${time}` : ""}
      </p>
      {where && <p className="text-sm mt-0.5" style={{ color: theme.palette.text, opacity: 0.7 }}>{where}</p>}
      <button onClick={() => scrollToSection(topId)} className="text-xs font-semibold mt-6 underline" style={{ color: theme.palette.primary }}>
        Back to top
      </button>
    </footer>
  );
}
