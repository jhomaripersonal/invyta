import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import logoMark from "../assets/webApp-logo-mark.png";
import { DeviceScene, SCENE_H, SCENE_W } from "./LandingPage";
import { T } from "../lib/tokens";

// Launch post images for Facebook, Instagram and link previews: the
// landing page's laptop + phone scene (the real sample invitation) with
// the launch message, laid out at each platform's pixel size.
//
// Dev only (see App.tsx). Open /launch-mockup?format=portrait to look at
// one; `pnpm mockups` screenshots every format to PNG.
//   format: portrait (1080×1350, FB/IG feed), square (1080×1080),
//           story (1080×1920, Stories/Reels), link (1200×630, link card)
//   badge:  the pill above the headline (default "Launching soon")
//   url:    the address in the call to action (default invytaph.sbs)

const FORMATS = {
  portrait: { w: 1080, h: 1350 },
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
  link: { w: 1200, h: 630 },
} as const;
type Format = keyof typeof FORMATS;

// Fills the box it's given with the device scene, as large as fits.
function FitScene({ style }: { style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setScale(Math.min(el.clientWidth / SCENE_W, el.clientHeight / SCENE_H));
  }, []);
  return (
    <div ref={ref} className="flex items-center justify-center min-h-0" style={style}>
      {scale > 0 && (
        <div style={{ width: SCENE_W * scale, height: SCENE_H * scale }}>
          <DeviceScene scale={scale} entrance={false} />
        </div>
      )}
    </div>
  );
}

function Badge({ children, size }: { children: ReactNode; size: number }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full font-bold uppercase"
      style={{ fontSize: size, letterSpacing: "0.14em", padding: `${size * 0.55}px ${size * 1.2}px`, backgroundColor: T.goldTint, color: T.gold }}
    >
      <span aria-hidden>✦</span>
      {children}
    </span>
  );
}

function Headline({ size, align = "center" }: { size: number; align?: "center" | "left" }) {
  return (
    <h1 className="font-bold" style={{ fontSize: size, lineHeight: 1.06, letterSpacing: "-0.03em", color: T.charcoal, textAlign: align, margin: 0 }}>
      Beautiful <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: T.accent }}>invitations.</span>
      <br />
      Smarter events.
    </h1>
  );
}

function Sub({ size, align = "center", maxWidth }: { size: number; align?: "center" | "left"; maxWidth: number }) {
  return (
    <p style={{ fontSize: size, lineHeight: 1.4, color: T.muted, textAlign: align, maxWidth, margin: 0 }}>
      Create a stunning digital invitation, collect RSVPs and manage guests — for every Filipino celebration.
    </p>
  );
}

function Cta({ url, size }: { url: string; size: number }) {
  return (
    <div className="inline-flex items-center gap-4">
      <span className="rounded-full font-semibold" style={{ fontSize: size, padding: `${size * 0.6}px ${size * 1.3}px`, backgroundColor: T.accent, color: T.white }}>
        Create yours free
      </span>
      <span className="font-semibold" style={{ fontSize: size, color: T.charcoal }}>{url}</span>
    </div>
  );
}

function Backdrop() {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      <div className="absolute rounded-full" style={{ width: 900, height: 900, top: -380, right: -360, backgroundColor: T.accent, opacity: 0.14, filter: "blur(120px)" }} />
      <div className="absolute rounded-full" style={{ width: 700, height: 700, bottom: -300, left: -260, backgroundColor: T.rose, opacity: 0.45, filter: "blur(120px)" }} />
    </div>
  );
}

export default function LaunchMockup() {
  const [params] = useSearchParams();
  const format: Format = (params.get("format") as Format) in FORMATS ? (params.get("format") as Format) : "portrait";
  const badge = params.get("badge") ?? "Launching soon";
  const url = params.get("url") ?? "invytaph.sbs";
  const { w, h } = FORMATS[format];

  const artboard: CSSProperties = { width: w, height: h, backgroundColor: T.cream, fontFamily: "var(--font-sans)" };

  if (format === "link") {
    return (
      <div className="fixed top-0 left-0 overflow-hidden flex items-center" style={{ ...artboard, padding: "0 56px 0 72px", gap: 32 }}>
        <Backdrop />
        <div className="relative flex flex-col items-start" style={{ width: 470, gap: 22 }}>
          <img src={logoMark} alt="Invyta" style={{ height: 40 }} />
          <Badge size={15}>{badge}</Badge>
          <Headline size={54} align="left" />
          <Sub size={20} align="left" maxWidth={440} />
          <Cta url={url} size={18} />
        </div>
        <FitScene style={{ position: "relative", flex: 1, height: 520 }} />
      </div>
    );
  }

  const s = {
    portrait: { pad: "76px 64px 68px", logo: 50, badge: 20, headline: 84, sub: 29, subW: 860, cta: 26, gap: 26 },
    square: { pad: "60px 64px 56px", logo: 44, badge: 18, headline: 70, sub: 0, subW: 0, cta: 24, gap: 22 },
    story: { pad: "190px 72px 230px", logo: 60, badge: 24, headline: 104, sub: 34, subW: 900, cta: 30, gap: 34 },
  }[format];

  return (
    <div className="fixed top-0 left-0 overflow-hidden flex flex-col items-center" style={{ ...artboard, padding: s.pad, gap: s.gap }}>
      <Backdrop />
      <img className="relative" src={logoMark} alt="Invyta" style={{ height: s.logo }} />
      <div className="relative"><Badge size={s.badge}>{badge}</Badge></div>
      <div className="relative"><Headline size={s.headline} /></div>
      {s.sub > 0 && <div className="relative"><Sub size={s.sub} maxWidth={s.subW} /></div>}
      <FitScene style={{ position: "relative", flex: 1, width: "100%" }} />
      <div className="relative"><Cta url={url} size={s.cta} /></div>
    </div>
  );
}
