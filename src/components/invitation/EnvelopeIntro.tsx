import { useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { EventRecord } from "../../lib/events-store";
import type { ResolvedTheme } from "./theme";
import { readableOn } from "./theme";
import { formatLongDate } from "./format";

const EASE = [0.22, 1, 0.36, 1] as const;

// Envelope size, px.
const W = 248;
const H = 164;
const FLAP_H = H * 0.58;

// Opening choreography, seconds from the tap: the seal cracks, the flap
// swings up, the card rises out, then the whole gate fades away.
const T_SEAL = 0;
const T_FLAP = 0.12;
const T_CARD = 0.55;
const T_GATE = 1.35;

function sessionKey(slug: string): string {
  return `invyta-envelope-opened:${slug}`;
}

// "Elena & Marco" → "E&M"; anything else → its first letter.
function monogram(name: string): string {
  const parts = name.split(/\s+(?:&|and|\+)\s+/i).filter(Boolean);
  if (parts.length === 2) return `${parts[0].trim()[0]}&${parts[1].trim()[0]}`.toUpperCase();
  return (name.trim()[0] ?? "").toUpperCase();
}

// A wax seal's wavy rim, as an SVG path around (0, 0).
function sealPath(radius: number, bumps = 18, depth = 1.6): string {
  const points: string[] = [];
  const steps = bumps * 8;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = radius + Math.sin(a * bumps) * depth;
    points.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

// A one-time "opening" ritual in front of the real page — a sealed
// envelope, optionally addressed to the guest, that they tap (or press
// Enter on) to open: the seal cracks, the flap swings up, the card rises
// out, and the gate fades to reveal the invitation underneath (already
// fully mounted the whole time, so there's no pop-in). Only for the real
// public page and the sample — the Builder preview and the landing page's
// demo renders show content immediately.
//
// While it's up it's a modal dialog: the page behind is `inert` (not
// reachable by Tab or a screen reader) and can't scroll.
export function EnvelopeIntro({ event, theme, guestName }: { event: EventRecord; theme: ResolvedTheme; guestName?: string }) {
  const [stage, setStage] = useState<"closed" | "opening" | "done">(() => {
    try {
      return sessionStorage.getItem(sessionKey(event.slug)) === "1" ? "done" : "closed";
    } catch {
      return "closed";
    }
  });
  // Past the halfway point the flap tucks behind the rising card.
  const [flapBehind, setFlapBehind] = useState(false);
  const reduceMotion = useReducedMotion();
  const gateRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const titleId = useId();
  // For SVG url(#…) references, which choke on the punctuation useId emits.
  const svgId = `env${titleId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const { palette, fonts } = theme;
  const opening = stage === "opening";

  // Background stays put — and out of reach — while the gate is up.
  const gateUp = stage !== "done";
  useEffect(() => {
    if (!gateUp) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const siblings = [...(gateRef.current?.parentElement?.children ?? [])].filter((el) => el !== gateRef.current && !el.hasAttribute("inert"));
    siblings.forEach((el) => el.setAttribute("inert", ""));
    buttonRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prevOverflow;
      siblings.forEach((el) => el.removeAttribute("inert"));
    };
  }, [gateUp]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function open() {
    // A second tap mid-animation skips straight to the invitation.
    if (stage === "opening") {
      setStage("done");
      return;
    }
    if (stage !== "closed") return;
    try {
      sessionStorage.setItem(sessionKey(event.slug), "1");
    } catch {
      // best-effort — a private-browsing tab just sees the gate again next visit
    }
    if (reduceMotion) {
      setStage("done");
      return;
    }
    setStage("opening");
    timers.current.push(
      setTimeout(() => setFlapBehind(true), (T_FLAP + 0.3) * 1000),
      setTimeout(() => setStage("done"), T_GATE * 1000),
    );
  }

  const initials = monogram(event.name);
  const sealInk = readableOn(palette.accent, palette.text);
  const hairline = `${palette.text}1F`;
  // Shadows fall dark even on a dark palette (whose text color is light).
  const shade = palette.dark ? "#000000" : palette.text;

  return (
    <AnimatePresence>
      {gateUp && (
        <motion.div
          ref={gateRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex items-center justify-center px-6 overflow-hidden"
          style={{
            background: `radial-gradient(ellipse 80% 60% at 50% 42%, ${palette.surface} 0%, ${palette.background} 72%)`,
            cursor: stage === "closed" ? "pointer" : "default",
          }}
          // The whole backdrop also opens it — a tap anywhere is the natural gesture.
          onClick={open}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.2 : 0.55, ease: EASE }}
        >
          <div className="text-center">
            <motion.p
              className="text-[11px] font-semibold uppercase tracking-[0.3em] mb-9"
              style={{ color: palette.text, opacity: 0.55 }}
              animate={{ opacity: opening ? 0 : 0.55 }}
              transition={{ duration: 0.3 }}
            >
              You're Invited
            </motion.p>

            <motion.button
              ref={buttonRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                open();
              }}
              aria-label={guestName ? `Open your invitation, ${guestName}` : "Open the invitation"}
              className="block mx-auto mb-10 rounded-2xl"
              style={{ outlineColor: palette.primary, outlineOffset: 10 }}
              whileHover={stage === "closed" && !reduceMotion ? { y: -4, rotate: -1 } : undefined}
              whileTap={stage === "closed" && !reduceMotion ? { scale: 0.98 } : undefined}
            >
              {/* Idle: a slow float, so it reads as something to pick up. */}
              <motion.div
                animate={stage === "closed" && !reduceMotion ? { y: [0, -6, 0] } : { y: 0 }}
                transition={stage === "closed" ? { duration: 4.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
              >
                {/* `perspective` sits on the flap's direct parent, or the
                    3D fold has no vanishing point and looks like a squash. */}
                <div className="relative" style={{ width: W, height: H, perspective: 1100 }}>
                  {/* Inside of the envelope */}
                  <div
                    className="absolute inset-0 rounded-lg"
                    style={{
                      zIndex: 1,
                      background: `linear-gradient(${palette.text}1A, ${palette.text}1A), ${palette.surface}`,
                      boxShadow: `0 28px 44px -22px ${shade}${palette.dark ? "CC" : "66"}, 0 3px 8px ${shade}${palette.dark ? "66" : "1F"}`,
                    }}
                  />

                  {/* The card, tucked inside until it rises out */}
                  <motion.div
                    className="absolute flex flex-col items-center justify-center rounded-md px-4"
                    style={{
                      zIndex: 3,
                      left: 12,
                      right: 12,
                      top: 8,
                      bottom: 6,
                      backgroundColor: palette.background,
                      border: `1px solid ${hairline}`,
                      boxShadow: `0 6px 16px -8px ${shade}40`,
                    }}
                    initial={false}
                    animate={opening ? { y: -H * 0.62 } : { y: 0 }}
                    transition={{ duration: 0.7, ease: EASE, delay: opening ? T_CARD : 0 }}
                  >
                    {/* Blank while sealed — the gap between flap and pocket
                        would otherwise show a sliver of its text. */}
                    <motion.div
                      className="flex flex-col items-center"
                      initial={false}
                      animate={{ opacity: opening ? 1 : 0 }}
                      transition={{ duration: 0.3, delay: opening ? T_CARD : 0 }}
                    >
                      <span className="text-[8px] font-semibold uppercase tracking-[0.3em] mb-1.5" style={{ color: palette.primary }}>
                        Save the date
                      </span>
                      <span className="text-[17px] leading-tight" style={{ fontFamily: fonts.headingFont, color: palette.text }}>
                        {event.name}
                      </span>
                      <span className="mt-2 h-px w-10" style={{ backgroundColor: `${palette.text}33` }} />
                    </motion.div>
                  </motion.div>

                  {/* Front pocket: side folds and the bottom fold, over the card */}
                  <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none" style={{ zIndex: 4 }}>
                    <div
                      className="absolute inset-0"
                      style={{ background: `linear-gradient(${palette.text}0F, ${palette.text}0F), ${palette.surface}`, clipPath: "polygon(0 0, 51% 56%, 0 100%)" }}
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: `linear-gradient(${palette.text}0F, ${palette.text}0F), ${palette.surface}`, clipPath: "polygon(100% 0, 49% 56%, 100% 100%)" }}
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: `linear-gradient(180deg, ${palette.surface}, ${palette.surface}), ${palette.surface}`, clipPath: "polygon(0 100%, 50% 44%, 100% 100%)" }}
                    />
                    {/* fold creases */}
                    <svg className="absolute inset-0" width={W} height={H} aria-hidden="true">
                      <path d={`M0 ${H} L${W / 2} ${H * 0.44} L${W} ${H}`} fill="none" stroke={palette.text} strokeOpacity="0.1" />
                      <path d={`M0 0 L${W * 0.51} ${H * 0.56} M${W} 0 L${W * 0.49} ${H * 0.56}`} fill="none" stroke={palette.text} strokeOpacity="0.07" />
                    </svg>
                    {guestName && (
                      <span
                        className="absolute inset-x-0 text-center truncate px-10 text-[15px]"
                        style={{ top: H * 0.74, fontFamily: fonts.headingFont, fontStyle: "italic", color: palette.text, opacity: 0.8 }}
                      >
                        {guestName}
                      </span>
                    )}
                  </div>

                  {/* Flap — hinged at the top, two-sided: the primary color
                      outside, a patterned lining inside. */}
                  <motion.div
                    className="absolute inset-x-0 top-0"
                    style={{ zIndex: flapBehind ? 2 : 5, height: FLAP_H, transformOrigin: "top center", transformStyle: "preserve-3d" }}
                    initial={false}
                    animate={{ rotateX: opening ? -180 : 0 }}
                    transition={{ duration: 0.75, ease: EASE, delay: opening ? T_FLAP : 0 }}
                  >
                    <div
                      className="absolute inset-0 rounded-t-lg"
                      style={{
                        background: `linear-gradient(160deg, ${palette.primary}, ${palette.primary}D9)`,
                        clipPath: "polygon(0 0, 100% 0, 50% 100%)",
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                        filter: `drop-shadow(0 2px 2px ${shade}33)`,
                      }}
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundColor: palette.surface,
                        backgroundImage: `repeating-linear-gradient(45deg, ${palette.accent}55 0 6px, transparent 6px 14px), repeating-linear-gradient(-45deg, ${palette.primary}22 0 6px, transparent 6px 14px)`,
                        clipPath: "polygon(0 100%, 100% 100%, 50% 0)",
                        transform: "rotateX(180deg)",
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                      }}
                    />
                  </motion.div>

                  {/* Wax seal on the flap's tip — cracks in two on opening */}
                  <div
                    className="absolute pointer-events-none"
                    style={{ zIndex: 6, left: W / 2 - 29, top: FLAP_H - 29, width: 58, height: 58, filter: `drop-shadow(0 3px 4px ${shade}${palette.dark ? "80" : "40"})` }}
                  >
                    {(["left", "right"] as const).map((half) => (
                      <motion.svg
                        key={half}
                        className="absolute inset-0"
                        width="58"
                        height="58"
                        viewBox="-29 -29 58 58"
                        style={{ clipPath: half === "left" ? "polygon(0 0, 54% 0, 46% 100%, 0 100%)" : "polygon(54% 0, 100% 0, 100% 100%, 46% 100%)" }}
                        initial={false}
                        animate={
                          opening
                            ? { x: half === "left" ? -16 : 16, y: 14, rotate: half === "left" ? -24 : 24, opacity: 0 }
                            : { x: 0, y: 0, rotate: 0, opacity: 1 }
                        }
                        transition={{ duration: 0.5, ease: EASE, delay: opening ? T_SEAL : 0 }}
                        aria-hidden="true"
                      >
                        <defs>
                          <radialGradient id={`${svgId}-wax-${half}`} cx="35%" cy="30%" r="75%">
                            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.35" />
                            <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0" />
                            <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
                          </radialGradient>
                        </defs>
                        <path d={sealPath(26)} fill={palette.accent} />
                        <path d={sealPath(26)} fill={`url(#${svgId}-wax-${half})`} />
                        <circle r="18" fill="none" stroke={sealInk} strokeOpacity="0.28" strokeWidth="1.2" />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill={sealInk}
                          fillOpacity="0.85"
                          style={{ fontFamily: fonts.headingFont, fontStyle: "italic", fontSize: initials.length > 1 ? 13 : 17 }}
                        >
                          {initials}
                        </text>
                      </motion.svg>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.button>

            <motion.div animate={{ opacity: opening ? 0 : 1, y: opening ? 8 : 0 }} transition={{ duration: 0.35 }}>
              <h1 id={titleId} className="text-2xl mb-2" style={{ fontFamily: fonts.headingFont, color: palette.text }}>
                {event.name}
              </h1>
              <p className="text-sm mb-8" style={{ color: palette.text, opacity: 0.6 }}>
                {formatLongDate(event)}
              </p>

              <motion.p
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: palette.primary }}
                animate={reduceMotion ? undefined : { opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                aria-hidden="true"
              >
                <span className="[@media(hover:hover)]:hidden">Tap to open</span>
                <span className="hidden [@media(hover:hover)]:inline">Click to open</span>
              </motion.p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
