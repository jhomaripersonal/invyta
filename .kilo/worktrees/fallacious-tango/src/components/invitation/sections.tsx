import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import type { EventRecord } from "../../lib/events-store";
import { useGuests, type PersonalGuestInfo } from "../../lib/guests-store";
import { useEvents } from "../../lib/events-store";
import { guestQrPayload } from "../../lib/guest-qr";
import { planAllows } from "../../data/plan-limits";
import { galleryFilter, galleryFilterStyle, galleryLayout } from "../../data/gallery-styles";
import { QrCode } from "../QrCode";
import { Icon, type IconName } from "../Icon";
import type { ResolvedTheme } from "./theme";
import { alignClass, buttonRadiusClass, buttonStyleProps, isEditorial, measureClass } from "./theme";
import { coverStyle } from "../../data/page-layouts";
import { sectionStyle } from "../../data/section-styles";
import { categoryLabel, eventDateTime, formatLongDate, formatTime } from "./format";
import type { InvitationSectionType } from "../../types/models";

const EASE = [0.22, 1, 0.36, 1] as const;

export interface SectionProps {
  content: Record<string, unknown>;
  event: EventRecord;
  theme: ResolvedTheme;
  // 1-based position among enabled "content" sections (skips cover, countdown,
  // rsvp) — used only for the small roman-numeral eyebrow above a heading.
  index?: number;
  // Cover only: whether the page layout stretches it to fill its container
  // (see fillClass below).
  fill?: "always" | "wide";
}

function str(content: Record<string, unknown>, key: string, fallback = ""): string {
  const v = content[key];
  return typeof v === "string" ? v : fallback;
}

function list<T>(content: Record<string, unknown>, key: string): T[] {
  const v = content[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// Mirrors each numbered section's own "nothing to show" guard clause, so
// SectionList can skip an empty-but-enabled section when assigning eyebrow
// numerals — otherwise an empty Details section (enabled by default) would
// silently consume "I", and the next visible section would read "II" with
// no "I" ever shown.
export function sectionHasContent(type: InvitationSectionType, content: Record<string, unknown>, event: EventRecord): boolean {
  switch (type) {
    case "details":
    case "dress_code":
      return !!str(content, "description");
    case "story":
      return !!str(content, "body");
    case "schedule":
      return list(content, "items").length > 0;
    case "venue":
      return !!(str(content, "name") || str(content, "address"));
    case "gallery":
      return list<string>(content, "imageUrls").filter(Boolean).length > 0;
    case "entourage":
      return list<{ role?: string; names?: string }>(content, "groups").some((g) => g.role || g.names);
    case "gift_registry":
      return !!str(content, "message") || list<{ url?: string }>(content, "links").some((l) => l.url);
    case "faq":
      return list<{ question?: string }>(content, "items").some((i) => i.question);
    case "countdown": {
      const target = eventDateTime(event);
      return !Number.isNaN(target.getTime()) && target.getTime() > Date.now();
    }
    default:
      return true;
  }
}

// ─── Shared "editorial invitation" chrome ────────────────────────────────
// A small set of typographic devices borrowed from professionally designed
// wedding invitation sites (numbered eyebrow labels, hairline dividers,
// pill CTAs) applied consistently across every section so the invitation
// reads as one deliberately designed piece rather than a stack of generic
// content cards.
function toRoman(n: number): string {
  const table: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let rest = n;
  let out = "";
  for (const [value, symbol] of table) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

function divider(theme: ResolvedTheme) {
  return `1px solid ${theme.palette.text}1F`;
}

function Eyebrow({ label, index, theme }: { label: string; index?: number; theme: ResolvedTheme }) {
  // Editorial: a big "01" numeral set flush-left, magazine-style, in place
  // of the small centered roman numeral.
  if (isEditorial(theme)) {
    return (
      <div className="flex items-baseline gap-3 mb-3">
        {index != null && (
          <span className="text-3xl leading-none" style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.primary }}>
            {String(index).padStart(2, "0")}
          </span>
        )}
        <span className="w-8 h-px self-center" style={{ backgroundColor: theme.palette.primary, opacity: 0.6 }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: theme.palette.text, opacity: 0.55 }}>
          {label}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-2.5 mb-3">
      {index != null && (
        <span className="text-sm italic" style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.primary }}>
          {toRoman(index)}
        </span>
      )}
      <span className="w-6 h-px" style={{ backgroundColor: theme.palette.primary, opacity: 0.6 }} />
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: theme.palette.text, opacity: 0.55 }}>
        {label}
      </span>
    </div>
  );
}

function SectionHeading({ children, theme }: { children: ReactNode; theme: ResolvedTheme }) {
  return (
    <h3
      className={isEditorial(theme) ? "text-[34px] leading-[1.1] text-left mb-6" : "text-[26px] leading-tight text-center mb-5"}
      style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.text }}
    >
      {children}
    </h3>
  );
}

function Accent({ children, theme }: { children: ReactNode; theme: ResolvedTheme }) {
  return (
    <span style={{ fontStyle: "italic", color: theme.palette.primary }}>{children}</span>
  );
}

function IconRing({ name, theme }: { name: IconName; theme: ResolvedTheme }) {
  return (
    <div
      className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ border: `1px solid ${theme.palette.primary}66` }}
    >
      <Icon name={name} size={16} color={theme.palette.primary} />
    </div>
  );
}

// ─── Cover ──────────────────────────────────────────────────────────────
// Four styles, picked on the Cover tab (src/data/page-layouts.ts). `fill`
// comes from the page layout: Story panels fill the cover to a full
// screen ("always"), and Split pins it in a full-height column once the
// invitation is wide enough ("wide"); otherwise each style keeps its own
// natural proportions.
export function CoverSection(props: SectionProps) {
  switch (coverStyle(props.content)) {
    case "framed":
      return <CoverFramed {...props} />;
    case "split":
      return <CoverSideBySide {...props} />;
    case "monogram":
      return <CoverMonogram {...props} />;
    default:
      return <CoverFull {...props} />;
  }
}

// Height classes for a cover given the layout's fill mode. `natural` is
// the style's own sizing when it isn't stretched (e.g. a 4:5 photo).
function fillClass(fill: SectionProps["fill"], natural = ""): string {
  if (fill === "always") return "h-full";
  if (fill === "wide") return `${natural} @2xl/page:aspect-auto @2xl/page:h-full`;
  return natural;
}

// An uploaded cover photo (Invitation Builder, spec's Storage-backed
// image upload) takes precedence over the template's stock Unsplash
// photo picked at event creation.
function coverImageUrl(content: Record<string, unknown>, event: EventRecord, w: number, h: number): string {
  return str(content, "imageUrl") || `https://images.unsplash.com/${event.imageUrl}?w=${w}&h=${h}&fit=crop&auto=format`;
}

// On the Stationery layout the cover sits on the card's textured paper, so
// the non-photo styles drop their own flat background (which would read as
// a pasted-on block) and let the paper show through.
function coverBackground(theme: ResolvedTheme, color: string): string {
  return theme.layout === "stationery" ? "transparent" : color;
}

// Subtitle, title, host line and date — shared by every cover style.
// "light" is for text laid over a photo; "theme" uses the palette.
function CoverText({ content, event, theme, tone }: { content: Record<string, unknown>; event: EventRecord; theme: ResolvedTheme; tone: "light" | "theme" }) {
  const title = str(content, "title", event.name);
  const subtitle = str(content, "subtitle");
  const hostLine = str(content, "hostLine");
  const timeLabel = formatTime(event);
  const light = tone === "light";
  const colors = {
    subtitle: light ? "rgba(255,255,255,0.65)" : theme.palette.primary,
    title: light ? "#FFFFFF" : theme.palette.text,
    host: light ? "rgba(255,255,255,0.85)" : `${theme.palette.text}CC`,
    rule: light ? "rgba(255,255,255,0.4)" : `${theme.palette.primary}80`,
    date: light ? "rgba(255,255,255,0.8)" : `${theme.palette.text}BF`,
  };

  return (
    <div className="text-center">
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-[11px] font-semibold mb-3 uppercase tracking-[0.25em]"
          style={{ color: colors.subtitle }}
        >
          {subtitle}
        </motion.p>
      )}
      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.25 }}
        className="text-[40px] leading-[1.05] mb-2"
        style={{ fontFamily: theme.fonts.headingFont, color: colors.title }}
      >
        {title}
      </motion.h1>
      {hostLine && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="text-base mb-5"
          style={{ fontFamily: theme.fonts.headingFont, fontStyle: "italic", color: colors.host }}
        >
          {hostLine}
        </motion.p>
      )}
      <motion.div
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="w-10 h-px mx-auto mb-4"
        style={{ backgroundColor: colors.rule }}
      />
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.55 }} className="text-sm" style={{ color: colors.date }}>
        {formatLongDate(event)}{timeLabel ? ` · ${timeLabel}` : ""}
      </motion.p>
    </div>
  );
}

function ScrollHint({ color }: { color: string }) {
  return (
    <motion.div
      className="absolute left-1/2 bottom-3 -translate-x-1/2"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0], y: [0, 6, 0, 0] }}
      transition={{ duration: 2.2, delay: 1.2, repeat: Infinity, repeatDelay: 1.4 }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7l5 5 5-5" />
      </svg>
    </motion.div>
  );
}

// Full photo: edge-to-edge image with the title over a dark gradient —
// the original cover.
function CoverFull({ content, event, theme, fill }: SectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Photo drifts slower than the page scrolls (classic parallax) — scoped
  // to this element via `target` rather than the whole document, so it
  // still behaves correctly regardless of where Cover sits in the page.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const parallaxY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);

  return (
    <div ref={ref} className={`relative overflow-hidden ${fillClass(fill, "aspect-[4/5]")}`}>
      <motion.img
        src={coverImageUrl(content, event, 800, 1000)}
        alt={event.name}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ y: parallaxY }}
        initial={{ scale: 1 }}
        animate={{ scale: 1.1 }}
        transition={{ duration: 14, ease: "linear" }}
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(20,16,14,0.88) 30%, rgba(20,16,14,0.15) 100%)" }} />
      <div className="absolute bottom-0 left-0 right-0 p-8 pb-9">
        <CoverText content={content} event={event} theme={theme} tone="light" />
      </div>
      <ScrollHint color="rgba(255,255,255,0.75)" />
    </div>
  );
}

// Arch frame: the photo sits in an arched window with a hairline outline
// echoing it, title below on the page color — a classic wedding look.
function CoverFramed({ content, event, theme, fill }: SectionProps) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center px-8 pt-14 pb-12 ${fillClass(fill)}`}
      style={{ backgroundColor: coverBackground(theme, theme.palette.background) }}
    >
      <motion.div
        className="relative w-full max-w-[260px] mb-9"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE }}
      >
        <div className="absolute -inset-2.5 rounded-t-full" style={{ border: `1px solid ${theme.palette.primary}80` }} />
        <div className="relative aspect-[3/4] rounded-t-full overflow-hidden">
          <motion.img
            src={coverImageUrl(content, event, 600, 800)}
            alt={event.name}
            className="w-full h-full object-cover"
            initial={{ scale: 1.08 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.6, ease: EASE }}
          />
        </div>
      </motion.div>
      <CoverText content={content} event={event} theme={theme} tone="theme" />
    </div>
  );
}

// Side by side: photo and title share the cover — stacked on a phone,
// next to each other once the cover itself is wide enough.
function CoverSideBySide({ content, event, theme, fill }: SectionProps) {
  return (
    <div className={`@container ${fillClass(fill)}`} style={{ backgroundColor: coverBackground(theme, theme.palette.surface) }}>
      <div className="grid @lg:grid-cols-2 h-full">
        <div className="relative aspect-[4/3] @lg:aspect-auto @lg:min-h-[440px] overflow-hidden">
          <motion.img
            src={coverImageUrl(content, event, 800, 900)}
            alt={event.name}
            className="absolute inset-0 w-full h-full object-cover"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
          />
        </div>
        <div className="flex items-center justify-center px-8 py-12">
          <CoverText content={content} event={event} theme={theme} tone="theme" />
        </div>
      </div>
    </div>
  );
}

// "Elena & Marco" → ["E", "M"]; "Isabella's 18th Debut" → ["I"].
function monogramLetters(title: string): string[] {
  const couple = title.split(/\s*(?:&|\+|\band\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  const source = couple.length >= 2 ? couple.slice(0, 2) : [title.trim()];
  return source.map((part) => part.charAt(0).toUpperCase()).filter(Boolean);
}

// Monogram: no photo at all — the hosts' initials in an ornamental ring,
// for organizers without a great cover photo or who want a formal,
// stationery-like opening.
function CoverMonogram({ content, event, theme, fill }: SectionProps) {
  const letters = monogramLetters(str(content, "title", event.name));
  const ring = theme.palette.primary;
  return (
    <div
      className={`relative flex flex-col items-center justify-center px-8 pt-16 pb-14 ${fillClass(fill)}`}
      style={{ backgroundColor: coverBackground(theme, theme.palette.background) }}
    >
      {/* Its own inset frame — skipped on Stationery, whose card already has one. */}
      {theme.layout !== "stationery" && <div className="absolute inset-4 pointer-events-none" style={{ border: `1px solid ${ring}40` }} />}
      <motion.div
        className="relative w-[210px] h-[210px] flex items-center justify-center mb-9"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: EASE }}
      >
        <svg className="absolute inset-0" viewBox="0 0 210 210" fill="none" aria-hidden="true">
          <circle cx="105" cy="105" r="100" stroke={ring} strokeOpacity="0.55" />
          <circle cx="105" cy="105" r="92" stroke={ring} strokeOpacity="0.25" />
          {/* Small leaf sprigs at the four compass points */}
          {[0, 90, 180, 270].map((deg) => (
            <g key={deg} transform={`rotate(${deg} 105 105)`}>
              <path d="M105 1c-4 4-4 8 0 12 4-4 4-8 0-12z" fill={ring} fillOpacity="0.55" />
            </g>
          ))}
        </svg>
        <span className="relative flex items-baseline gap-2" style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.text }}>
          <span className="text-[64px] leading-none">{letters[0]}</span>
          {letters[1] && (
            <>
              <span className="text-3xl italic" style={{ color: theme.palette.primary }}>&amp;</span>
              <span className="text-[64px] leading-none">{letters[1]}</span>
            </>
          )}
        </span>
      </motion.div>
      <CoverText content={content} event={event} theme={theme} tone="theme" />
    </div>
  );
}

// ─── Countdown ──────────────────────────────────────────────────────────
// Styles (src/data/section-styles.ts): "classic" hairline-divided numbers,
// "boxes" with each number on its own tile, "minimal" days-to-go set large.
function timeLeft(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

// Each tick swaps in a fresh element keyed by its value, so every digit
// change gets its own little "flip" pop instead of the number just
// silently updating in place.
function FlipNumber({ value, theme, className }: { value: number; theme: ResolvedTheme; className: string }) {
  return (
    <span className={`relative overflow-hidden ${className}`} style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.text, minWidth: "1.6ch" }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="inline-block"
          initial={{ y: "-40%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "40%", opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          {String(value).padStart(2, "0")}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function CountdownSection({ content, event, theme }: SectionProps) {
  const target = eventDateTime(event);
  const [parts, setParts] = useState(() => timeLeft(target));

  useEffect(() => {
    const id = setInterval(() => setParts(timeLeft(target)), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.getTime()]);

  if (Number.isNaN(target.getTime()) || target.getTime() <= Date.now()) return null;
  const style = sectionStyle("countdown", content);
  const units: [string, number][] = [["Days", parts.days], ["Hours", parts.hours], ["Minutes", parts.minutes], ["Seconds", parts.seconds]];

  if (style === "minimal") {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] mb-3" style={{ color: theme.palette.text, opacity: 0.5 }}>
          Save the date
        </p>
        <div className="text-[88px] leading-none mb-2" style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.primary }}>
          {parts.days}
        </div>
        <p className="text-xl mb-1" style={{ fontFamily: theme.fonts.headingFont, fontStyle: "italic", color: theme.palette.text }}>
          {parts.days === 1 ? "day to go" : "days to go"}
        </p>
        <p className="text-sm" style={{ color: theme.palette.text, opacity: 0.65 }}>until {formatLongDate(event)}</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] mb-2" style={{ color: theme.palette.text, opacity: 0.5 }}>
        Counting down to
      </p>
      <p className="text-xl mb-6" style={{ fontFamily: theme.fonts.headingFont, fontStyle: "italic", color: theme.palette.text }}>
        {formatLongDate(event)}
      </p>
      {style === "boxes" ? (
        <div className="grid grid-cols-4 gap-2 max-w-sm mx-auto">
          {units.map(([label, value]) => (
            <div
              key={label}
              className={`flex flex-col items-center py-3.5 ${buttonRadiusClass(theme.buttonStyle)}`}
              style={{ backgroundColor: `${theme.palette.primary}12`, border: `1px solid ${theme.palette.primary}33` }}
            >
              <FlipNumber value={value} theme={theme} className="text-[28px] leading-none" />
              <span className="text-[9px] uppercase tracking-wide mt-1.5" style={{ color: theme.palette.text, opacity: 0.55 }}>{label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex justify-center">
          {units.map(([label, value], i) => (
            <div key={label} className="flex flex-col items-center px-4" style={i > 0 ? { borderLeft: divider(theme) } : undefined}>
              <FlipNumber value={value} theme={theme} className="text-3xl" />
              <span className="text-[10px] uppercase tracking-wide mt-1" style={{ color: theme.palette.text, opacity: 0.55 }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Details ────────────────────────────────────────────────────────────
export function DetailsSection({ content, theme, index }: SectionProps) {
  const description = str(content, "description");
  if (!description) return null;
  return (
    <div className={`px-6 py-10 ${alignClass(theme)}`}>
      <Eyebrow label="The Details" index={index} theme={theme} />
      <p className={`text-base leading-relaxed ${measureClass(theme)}`} style={{ fontFamily: theme.fonts.headingFont, fontStyle: "italic", color: theme.palette.text, opacity: 0.9 }}>
        {description}
      </p>
    </div>
  );
}

// ─── Story ──────────────────────────────────────────────────────────────
// Styles: "centered" (original), "quote" set large like a pull quote, and
// "photo" with the text beside the section's own photo (falling back to
// the event's cover photo) once there's room, stacked above it otherwise.
export function StorySection({ content, event, theme, index }: SectionProps) {
  const heading = str(content, "heading", "Our Story");
  const body = str(content, "body");
  if (!body) return null;
  const style = sectionStyle("story", content);

  if (style === "quote") {
    return (
      <div className={`px-6 py-12 ${alignClass(theme)}`}>
        <Eyebrow label="Our Story" index={index} theme={theme} />
        <div className={`relative ${isEditorial(theme) ? "max-w-md" : "max-w-sm mx-auto"}`}>
          <span className="block text-[72px] leading-[0.6] mb-2" style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.primary, opacity: 0.5 }} aria-hidden="true">
            &ldquo;
          </span>
          <p className="text-[21px] leading-snug whitespace-pre-line" style={{ fontFamily: theme.fonts.headingFont, fontStyle: "italic", color: theme.palette.text }}>
            {body}
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] mt-5" style={{ color: theme.palette.primary }}>— {heading}</p>
        </div>
      </div>
    );
  }

  if (style === "photo") {
    const photo = str(content, "imageUrl") || `https://images.unsplash.com/${event.imageUrl}?w=700&h=875&fit=crop&auto=format`;
    return (
      <div className="px-6 py-10 @container">
        <div className="grid @lg:grid-cols-2 gap-6 @lg:gap-8 items-center">
          <motion.div
            className={`aspect-[4/5] overflow-hidden ${buttonRadiusClass(theme.buttonStyle)}`}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <img src={photo} alt="" className="w-full h-full object-cover" />
          </motion.div>
          <div className="text-left">
            <Eyebrow label="Our Story" index={index} theme={theme} />
            <h3 className="text-[28px] leading-tight mb-4" style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.text }}>{heading}</h3>
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: theme.palette.text, opacity: 0.85 }}>{body}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`px-6 py-10 ${alignClass(theme)}`}>
      <Eyebrow label="Our Story" index={index} theme={theme} />
      <SectionHeading theme={theme}>{heading}</SectionHeading>
      <p className={`text-sm leading-relaxed whitespace-pre-line text-left ${measureClass(theme)}`} style={{ color: theme.palette.text, opacity: 0.85 }}>{body}</p>
    </div>
  );
}

// ─── Schedule ───────────────────────────────────────────────────────────
// Styles: "timeline" (original), "list" with times in a column, "cards"
// with each item on its own card (two across once there's room).
export function ScheduleSection({ content, theme, index }: SectionProps) {
  const items = list<{ time?: string; title?: string; description?: string }>(content, "items");
  if (items.length === 0) return null;
  const style = sectionStyle("schedule", content);

  return (
    <div className="px-6 py-10">
      <div className={alignClass(theme)}>
        <Eyebrow label="Timeline" index={index} theme={theme} />
        <SectionHeading theme={theme}>Order of the <Accent theme={theme}>day</Accent></SectionHeading>
      </div>

      {style === "list" && (
        <div className={isEditorial(theme) ? "" : "max-w-md mx-auto"}>
          {items.map((item, i) => (
            <div key={i} className="flex gap-4 py-3.5" style={i > 0 ? { borderTop: divider(theme) } : undefined}>
              <div className="w-20 flex-shrink-0 text-base" style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.primary }}>{item.time}</div>
              <div className="min-w-0">
                {item.title && <div className="text-sm font-medium" style={{ color: theme.palette.text }}>{item.title}</div>}
                {item.description && <div className="text-xs leading-relaxed mt-0.5" style={{ color: theme.palette.text, opacity: 0.7 }}>{item.description}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {style === "cards" && (
        <div className="@container">
          <div className="grid @lg:grid-cols-2 gap-3">
            {items.map((item, i) => (
              <motion.div
                key={i}
                className={`p-4 ${buttonRadiusClass(theme.buttonStyle)}`}
                style={{ backgroundColor: `${theme.palette.primary}0D`, border: `1px solid ${theme.palette.primary}29` }}
                {...photoReveal(i)}
              >
                {item.time && (
                  <span className="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full mb-2.5" style={{ backgroundColor: theme.palette.primary, color: "#FFFFFF" }}>
                    {item.time}
                  </span>
                )}
                {item.title && <div className="text-lg leading-snug mb-1" style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.text }}>{item.title}</div>}
                {item.description && <div className="text-xs leading-relaxed" style={{ color: theme.palette.text, opacity: 0.7 }}>{item.description}</div>}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {style === "timeline" && (
        <div>
          {items.map((item, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center flex-shrink-0">
                <IconRing name="clock" theme={theme} />
                {i < items.length - 1 && <div className="flex-1 w-px my-1" style={{ backgroundColor: `${theme.palette.text}1F`, minHeight: "1.5rem" }} />}
              </div>
              <div className="pb-6 min-w-0">
                {item.time && (
                  <div className="text-lg" style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.text }}>
                    {item.time}
                  </div>
                )}
                {item.title && (
                  <div className="text-sm mb-1" style={{ fontFamily: theme.fonts.headingFont, fontStyle: "italic", color: theme.palette.primary }}>
                    {item.title}
                  </div>
                )}
                {item.description && <div className="text-xs leading-relaxed" style={{ color: theme.palette.text, opacity: 0.7 }}>{item.description}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Venue ──────────────────────────────────────────────────────────────
// Styles: "centered" (original), "card", "photo" with the details over a
// venue photo, and "map" with an embedded Google Map of the address — the
// keyless embed URL, so there's no API key to manage or bill. Every style
// offers "Get directions": the organizer's own map link if they pasted
// one, otherwise a Google Maps search for the venue name and address.
function DirectionsButton({ mapUrl, theme, light = false }: { mapUrl: string; theme: ResolvedTheme; light?: boolean }) {
  if (!mapUrl) return null;
  return (
    <a
      href={mapUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-block px-5 py-2.5 text-xs font-semibold ${buttonRadiusClass(theme.buttonStyle)}`}
      style={light ? { backgroundColor: "#FFFFFF", color: theme.palette.text } : buttonStyleProps(theme.buttonStyle, theme.palette)}
    >
      Get directions
    </a>
  );
}

export function VenueSection({ content, event, theme, index }: SectionProps) {
  const name = str(content, "name");
  const address = str(content, "address");
  if (!name && !address) return null;
  const style = sectionStyle("venue", content);
  const query = encodeURIComponent([name, address].filter(Boolean).join(", "));
  const mapUrl = str(content, "mapUrl") || `https://www.google.com/maps/search/?api=1&query=${query}`;

  if (style === "photo") {
    const photo = str(content, "imageUrl") || `https://images.unsplash.com/${event.imageUrl}?w=900&h=640&fit=crop&auto=format`;
    return (
      <div className="px-6 py-10">
        <div className={`relative overflow-hidden min-h-[320px] flex items-end ${buttonRadiusClass(theme.buttonStyle)}`}>
          <img src={photo} alt={name} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(20,16,14,0.85) 25%, rgba(20,16,14,0.1) 100%)" }} />
          <div className="relative p-6 w-full">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(255,255,255,0.7)" }}>The Venue</p>
            {name && <div className="text-2xl leading-tight mb-1" style={{ fontFamily: theme.fonts.headingFont, color: "#FFFFFF" }}>{name}</div>}
            {address && <div className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.8)" }}>{address}</div>}
            <DirectionsButton mapUrl={mapUrl} theme={theme} light />
          </div>
        </div>
      </div>
    );
  }

  if (style === "card") {
    return (
      <div className={`px-6 py-10 ${alignClass(theme)}`}>
        <Eyebrow label="The Venue" index={index} theme={theme} />
        <SectionHeading theme={theme}>Where we <Accent theme={theme}>gather</Accent></SectionHeading>
        <div
          className={`flex gap-4 items-start text-left p-5 max-w-sm ${isEditorial(theme) ? "" : "mx-auto"} ${buttonRadiusClass(theme.buttonStyle)}`}
          style={{ border: `1px solid ${theme.palette.primary}40`, backgroundColor: `${theme.palette.primary}0A` }}
        >
          <IconRing name="pin" theme={theme} />
          <div className="min-w-0">
            {name && <div className="text-base font-medium mb-0.5" style={{ color: theme.palette.text }}>{name}</div>}
            {address && <div className="text-sm mb-3" style={{ color: theme.palette.text, opacity: 0.7 }}>{address}</div>}
            <DirectionsButton mapUrl={mapUrl} theme={theme} />
          </div>
        </div>
      </div>
    );
  }

  if (style === "map") {
    return (
      <div className={`px-6 py-10 ${alignClass(theme)}`}>
        <Eyebrow label="The Venue" index={index} theme={theme} />
        <SectionHeading theme={theme}>Where we <Accent theme={theme}>gather</Accent></SectionHeading>
        {name && <div className="text-base font-medium mb-1" style={{ color: theme.palette.text }}>{name}</div>}
        {address && <div className="text-sm mb-5" style={{ color: theme.palette.text, opacity: 0.7 }}>{address}</div>}
        <div className={`overflow-hidden aspect-[4/3] mb-5 ${buttonRadiusClass(theme.buttonStyle)}`} style={{ border: divider(theme) }}>
          <iframe
            title={`Map of ${name || address}`}
            src={`https://www.google.com/maps?q=${query}&output=embed`}
            className="w-full h-full"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <DirectionsButton mapUrl={mapUrl} theme={theme} />
      </div>
    );
  }

  return (
    <div className={`px-6 py-10 ${alignClass(theme)}`}>
      <Eyebrow label="The Venue" index={index} theme={theme} />
      <SectionHeading theme={theme}>Where we <Accent theme={theme}>gather</Accent></SectionHeading>
      {name && <div className="text-base font-medium mb-1" style={{ color: theme.palette.text }}>{name}</div>}
      {address && <div className="text-sm mb-5" style={{ color: theme.palette.text, opacity: 0.7 }}>{address}</div>}
      <DirectionsButton mapUrl={mapUrl} theme={theme} />
    </div>
  );
}

// ─── Gallery ────────────────────────────────────────────────────────────
// Layout and filter come from the section's own content (see
// src/data/gallery-styles.ts); a gallery saved before those options existed
// has neither, and falls back to masonry with no filter — its original look.
// Every layout opens the same full-screen lightbox on tap.
const POLAROID_TILTS = [-3, 2, -1.5, 3, -2, 1.5];

function photoReveal(i: number) {
  return {
    initial: { opacity: 0, y: 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-40px" },
    transition: { duration: 0.45, delay: (i % 6) * 0.08, ease: EASE },
  } as const;
}

export function GallerySection({ content, theme, index }: SectionProps) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const imageUrls = list<string>(content, "imageUrls").filter(Boolean);
  if (imageUrls.length === 0) return null;
  const layout = galleryLayout(content);
  const filterStyle = galleryFilterStyle(galleryFilter(content));
  const radius = theme.buttonStyle === "square" ? "rounded-none" : "rounded-xl";

  return (
    <div className="px-6 py-10">
      <div className={alignClass(theme)}>
        <Eyebrow label="Gallery" index={index} theme={theme} />
        <SectionHeading theme={theme}>A few of our <Accent theme={theme}>favorites</Accent></SectionHeading>
      </div>

      {layout === "masonry" && (
        <div className="columns-2 gap-2 [column-fill:_balance]">
          {imageUrls.map((url, i) => (
            <motion.button key={i} type="button" onClick={() => setOpenAt(i)} className={`block w-full ${radius} overflow-hidden mb-2 break-inside-avoid cursor-zoom-in`} {...photoReveal(i)}>
              <img src={url} alt="" className="w-full h-auto block" style={filterStyle} />
            </motion.button>
          ))}
        </div>
      )}

      {layout === "grid" && (
        <div className="@container">
          <div className="grid grid-cols-2 @lg:grid-cols-3 gap-2">
            {imageUrls.map((url, i) => (
              <motion.button key={i} type="button" onClick={() => setOpenAt(i)} className={`block aspect-square ${radius} overflow-hidden cursor-zoom-in`} {...photoReveal(i)}>
                <img src={url} alt="" className="w-full h-full object-cover" style={filterStyle} />
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {layout === "featured" && (
        <div>
          <motion.button
            type="button"
            onClick={() => setOpenAt(0)}
            className={`block w-full aspect-[4/3] ${radius} overflow-hidden cursor-zoom-in`}
            initial={{ opacity: 0, scale: 1.04 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <img src={imageUrls[0]} alt="" className="w-full h-full object-cover" style={filterStyle} />
          </motion.button>
          {imageUrls.length > 1 && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {imageUrls.slice(1).map((url, i) => (
                <motion.button key={i} type="button" onClick={() => setOpenAt(i + 1)} className={`block aspect-square ${radius} overflow-hidden cursor-zoom-in`} {...photoReveal(i + 1)}>
                  <img src={url} alt="" className="w-full h-full object-cover" style={filterStyle} />
                </motion.button>
              ))}
            </div>
          )}
        </div>
      )}

      {layout === "slideshow" && (
        <GallerySlideshow imageUrls={imageUrls} radius={radius} filterStyle={filterStyle} theme={theme} onOpen={setOpenAt} />
      )}

      {layout === "polaroid" && (
        <div className="@container">
          <div className="grid grid-cols-2 @lg:grid-cols-3 gap-x-4 gap-y-5 px-1 py-2">
            {imageUrls.map((url, i) => {
              const tilt = POLAROID_TILTS[i % POLAROID_TILTS.length];
              return (
                <motion.button
                  key={i}
                  type="button"
                  onClick={() => setOpenAt(i)}
                  className="block p-2 pb-7 rounded-sm cursor-zoom-in"
                  style={{ backgroundColor: "#FFFFFF", boxShadow: "0 4px 14px rgba(0,0,0,0.12)" }}
                  initial={{ opacity: 0, y: -24, rotate: 0 }}
                  whileInView={{ opacity: 1, y: 0, rotate: tilt }}
                  whileHover={{ rotate: 0, scale: 1.03 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.5, delay: (i % 6) * 0.08, ease: EASE }}
                >
                  <div className="aspect-square overflow-hidden">
                    <img src={url} alt="" className="w-full h-full object-cover" style={filterStyle} />
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {openAt !== null && <GalleryLightbox imageUrls={imageUrls} start={openAt} filterStyle={filterStyle} onClose={() => setOpenAt(null)} />}
    </div>
  );
}

// A native scroll-snap track (so swiping feels like the phone's own photo
// app) that also advances itself every few seconds — until the guest
// touches it, after which it stays wherever they leave it.
function GallerySlideshow({ imageUrls, radius, filterStyle, theme, onOpen }: {
  imageUrls: string[];
  radius: string;
  filterStyle: CSSProperties;
  theme: ResolvedTheme;
  onOpen: (i: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = imageUrls.length;

  function goTo(i: number) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: ((i + count) % count) * track.clientWidth, behavior: "smooth" });
  }

  useEffect(() => {
    if (paused || count < 2) return;
    const id = setTimeout(() => goTo(active + 1), 4000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, count]);

  function handleScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setActive(Math.round(track.scrollLeft / track.clientWidth));
  }

  function manual(i: number) {
    setPaused(true);
    goTo(i);
  }

  const arrowClass = "absolute top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-lg leading-none";
  const arrowStyle = { backgroundColor: "rgba(255,255,255,0.85)", color: "#1C1917" };

  return (
    <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.6, ease: EASE }}>
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={handleScroll}
          onPointerDown={() => setPaused(true)}
          className={`flex overflow-x-auto snap-x snap-mandatory ${radius} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        >
          {imageUrls.map((url, i) => (
            <button key={i} type="button" onClick={() => onOpen(i)} className="flex-shrink-0 w-full aspect-[4/3] snap-center cursor-zoom-in">
              <img src={url} alt="" className="w-full h-full object-cover" style={filterStyle} draggable={false} />
            </button>
          ))}
        </div>
        {count > 1 && (
          <>
            <button type="button" aria-label="Previous photo" onClick={() => manual(active - 1)} className={`${arrowClass} left-2`} style={arrowStyle}>‹</button>
            <button type="button" aria-label="Next photo" onClick={() => manual(active + 1)} className={`${arrowClass} right-2`} style={arrowStyle}>›</button>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {imageUrls.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show photo ${i + 1}`}
              onClick={() => manual(i)}
              className="h-1.5 rounded-full transition-all"
              style={{ width: i === active ? 18 : 6, backgroundColor: theme.palette.primary, opacity: i === active ? 1 : 0.3 }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

// Portaled to <body> so it covers the whole screen even when the
// invitation is rendered inside a scaled or scrolling container (the
// builder preview, the landing page's template preview).
function GalleryLightbox({ imageUrls, start, filterStyle, onClose }: { imageUrls: string[]; start: number; filterStyle: CSSProperties; onClose: () => void }) {
  const [i, setI] = useState(start);
  const touchX = useRef<number | null>(null);
  const count = imageUrls.length;
  const next = () => setI((x) => (x + 1) % count);
  const prev = () => setI((x) => (x - 1 + count) % count);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const controlStyle = { backgroundColor: "rgba(255,255,255,0.12)", color: "#FFFFFF" };

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
      onClick={onClose}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (dx > 50) prev();
        else if (dx < -50) next();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={i}
          src={imageUrls[i]}
          alt=""
          className="max-w-[92vw] max-h-[82vh] object-contain select-none"
          style={filterStyle}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />
      </AnimatePresence>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center" style={controlStyle}>✕</button>
      {count > 1 && (
        <>
          <button type="button" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-2xl leading-none" style={controlStyle}>‹</button>
          <button type="button" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-2xl leading-none" style={controlStyle}>›</button>
          <div className="absolute bottom-5 left-0 right-0 text-center text-xs font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
            {i + 1} / {count}
          </div>
        </>
      )}
    </motion.div>,
    document.body,
  );
}

// ─── Dress code ─────────────────────────────────────────────────────────
export function DressCodeSection({ content, theme, index }: SectionProps) {
  const description = str(content, "description");
  if (!description) return null;
  return (
    <div className={`px-6 py-10 ${alignClass(theme)}`}>
      <Eyebrow label="Dress Code" index={index} theme={theme} />
      <SectionHeading theme={theme}>What to <Accent theme={theme}>wear</Accent></SectionHeading>
      <p className={`text-sm leading-relaxed ${measureClass(theme)}`} style={{ color: theme.palette.text, opacity: 0.85 }}>{description}</p>
    </div>
  );
}

// ─── Entourage ──────────────────────────────────────────────────────────
export function EntourageSection({ content, theme, index }: SectionProps) {
  const groups = list<{ role?: string; names?: string }>(content, "groups").filter((g) => g.role || g.names);
  if (groups.length === 0) return null;
  return (
    <div className={`px-6 py-10 ${alignClass(theme)}`}>
      <Eyebrow label="Entourage" index={index} theme={theme} />
      <SectionHeading theme={theme}>The <Accent theme={theme}>entourage</Accent></SectionHeading>
      <div>
        {groups.map((g, i) => (
          <div key={i} className="py-3.5" style={i > 0 ? { borderTop: divider(theme) } : undefined}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: theme.palette.primary }}>{g.role}</div>
            <div className="text-sm mt-1" style={{ color: theme.palette.text }}>{g.names}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Gift registry ──────────────────────────────────────────────────────
export function GiftRegistrySection({ content, theme, index }: SectionProps) {
  const message = str(content, "message");
  const links = list<{ label?: string; url?: string }>(content, "links").filter((l) => l.url);
  if (!message && links.length === 0) return null;
  return (
    <div className={`px-6 py-10 ${alignClass(theme)}`}>
      <Eyebrow label="Gift Registry" index={index} theme={theme} />
      <SectionHeading theme={theme}>With <Accent theme={theme}>love</Accent></SectionHeading>
      {message && <p className={`text-sm mb-5 ${measureClass(theme)}`} style={{ color: theme.palette.text, opacity: 0.85 }}>{message}</p>}
      <div className={`flex flex-col gap-2 ${isEditorial(theme) ? "items-start" : "items-center"}`}>
        {links.map((l, i) => (
          <a
            key={i}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`px-5 py-2.5 text-xs font-semibold ${buttonRadiusClass(theme.buttonStyle)}`}
            style={buttonStyleProps(theme.buttonStyle, theme.palette)}
          >
            {l.label || l.url}
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── FAQ ────────────────────────────────────────────────────────────────
export function FaqSection({ content, theme, index }: SectionProps) {
  const items = list<{ question?: string; answer?: string }>(content, "items").filter((i) => i.question);
  if (items.length === 0) return null;
  return (
    <div className={`px-6 py-10 ${alignClass(theme)}`}>
      <Eyebrow label="Questions" index={index} theme={theme} />
      <SectionHeading theme={theme}>Good to <Accent theme={theme}>know</Accent></SectionHeading>
      <div className="text-left">
        {items.map((item, i) => (
          <div key={i} className="py-3.5" style={i > 0 ? { borderTop: divider(theme) } : undefined}>
            <div className="text-sm" style={{ fontFamily: theme.fonts.headingFont, fontStyle: "italic", color: theme.palette.text }}>{item.question}</div>
            {item.answer && <div className="text-xs mt-1 leading-relaxed" style={{ color: theme.palette.text, opacity: 0.7 }}>{item.answer}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// A small celebratory moment right where a guest most feels it — a
// checkmark that draws itself in, ringed by a quick burst of theme-colored
// confetti dots. Declines skip this (a burst felt tonally wrong there);
// they still get the plain "thanks for letting us know" text below.
function RsvpSuccessBurst({ theme }: { theme: ResolvedTheme }) {
  const dotCount = 10;
  const colors = [theme.palette.primary, theme.palette.accent, theme.palette.text];

  return (
    <div className="relative w-16 h-16 mx-auto mb-4">
      {Array.from({ length: dotCount }).map((_, i) => {
        const angle = (i / dotCount) * Math.PI * 2;
        const distance = 34;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{ width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5, backgroundColor: colors[i % colors.length] }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
          />
        );
      })}
      <motion.div
        className="absolute inset-0 rounded-full flex items-center justify-center"
        style={{ border: `1.5px solid ${theme.palette.primary}` }}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <motion.path
            d="M6 12l4 4 8-8"
            stroke={theme.palette.primary}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.25, ease: EASE }}
          />
        </svg>
      </motion.div>
    </div>
  );
}

// ─── RSVP ───────────────────────────────────────────────────────────────
type RsvpStage = "ask" | "form" | "done";

export function RsvpSection({ content, event, theme, interactive = true, onEventUpdated, guestId }: SectionProps & {
  interactive?: boolean;
  onEventUpdated?: (e: EventRecord) => void;
  guestId?: string;
}) {
  const [stage, setStage] = useState<RsvpStage>("ask");
  const [attending, setAttending] = useState(true);
  const [name, setName] = useState("");
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [mealPreference, setMealPreference] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmedGuestId, setConfirmedGuestId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [personalGuest, setPersonalGuest] = useState<PersonalGuestInfo | null>(null);
  const [loadingPersonal, setLoadingPersonal] = useState(!!guestId);
  const { submitRsvp, getGuestPublic, updateGuestRsvp } = useGuests();
  const { getEventBySlug } = useEvents();

  const prompt = str(content, "prompt", "Will you celebrate with us?");

  // A personal link (spec §21) pre-loads that guest's own row — scoped by
  // the id in the URL, not a general query — so we can greet them by name
  // and, if they've already answered, skip straight to their confirmation
  // (with QR) instead of asking again.
  useEffect(() => {
    if (!guestId) return;
    let cancelled = false;
    (async () => {
      const guest = await getGuestPublic(guestId);
      if (cancelled) return;
      setPersonalGuest(guest);
      setLoadingPersonal(false);
      if (!guest) return;
      if (guest.rsvpStatus === "pending") {
        setName(guest.name);
        if (guest.numberOfGuests > 0) setNumberOfGuests(guest.numberOfGuests);
        setMealPreference(guest.mealPreference ?? "");
        setMessage(guest.message ?? "");
      } else {
        setAttending(guest.rsvpStatus === "confirmed");
        setConfirmedGuestId(guest.rsvpStatus === "confirmed" ? guest.id : null);
        setStage("done");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestId]);

  function chooseAttending(value: boolean) {
    if (!interactive) return;
    setAttending(value);
    setStage("form");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!interactive || !name.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      let id: string;
      if (personalGuest) {
        await updateGuestRsvp(personalGuest.id, {
          name: name.trim(),
          attending,
          numberOfGuests,
          mealPreference: mealPreference.trim() || undefined,
          message: message.trim() || undefined,
        });
        id = personalGuest.id;
      } else {
        ({ id } = await submitRsvp({
          eventId: event.id,
          name: name.trim(),
          attending,
          numberOfGuests,
          mealPreference: mealPreference.trim() || undefined,
          message: message.trim() || undefined,
        }));
      }
      if (attending) setConfirmedGuestId(id);
      const refreshed = await getEventBySlug(event.slug);
      if (refreshed) onEventUpdated?.(refreshed);
      setStage("done");
    } catch (err) {
      // The database rejects RSVPs past a Free event's guest cap (see
      // enforce_guest_limit in schema.sql) — tell the guest plainly rather
      // than showing them a plan-limit message meant for the organizer.
      const message = err instanceof Error ? err.message : "";
      setError(
        message.includes("guest limit")
          ? "Sorry, this invitation isn't accepting new RSVPs right now. Please contact the host."
          : message || "Couldn't submit your RSVP. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingPersonal) return null;

  const inputStyle = { border: `1px solid ${theme.palette.surface}`, backgroundColor: theme.palette.background, color: theme.palette.text };
  const radius = buttonRadiusClass(theme.buttonStyle);

  if (stage === "done") {
    return (
      <div className="text-center py-6">
        {attending && <RsvpSuccessBurst theme={theme} />}
        <Eyebrow label="RSVP" theme={theme} />
        <h3 className="text-2xl mb-2" style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.text }}>
          {attending ? "You're on the guest list" : "Thanks for letting us know"}
        </h3>
        <p className="text-sm mb-2" style={{ color: theme.palette.text, opacity: 0.7 }}>
          {attending ? "We can't wait to celebrate with you." : "We'll miss you, but we appreciate the heads up."}
        </p>

        {attending && confirmedGuestId && planAllows(event.ownerPlan, "checkin") && (
          <div className="mt-5 flex flex-col items-center">
            <div className="p-4 rounded-xl mb-3" style={{ border: divider(theme) }}>
              <QrCode payload={guestQrPayload(confirmedGuestId)} darkColor={theme.palette.text} onDataUrlReady={setQrDataUrl} />
            </div>
            <p className="text-xs max-w-xs mb-3" style={{ color: theme.palette.text, opacity: 0.6 }}>
              Save this QR code — show it at the door for quick check-in on the day.
            </p>
            {qrDataUrl && (
              <a
                href={qrDataUrl}
                download="my-invitation-qr.png"
                className={`inline-block px-5 py-2.5 text-xs font-semibold ${radius}`}
                style={buttonStyleProps(theme.buttonStyle, theme.palette)}
              >
                Download QR code
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  if (stage === "ask") {
    return (
      <div className="text-center">
        <Eyebrow label="RSVP" theme={theme} />
        {personalGuest && (
          <p className="text-lg mb-1" style={{ fontFamily: theme.fonts.headingFont, fontStyle: "italic", color: theme.palette.primary }}>
            Dear {personalGuest.name}
          </p>
        )}
        <SectionHeading theme={theme}>{prompt}</SectionHeading>
        <p className="text-sm mb-6 -mt-3" style={{ color: theme.palette.text, opacity: 0.7 }}>Kindly let us know by RSVPing below.</p>
        <div className="flex flex-col gap-3">
          <button onClick={() => chooseAttending(true)} className={`w-full py-3.5 text-sm font-semibold transition-all hover:opacity-90 ${radius}`} style={buttonStyleProps(theme.buttonStyle, theme.palette)}>
            Yes, I'll be there
          </button>
          <button onClick={() => chooseAttending(false)} className={`w-full py-3.5 text-sm font-semibold transition-all hover:bg-stone-100 ${radius}`} style={{ backgroundColor: theme.palette.background, color: theme.palette.text, border: divider(theme) }}>
            Sorry, I can't make it
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <button type="button" onClick={() => setStage("ask")} className="text-xs font-medium" style={{ color: theme.palette.text, opacity: 0.6 }}>
        ← Back
      </button>
      <input placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={inputStyle} />
      {attending && (
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: theme.palette.text, opacity: 0.7 }}>Number of guests (including you)</label>
          <input type="number" min={1} max={20} value={numberOfGuests} onChange={(e) => setNumberOfGuests(Math.max(1, Number(e.target.value)))} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={inputStyle} />
        </div>
      )}
      {attending && (
        <input placeholder="Meal preference (optional)" value={mealPreference} onChange={(e) => setMealPreference(e.target.value)} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={inputStyle} />
      )}
      <textarea placeholder="Message for the host (optional)" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none" style={inputStyle} />
      {error && <p className="text-xs" style={{ color: "#E55757" }}>{error}</p>}
      <button type="submit" disabled={submitting} className={`w-full py-3.5 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60 ${radius}`} style={buttonStyleProps(theme.buttonStyle, theme.palette)}>
        {submitting ? "Submitting..." : "Confirm RSVP"}
      </button>
      {/* Consent notice required on RSVP forms (compliance addendum §3). Opens
          in a new tab so a guest mid-RSVP doesn't lose what they typed. */}
      <p className="text-[11px] leading-relaxed text-center" style={{ color: theme.palette.text, opacity: 0.6 }}>
        By submitting, you agree that your details will be shared with the host to manage this event's guest list.{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a>
      </p>
    </form>
  );
}

export { categoryLabel };
