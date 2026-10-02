import { createContext, memo, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router-dom";
import logoMark from "../assets/webApp-logo-mark.png";
import { DeviceScene, SCENE_H, SCENE_W } from "./LandingPage";
import { SectionList } from "../components/invitation/SectionList";
import { QrCode } from "../components/QrCode";
import { Icon } from "../components/Icon";
import { TEMPLATE_PREVIEWS, type TemplatePreviewSeed } from "../data/landing-template-previews";
import { EVENT_CATEGORIES } from "../data/event-categories";
import { COLOR_PALETTES, FONT_PAIRINGS, getPalette } from "../data/theme-presets";
import { T } from "../lib/tokens";

// The product video: eight scenes on one timeline, built from the real
// invitation renderer (SectionList, the landing page's device scene) and the
// app's own tokens, so it shows the actual product. Two layouts of the same
// scenes: landscape (1920×1080 — YouTube, the website, Facebook) and
// vertical (1080×1920 — TikTok, Reels, Shorts).
//
// Dev only (see App.tsx). Open /product-video to watch it play in the
// browser (scaled to the window); ?format=vertical for the vertical cut;
// ?t=12 freezes it at 12 s. `pnpm video` renders both frame by frame to
// product-video/, driving the clock through window.__setVideoTime, and
// mixes in the voiceover below over background music.

export const FORMATS = {
  landscape: { w: 1920, h: 1080 },
  vertical: { w: 1080, h: 1920 },
} as const;
type Format = keyof typeof FORMATS;

// Vertical layouts keep their content inside the area TikTok and Reels
// leave clear: below their top bar and above the caption and music strip.
const V_TOP = 170;
const V_BOTTOM = 400;

const VerticalContext = createContext(false);
const useVertical = () => useContext(VerticalContext);
// Scene lengths in seconds, in order; each starts where the last ends.
// They're sized to fit the voiceover lines below (the render script warns
// when a line runs into the next one).
const SCENE_LENGTHS = {
  hook: 5.6,
  hero: 5.4,
  templates: 7.6,
  customize: 6.4,
  share: 5.9,
  rsvps: 6.6,
  checkin: 5.2,
  outro: 6.4,
};
type SceneId = keyof typeof SCENE_LENGTHS;
const SCENES = {} as Record<SceneId, [number, number]>;
let sceneStart = 0;
for (const [id, length] of Object.entries(SCENE_LENGTHS) as [SceneId, number][]) {
  SCENES[id] = [sceneStart, sceneStart + length];
  sceneStart += length;
}
export const VIDEO_DURATION = sceneStart;

// The voiceover: each line starts `at` seconds into its scene. `say` is
// what the voice reads when it differs from the written line — spelled
// out so text-to-speech pronounces the brand name as intended.
const VOICEOVER: { scene: SceneId; at: number; text: string; say?: string }[] = [
  {
    scene: "hook",
    at: 0.3,
    text: "Your celebration deserves more than a flat image.",
  },
  { scene: "hook", at: 3.5, text: "Meet Invyta.", say: "Meet Inveeta." },
  {
    scene: "hero",
    at: 0.4,
    text: "Beautiful invitations, and smarter events — all from one link.",
  },
  {
    scene: "templates",
    at: 0.4,
    text: "Start with a template made for your occasion: weddings, debuts, birthdays, christenings, and more.",
  },
  {
    scene: "customize",
    at: 0.4,
    text: "Then make it yours — your motif colors, fonts, and layout, in a tap.",
  },
  {
    scene: "share",
    at: 0.4,
    text: "Share one link in the group chat. It opens beautifully on any phone.",
  },
  {
    scene: "rsvps",
    at: 0.4,
    text: "Watch RSVPs roll in on one clean dashboard, and nudge the rest with a one-tap reminder.",
  },
  {
    scene: "checkin",
    at: 0.4,
    text: "On the day itself, check guests in with a quick QR scan.",
  },
  {
    scene: "outro",
    at: 0.4,
    text: "Every event starts free. Create yours today at invyta.app.",
    say: "Every event starts free. Create yours today at Inveeta dot app.",
  },
];

declare global {
  interface Window {
    __setVideoTime?: (t: number) => Promise<void>;
    __videoDuration?: number;
    __voiceover?: { start: number; text: string }[];
    __videoSize?: { w: number; h: number };
  }
}

// ─── Timing helpers ───────────────────────────────────────────────────────
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// 0 → 1 between `start` and `start + dur` (local seconds), eased.
const prog = (lt: number, start: number, dur: number, ease = easeOut) => ease(clamp01((lt - start) / dur));
const rise = (k: number, dist = 32): CSSProperties => ({
  opacity: k,
  transform: `translateY(${(1 - k) * dist}px)`,
});

const FADE = 0.45;

function Scene({ t, id, children }: { t: number; id: SceneId; children: (lt: number) => ReactNode }) {
  const [start, end] = SCENES[id];
  const fadeIn = id === "hook" ? 1 : clamp01((t - start) / FADE);
  const fadeOut = id === "outro" ? 1 : clamp01((end - t) / FADE);
  const opacity = Math.min(fadeIn, fadeOut);
  // Scenes stay mounted (so their images and QR codes are ready when they
  // come up) and are merely hidden outside their window.
  return (
    <div className="absolute inset-0" style={{ opacity, visibility: opacity > 0 ? "visible" : "hidden" }}>
      {children(Math.max(0, t - start))}
    </div>
  );
}

// ─── Shared pieces ────────────────────────────────────────────────────────
function Backdrop({ t }: { t: number }) {
  const drift = Math.sin(t / 6) * 40;
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      <div
        className="absolute rounded-full"
        style={{
          width: 1200,
          height: 1200,
          top: -520 + drift,
          right: -420,
          backgroundColor: T.accent,
          opacity: 0.12,
          filter: "blur(140px)",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 900,
          height: 900,
          bottom: -420,
          left: -300 - drift,
          backgroundColor: T.rose,
          opacity: 0.5,
          filter: "blur(140px)",
        }}
      />
    </div>
  );
}

function Serif({ children, color = T.accent }: { children: ReactNode; color?: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-serif)",
        fontStyle: "italic",
        fontWeight: 500,
        color,
      }}
    >
      {children}
    </span>
  );
}

function StepCaption({ lt, step, title, sub, align = "left", width = 640 }: { lt: number; step: string; title: ReactNode; sub: string; align?: "left" | "center"; width?: number }) {
  const v = useVertical();
  if (v) {
    align = "center";
    width = 920;
  }
  const a = prog(lt, 0.15, 0.7);
  const b = prog(lt, 0.35, 0.7);
  const c = prog(lt, 0.55, 0.7);
  return (
    <div style={{ width, textAlign: align }}>
      <div style={rise(a, 20)}>
        <span
          className="inline-flex items-center gap-2 rounded-full font-bold uppercase"
          style={{
            fontSize: v ? 22 : 18,
            letterSpacing: "0.14em",
            padding: "9px 20px",
            backgroundColor: T.goldTint,
            color: T.gold,
          }}
        >
          Step {step}
        </span>
      </div>
      <h2
        className="font-bold"
        style={{
          ...rise(b),
          fontSize: v ? 88 : 76,
          lineHeight: 1.04,
          letterSpacing: "-0.03em",
          color: T.charcoal,
          margin: sub ? "26px 0 22px" : "26px 0 0",
        }}
      >
        {title}
      </h2>
      {sub && (
        <p
          style={{
            ...rise(c),
            fontSize: v ? 34 : 28,
            lineHeight: 1.45,
            color: T.muted,
            margin: 0,
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

// Sets a scroll position imperatively, so a site-mode invitation's sticky
// top bar behaves as on a real visit.
function ScrollBox({ top, height, children }: { top: number; height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = top;
  }, [top]);
  return (
    <div ref={ref} className="overflow-hidden" style={{ height }}>
      {children}
    </div>
  );
}

const PHONE_RAW_W = 390;
const PHONE_STATUS_H = 50;

// Memoised: only the scroll position changes frame to frame, so the
// (large) invitation tree renders once.
const Invitation = memo(function Invitation({ seed, viewportH }: { seed: TemplatePreviewSeed; viewportH: number }) {
  return <SectionList invitation={seed.invitation} event={seed.event} interactive={false} showWatermark={false} screenHeight={`${viewportH}px`} site />;
});

function StatusBar({ ink = "#111" }: { ink?: string }) {
  return (
    <div className="relative flex items-center justify-between px-8" style={{ height: PHONE_STATUS_H, color: ink }}>
      <span style={{ fontSize: 16, fontWeight: 600 }}>9:41</span>
      <span className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ top: 10, width: 112, height: 32, backgroundColor: "#000" }} />
      <span className="flex items-center gap-1.5">
        <span
          className="rounded-sm"
          style={{
            width: 18,
            height: 10,
            border: `1.5px solid ${ink}`,
            opacity: 0.8,
          }}
        />
      </span>
    </div>
  );
}

// A phone frame `w` px wide showing a 390px-wide screen scaled to fit.
function Phone({ w, h, screenBg = "#fff", children }: { w: number; h: number; screenBg?: string; children: (rawH: number) => ReactNode }) {
  const bezel = Math.round(w * 0.035);
  const radius = Math.round(w * 0.16);
  const scale = (w - bezel * 2) / PHONE_RAW_W;
  const rawH = (h - bezel * 2) / scale;
  return (
    <div
      style={{
        width: w,
        height: h,
        padding: bezel,
        borderRadius: radius,
        background: "linear-gradient(150deg, #3A4254 0%, #151A24 45%, #0B0E14 100%)",
        boxShadow: "0 0 0 1px #4A5366, 0 50px 90px -30px rgba(28,41,66,0.55), 0 18px 36px -18px rgba(28,41,66,0.35)",
      }}
    >
      <div className="relative overflow-hidden w-full h-full" style={{ borderRadius: radius - bezel, backgroundColor: screenBg }}>
        <div
          style={{
            width: PHONE_RAW_W,
            height: rawH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children(rawH)}
        </div>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(125deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 30%)",
          }}
        />
      </div>
    </div>
  );
}

function InvitationPhone({ seed, w, h, scroll }: { seed: TemplatePreviewSeed; w: number; h: number; scroll: number }) {
  const bg = getPalette(seed.invitation.theme.paletteId).background;
  return (
    <Phone w={w} h={h} screenBg={bg}>
      {(rawH) => {
        const viewportH = rawH - PHONE_STATUS_H;
        return (
          <>
            <StatusBar ink={getPalette(seed.invitation.theme.paletteId).dark ? "#fff" : "#111"} />
            <ScrollBox top={scroll} height={viewportH}>
              <Invitation seed={seed} viewportH={viewportH} />
            </ScrollBox>
          </>
        );
      }}
    </Phone>
  );
}

// The vertical layouts' frame: a centered column inside the safe area.
function VStack({ gap, children }: { gap: number; children: ReactNode }) {
  return (
    <div className="absolute flex flex-col items-center justify-center" style={{ left: 70, right: 70, top: V_TOP, bottom: V_BOTTOM, gap }}>
      {children}
    </div>
  );
}

function Logo({ height, style }: { height: number; style?: CSSProperties }) {
  return <img src={logoMark} alt="Invyta" style={{ height, ...style }} />;
}

// ─── 1. Hook ──────────────────────────────────────────────────────────────
function HookScene({ lt }: { lt: number }) {
  const l1 = prog(lt, 0.2, 0.8);
  const l2 = prog(lt, 0.75, 0.8);
  const strike = prog(lt, 1.6, 0.5, easeInOut);
  const out = prog(lt, 3.0, 0.45, easeInOut);
  const logo = prog(lt, 3.3, 0.9);
  const tag = prog(lt, 3.9, 0.7);
  const v = useVertical();
  return (
    <div className="absolute flex items-center justify-center" style={v ? { left: 60, right: 60, top: V_TOP, bottom: V_BOTTOM } : { inset: 0 }}>
      <div className="absolute text-center" style={{ opacity: 1 - out, transform: `translateY(${-out * 40}px)` }}>
        <h1
          className="font-bold"
          style={{
            fontSize: v ? 100 : 104,
            lineHeight: 1.1,
            letterSpacing: "-0.035em",
            color: T.charcoal,
            margin: 0,
          }}
        >
          <span className="block" style={rise(l1, 40)}>
            Your celebration deserves
          </span>
          <span className="block" style={rise(l2, 40)}>
            more than a{" "}
            <span className="relative inline-block" style={{ color: T.muted }}>
              flat image.
              <span
                className="absolute left-0 rounded-full"
                style={{
                  top: "54%",
                  height: 8,
                  width: `${strike * 100}%`,
                  backgroundColor: T.rose,
                }}
              />
            </span>
          </span>
        </h1>
      </div>
      <div
        className="absolute flex flex-col items-center"
        style={{
          gap: 30,
          opacity: logo,
          transform: `scale(${0.9 + 0.1 * logo})`,
        }}
      >
        <Logo height={v ? 130 : 150} />
        <p
          className="text-center"
          style={{
            ...rise(tag, 16),
            fontSize: 34,
            lineHeight: 1.4,
            color: T.muted,
            margin: 0,
            maxWidth: v ? 860 : undefined,
          }}
        >
          Digital invitations, RSVPs and guest check-in{v ? <br /> : " "}— <Serif>in one link.</Serif>
        </p>
      </div>
    </div>
  );
}

// ─── 2. Hero ──────────────────────────────────────────────────────────────
function HeroScene({ lt }: { lt: number }) {
  const badge = prog(lt, 0.2, 0.6);
  const h1 = prog(lt, 0.35, 0.8);
  const sub = prog(lt, 0.7, 0.8);
  const devices = prog(lt, 0.3, 1.2);
  const zoom = 1 + 0.04 * prog(lt, 0, 5.4, (x) => x);
  const v = useVertical();
  const sceneScale = (v ? 920 : 860) / SCENE_W;
  const devices3d = (
    <div
      style={{
        opacity: devices,
        transform: `translateY(${(1 - devices) * 70}px) scale(${zoom})`,
        transformOrigin: "center",
      }}
    >
      <div style={{ width: SCENE_W * sceneScale, height: SCENE_H * sceneScale }}>
        <DeviceScene scale={sceneScale} entrance={false} />
      </div>
    </div>
  );
  if (v) {
    return (
      <VStack gap={30}>
        <span style={rise(badge, 16)} className="inline-flex items-center gap-2 rounded-full font-bold uppercase">
          <span
            className="inline-flex items-center gap-2 rounded-full"
            style={{
              fontSize: 20,
              letterSpacing: "0.14em",
              padding: "10px 22px",
              backgroundColor: T.goldTint,
              color: T.gold,
            }}
          >
            <span aria-hidden>✦</span> Made for Filipino celebrations
          </span>
        </span>
        <h1
          className="font-bold text-center"
          style={{
            ...rise(h1, 40),
            fontSize: 96,
            lineHeight: 1.05,
            letterSpacing: "-0.035em",
            color: T.charcoal,
            margin: 0,
          }}
        >
          Beautiful <Serif>invitations.</Serif>
          <br />
          Smarter events.
        </h1>
        <p
          className="text-center"
          style={{
            ...rise(sub, 24),
            fontSize: 32,
            lineHeight: 1.45,
            color: T.muted,
            margin: "0 0 20px",
            maxWidth: 880,
          }}
        >
          Your guests open one link — with RSVPs, reminders and check-in built in.
        </p>
        {devices3d}
      </VStack>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center" style={{ padding: "0 100px 0 130px", gap: 40 }}>
      <div className="flex flex-col items-start" style={{ width: 850, gap: 34 }}>
        <span style={rise(badge, 16)} className="inline-flex items-center gap-2 rounded-full font-bold uppercase">
          <span
            className="inline-flex items-center gap-2 rounded-full"
            style={{
              fontSize: 18,
              letterSpacing: "0.14em",
              padding: "10px 22px",
              backgroundColor: T.goldTint,
              color: T.gold,
            }}
          >
            <span aria-hidden>✦</span> Made for Filipino celebrations
          </span>
        </span>
        <h1
          className="font-bold"
          style={{
            ...rise(h1, 40),
            fontSize: 92,
            lineHeight: 1.05,
            letterSpacing: "-0.035em",
            color: T.charcoal,
            margin: 0,
          }}
        >
          Beautiful <Serif>invitations.</Serif>
          <br />
          Smarter events.
        </h1>
        <p
          style={{
            ...rise(sub, 24),
            fontSize: 32,
            lineHeight: 1.45,
            color: T.muted,
            margin: 0,
            maxWidth: 700,
          }}
        >
          A stunning invitation page your guests open from one link — with RSVPs, reminders and check-in built in.
        </p>
      </div>
      {devices3d}
    </div>
  );
}

// ─── 3. Templates ─────────────────────────────────────────────────────────
const TEMPLATE_ROW = ["Royal Debut", "Elegant Garden", "Pastel Dreams", "Soft Blooms", "Classic Navy"];
const categoryLabel = (id: string) => EVENT_CATEGORIES.find((c) => c.id === id)?.label ?? id;

function TemplatePhones({ lt, names, gap }: { lt: number; names: string[]; gap: number }) {
  const mid = (names.length - 1) / 2;
  return (
    <div className="flex items-start justify-center" style={{ gap }}>
      {names.map((name, i) => {
        const seed = TEMPLATE_PREVIEWS[name];
        const k = prog(lt, 0.6 + i * 0.14, 0.9);
        const arc = Math.abs(i - mid) * 26;
        const scroll = 640 * prog(lt, 2.1 + i * 0.1, 3.4, easeInOut);
        return (
          <div key={name} className="flex flex-col items-center" style={{ ...rise(k, 90), marginTop: arc, gap: 22 }}>
            <InvitationPhone seed={seed} w={290} h={600} scroll={scroll} />
            <div className="flex flex-col items-center" style={{ gap: 8 }}>
              <span className="font-semibold" style={{ fontSize: 24, color: T.charcoal }}>
                {name}
              </span>
              <span
                className="rounded-full font-semibold uppercase"
                style={{
                  fontSize: 14,
                  letterSpacing: "0.1em",
                  padding: "5px 14px",
                  backgroundColor: T.white,
                  color: T.muted,
                  border: `1px solid ${T.border}`,
                }}
              >
                {categoryLabel(seed.event.category)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TemplatesScene({ lt }: { lt: number }) {
  if (useVertical()) {
    return (
      <VStack gap={56}>
        <StepCaption
          lt={lt}
          step="1"
          title={
            <>
              Pick a <Serif>template.</Serif>
            </>
          }
          sub="Designs for weddings, debuts, birthdays, christenings, graduations and company events."
        />
        <TemplatePhones lt={lt} names={["Royal Debut", "Elegant Garden", "Pastel Dreams"]} gap={26} />
      </VStack>
    );
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center" style={{ paddingTop: 70 }}>
      <div className="flex items-end justify-between" style={{ width: 1640 }}>
        <StepCaption
          lt={lt}
          step="1"
          title={
            <>
              Pick a <Serif>template.</Serif>
            </>
          }
          sub=""
          width={900}
        />
        <p
          style={{
            ...rise(prog(lt, 0.6, 0.7)),
            fontSize: 28,
            lineHeight: 1.45,
            color: T.muted,
            margin: "0 0 14px",
            width: 640,
            textAlign: "right",
          }}
        >
          Designs for weddings, debuts, birthdays, christenings, graduations and company events.
        </p>
      </div>
      <div style={{ marginTop: 52 }}>
        <TemplatePhones lt={lt} names={TEMPLATE_ROW} gap={44} />
      </div>
    </div>
  );
}

// ─── 4. Customize ─────────────────────────────────────────────────────────
const SWATCHES = ["sage", "rose", "gold", "dusty-blue", "noir-gold", "burgundy", "lavender", "ocean", "marigold", "emerald", "terracotta"];
const CYCLE: { palette: string; font: string }[] = [
  { palette: "sage", font: "classic" },
  { palette: "rose", font: "romantic" },
  { palette: "noir-gold", font: "formal" },
  { palette: "dusty-blue", font: "modern" },
  { palette: "burgundy", font: "script" },
];
const FONT_CHIPS = ["classic", "romantic", "modern", "script", "formal"];

const customSeeds = new Map<string, TemplatePreviewSeed>();
function customSeed(palette: string, font: string): TemplatePreviewSeed {
  const key = `${palette}/${font}`;
  let seed = customSeeds.get(key);
  if (!seed) {
    const base = TEMPLATE_PREVIEWS["Elegant Garden"];
    const theme = {
      ...base.invitation.theme,
      paletteId: palette,
      fontPairingId: font,
    };
    seed = {
      ...base,
      event: { ...base.event, invitation: { ...base.event.invitation, theme } },
      invitation: { ...base.invitation, theme },
    };
    customSeeds.set(key, seed);
  }
  return seed;
}

function CustomizeScene({ lt }: { lt: number }) {
  const step = Math.min(CYCLE.length - 1, Math.max(0, Math.floor((lt - 1.1) / 0.85)));
  const current = lt < 1.1 ? CYCLE[0] : CYCLE[step];
  const sinceSwitch = lt < 1.1 ? 1 : ((lt - 1.1) % 0.85) / 0.85;
  const pulse = 1 + 0.12 * (1 - easeOut(clamp01(sinceSwitch * 3)));
  const phone = prog(lt, 0.3, 1);
  const panel = prog(lt, 0.8, 0.8);
  // Scroll past the cover to the countdown, where the palette shows best,
  // and hold there with a slight drift while the colors change.
  const scroll = 780 * prog(lt, 0.5, 1, easeInOut) + 60 * prog(lt, 1.6, 4.2, (x) => x);
  const v = useVertical();
  const picker = (
    <div
      className="rounded-3xl p-8"
      style={{
        ...rise(panel, 30),
        backgroundColor: T.white,
        border: `1px solid ${T.border}`,
        boxShadow: "0 20px 50px -30px rgba(28,41,66,0.35)",
      }}
    >
      <div className="text-[15px] font-semibold uppercase tracking-wide mb-5" style={{ color: T.muted }}>
        Color palette
      </div>
      <div className="flex flex-wrap" style={{ gap: 16 }}>
        {SWATCHES.map((id) => {
          const p = COLOR_PALETTES.find((c) => c.id === id)!;
          const active = id === current.palette;
          return (
            <span
              key={id}
              className="rounded-full"
              style={{
                width: 48,
                height: 48,
                background: `linear-gradient(135deg, ${p.primary} 50%, ${p.accent} 50%)`,
                boxShadow: active ? `0 0 0 3px ${T.white}, 0 0 0 6px ${T.charcoal}` : "inset 0 0 0 1px rgba(0,0,0,0.08)",
                transform: active ? `scale(${pulse})` : undefined,
              }}
            />
          );
        })}
      </div>
      <div className="text-[15px] font-semibold uppercase tracking-wide mt-8 mb-5" style={{ color: T.muted }}>
        Font pairing
      </div>
      <div className="flex flex-wrap" style={{ gap: 12 }}>
        {FONT_CHIPS.map((id) => {
          const f = FONT_PAIRINGS.find((p) => p.id === id)!;
          const active = id === current.font;
          return (
            <span
              key={id}
              className="rounded-xl"
              style={{
                fontFamily: f.headingFont,
                fontSize: 24,
                padding: "8px 18px",
                color: active ? T.white : T.charcoal,
                backgroundColor: active ? T.charcoal : T.cream,
                border: `1px solid ${active ? T.charcoal : T.border}`,
              }}
            >
              {f.label}
            </span>
          );
        })}
      </div>
    </div>
  );
  const phoneEl = (
    <div
      style={{
        opacity: phone,
        transform: `translateY(${(1 - phone) * 80}px) rotate(${(1 - phone) * 4}deg)`,
      }}
    >
      <InvitationPhone seed={customSeed(current.palette, current.font)} w={v ? 330 : 420} h={v ? 680 : 860} scroll={scroll} />
    </div>
  );
  if (v) {
    return (
      <VStack gap={40}>
        <StepCaption
          lt={lt}
          step="2"
          title={
            <>
              Make it <Serif>yours.</Serif>
            </>
          }
          sub="Your motif colors, fonts and layout, changed in a tap."
        />
        {phoneEl}
        {picker}
      </VStack>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ gap: 120 }}>
      <div className="flex flex-col" style={{ width: 780, gap: 44 }}>
        <StepCaption
          lt={lt}
          step="2"
          title={
            <>
              Make it <Serif>yours.</Serif>
            </>
          }
          sub="Your motif colors, fonts and layout — 20+ palettes, 9 font pairings and 5 page layouts, changed in a tap."
          width={760}
        />
        {picker}
      </div>
      {phoneEl}
    </div>
  );
}

// ─── 5. Share ─────────────────────────────────────────────────────────────
const COVER_IMAGE = "https://images.unsplash.com/photo-1519741497674-611481863552?w=800&h=420&fit=crop&auto=format";

function Bubble({ k, mine, name, children }: { k: number; mine?: boolean; name?: string; children: ReactNode }) {
  return (
    <div
      className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
      style={{
        opacity: k,
        transform: `translateY(${(1 - k) * 24}px) scale(${0.94 + 0.06 * k})`,
        transformOrigin: mine ? "bottom right" : "bottom left",
      }}
    >
      {name && <span style={{ fontSize: 13, color: "#8A8D93", margin: "0 0 4px 14px" }}>{name}</span>}
      <div
        style={{
          maxWidth: 280,
          fontSize: 17,
          lineHeight: 1.35,
          padding: "10px 15px",
          borderRadius: 20,
          backgroundColor: mine ? "#2F6FED" : "#ECECEF",
          color: mine ? "#fff" : "#111",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ShareScene({ lt }: { lt: number }) {
  const phone = prog(lt, 0.2, 1);
  const m1 = prog(lt, 1.0, 0.45);
  const card = prog(lt, 1.6, 0.5);
  const m2 = prog(lt, 2.7, 0.45);
  const m3 = prog(lt, 3.3, 0.45);
  const m4 = prog(lt, 3.9, 0.45);
  const channels = ["Messenger", "Viber", "WhatsApp", "SMS", "Email"];
  const v = useVertical();
  const channelChips = (
    <div className={`flex flex-wrap ${v ? "justify-center" : ""}`} style={{ gap: 12 }}>
      {channels.map((c, i) => (
        <span
          key={c}
          className="rounded-full font-semibold"
          style={{
            ...rise(prog(lt, 1.2 + i * 0.1, 0.6), 14),
            fontSize: 20,
            padding: "10px 20px",
            backgroundColor: T.white,
            border: `1px solid ${T.border}`,
            color: T.charcoal,
          }}
        >
          {c}
        </span>
      ))}
    </div>
  );
  const phoneEl = (
    <div style={{ opacity: phone, transform: `translateY(${(1 - phone) * 80}px)` }}>
      <Phone w={v ? 380 : 420} h={v ? 780 : 860} screenBg="#FFFFFF">
        {(rawH) => (
          <div
            className="flex flex-col"
            style={{
              height: rawH,
              fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
            }}
          >
            <StatusBar />
            <div className="flex items-center gap-3 px-5 pb-3" style={{ borderBottom: "1px solid #EEE" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: "#C9A66B", fontSize: 15 }}>
                FAM
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600, color: "#111" }}>Santos Family 💛</div>
                <div style={{ fontSize: 13, color: "#8A8D93" }}>24 members</div>
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-end px-4 pb-6" style={{ gap: 12 }}>
              <Bubble k={m1} mine>
                Save the date! 💍 Here's our invitation:
              </Bubble>
              <div
                className="flex justify-end"
                style={{
                  opacity: card,
                  transform: `translateY(${(1 - card) * 24}px)`,
                }}
              >
                <div
                  className="overflow-hidden"
                  style={{
                    width: 290,
                    borderRadius: 18,
                    backgroundColor: "#ECECEF",
                  }}
                >
                  <img
                    src={COVER_IMAGE}
                    alt=""
                    style={{
                      width: "100%",
                      height: 150,
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  <div style={{ padding: "10px 14px 12px" }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#111" }}>Elena & Marco — You're invited</div>
                    <div style={{ fontSize: 13, color: "#55585E", marginTop: 2 }}>Friday, January 29, 2027 · The Blue Leaf, Taguig</div>
                    <div style={{ fontSize: 12, color: "#8A8D93", marginTop: 6 }}>invyta.app</div>
                  </div>
                </div>
              </div>
              <Bubble k={m2} name="Tita Baby">
                Ang ganda!! 😍😍
              </Bubble>
              <Bubble k={m3} name="Paolo">
                RSVP'd na ako, see you there! 🎉
              </Bubble>
              <Bubble k={m4} name="Lola Nena">
                Added it to my calendar ❤️
              </Bubble>
            </div>
          </div>
        )}
      </Phone>
    </div>
  );
  if (v) {
    return (
      <VStack gap={40}>
        <StepCaption
          lt={lt}
          step="3"
          title={
            <>
              Share <Serif>one link.</Serif>
            </>
          }
          sub="Drop it in the group chat — it opens on any phone."
        />
        {phoneEl}
        {channelChips}
      </VStack>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ gap: 130 }}>
      {phoneEl}
      <div className="flex flex-col" style={{ width: 720, gap: 40 }}>
        <StepCaption
          lt={lt}
          step="3"
          title={
            <>
              Share <Serif>one link.</Serif>
            </>
          }
          sub="Drop it in the group chat. It opens beautifully on any phone with a proper preview card — no app to install."
          width={720}
        />
        {channelChips}
      </div>
    </div>
  );
}

// ─── 6. RSVPs ─────────────────────────────────────────────────────────────
const GUESTS = [
  {
    name: "Maria Santos",
    group: "Bride's family",
    status: "confirmed",
    plus: 2,
    at: 1.1,
  },
  {
    name: "Paolo Reyes",
    group: "Friends",
    status: "confirmed",
    plus: 1,
    at: 1.5,
  },
  {
    name: "Andrea Cruz",
    group: "Groom's family",
    status: "confirmed",
    plus: 3,
    at: 1.9,
  },
  {
    name: "Joaquin Bautista",
    group: "Officemates",
    status: "declined",
    plus: 0,
    at: 2.3,
  },
  {
    name: "Bea Villanueva",
    group: "Friends",
    status: "confirmed",
    plus: 2,
    at: 2.7,
  },
  {
    name: "Nena Garcia",
    group: "Bride's family",
    status: "pending",
    plus: 0,
    at: 3.1,
  },
] as const;
const STATUS = {
  confirmed: { label: "Confirmed", color: T.green },
  pending: { label: "Pending", color: T.amber },
  declined: { label: "Declined", color: T.red },
};

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="p-6 flex-1"
      style={{
        backgroundColor: T.white,
        borderRadius: 16,
        borderLeft: `4px solid ${color}`,
        boxShadow: "0 1px 2px rgba(28,41,66,0.05)",
      }}
    >
      <div className="font-semibold uppercase tracking-wide mb-3" style={{ fontSize: 14, color: T.muted }}>
        {label}
      </div>
      <div
        className="font-bold"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 48,
          lineHeight: 1,
          color: T.charcoal,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RsvpScene({ lt }: { lt: number }) {
  const v = useVertical();
  const win = prog(lt, 0.3, 1);
  const count = prog(lt, 1.0, 3.6, easeInOut);
  const confirmed = Math.round(86 * count);
  const declined = Math.round(12 * count);
  const pending = 120 - confirmed - declined;
  const toast = prog(lt, 3.4, 0.5) * (1 - prog(lt, 5.6, 0.4));
  const nav: {
    label: string;
    icon: Parameters<typeof Icon>[0]["name"];
    active?: boolean;
  }[] = [
    { label: "Events", icon: "calendar" },
    { label: "Guests", icon: "users", active: true },
    { label: "Reminders", icon: "send" },
    { label: "Check-in", icon: "qr" },
    { label: "Analytics", icon: "chart" },
  ];
  // The vertical cut drops the Group column to fit the narrower card.
  const columns = v ? "1fr 150px 50px" : "1fr 220px 160px 100px";

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <div style={{ fontSize: 15, color: T.muted }}>Wedding · Jan 29, 2027</div>
        <div
          className="font-bold"
          style={{
            fontSize: v ? 28 : 32,
            color: T.charcoal,
            letterSpacing: "-0.02em",
          }}
        >
          Elena & Marco — Guests
        </div>
      </div>
      <span
        className="flex items-center gap-2 rounded-xl font-semibold"
        style={{
          fontSize: 17,
          padding: "12px 20px",
          backgroundColor: T.accent,
          color: T.white,
        }}
      >
        <Icon name="send" size={16} color={T.white} /> {v ? "Remind" : "Remind pending"}
      </span>
    </div>
  );
  const stats = (
    <div className={v ? "grid grid-cols-2" : "flex"} style={{ gap: 18 }}>
      <Stat label="Invited" value={120} color={T.accent} />
      <Stat label="Confirmed" value={confirmed} color={T.green} />
      <Stat label="Pending" value={pending} color={T.amber} />
      <Stat label="Declined" value={declined} color={T.red} />
    </div>
  );
  const guests = (
    <div className="rounded-2xl flex-1 overflow-hidden" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
      <div
        className="grid font-semibold uppercase tracking-wide"
        style={{
          gridTemplateColumns: columns,
          gap: 16,
          padding: "14px 24px",
          fontSize: 13,
          color: T.muted,
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <span>Guest</span>
        {!v && <span>Group</span>}
        <span>RSVP</span>
        <span>{v ? "+" : "+Guests"}</span>
      </div>
      {GUESTS.map((g, i) => {
        const k = prog(lt, g.at, 0.5);
        const s = STATUS[g.status];
        return (
          <div
            key={g.name}
            className="grid items-center"
            style={{
              ...rise(k, -16),
              gridTemplateColumns: columns,
              gap: 16,
              padding: v ? "13px 24px" : "11px 24px",
              borderBottom: i < GUESTS.length - 1 ? `1px solid ${T.border}` : undefined,
              backgroundColor: k < 1 ? `rgba(201,166,107,${0.16 * (1 - k)})` : undefined,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                style={{
                  width: 36,
                  height: 36,
                  fontSize: 13,
                  backgroundColor: T.accent,
                }}
              >
                {g.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
              <span style={{ fontSize: 18, fontWeight: 500, color: T.charcoal }}>{g.name}</span>
            </div>
            {!v && <span style={{ fontSize: 16, color: T.muted }}>{g.group}</span>}
            <span className="inline-flex items-center gap-2 font-semibold uppercase tracking-wide" style={{ fontSize: 13, color: s.color }}>
              <span className="rounded-full" style={{ width: 8, height: 8, backgroundColor: s.color }} />
              {s.label}
            </span>
            <span style={{ fontSize: 16, color: T.muted }}>{g.plus || "—"}</span>
          </div>
        );
      })}
    </div>
  );
  const newRsvp = (
    <div
      className="absolute flex items-center gap-4 rounded-2xl"
      style={{
        right: v ? 20 : 32,
        left: v ? 20 : undefined,
        top: v ? 20 : 24,
        padding: "18px 24px",
        backgroundColor: T.charcoal,
        color: T.white,
        opacity: toast,
        transform: `translateY(${(toast - 1) * 30}px)`,
        boxShadow: "0 20px 40px -16px rgba(28,41,66,0.6)",
      }}
    >
      <span className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: 38, height: 38, backgroundColor: T.green }}>
        <Icon name="checkCircle" size={20} color={T.white} />
      </span>
      <div>
        <div className="font-semibold" style={{ fontSize: 17 }}>
          New RSVP — Bea Villanueva
        </div>
        <div style={{ fontSize: 15, opacity: 0.75 }}>Attending · bringing 2 · song request: "Ikaw"</div>
      </div>
    </div>
  );

  if (v) {
    return (
      <VStack gap={44}>
        <StepCaption
          lt={lt}
          step="4"
          title={
            <>
              Watch RSVPs <Serif>roll in.</Serif>
            </>
          }
          sub="Every reply in one dashboard. Nudge the rest in a tap."
        />
        <div
          className="relative flex flex-col overflow-hidden"
          style={{
            ...rise(win, 60),
            width: 940,
            padding: 28,
            gap: 22,
            borderRadius: 28,
            backgroundColor: T.cream,
            border: `1px solid ${T.border}`,
            boxShadow: "0 50px 100px -40px rgba(28,41,66,0.45)",
          }}
        >
          {header}
          {stats}
          {guests}
          {newRsvp}
        </div>
      </VStack>
    );
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center" style={{ paddingTop: 64 }}>
      <div className="flex items-end justify-between" style={{ width: 1600 }}>
        <StepCaption
          lt={lt}
          step="4"
          title={
            <>
              Watch RSVPs <Serif>roll in.</Serif>
            </>
          }
          sub=""
          width={900}
        />
        <p
          style={{
            ...rise(prog(lt, 0.6, 0.7)),
            fontSize: 28,
            lineHeight: 1.45,
            color: T.muted,
            margin: "0 0 14px",
            width: 620,
            textAlign: "right",
          }}
        >
          Every reply lands in one clean dashboard. Nudge the rest with a one-tap reminder.
        </p>
      </div>
      <div
        className="relative flex overflow-hidden"
        style={{
          ...rise(win, 60),
          width: 1600,
          height: 700,
          marginTop: 44,
          borderRadius: 24,
          backgroundColor: T.cream,
          border: `1px solid ${T.border}`,
          boxShadow: "0 50px 100px -40px rgba(28,41,66,0.45)",
        }}
      >
        <aside
          className="flex flex-col"
          style={{
            width: 270,
            padding: "30px 22px",
            backgroundColor: T.white,
            borderRight: `1px solid ${T.border}`,
            gap: 6,
          }}
        >
          <Logo height={40} style={{ alignSelf: "flex-start", margin: "0 0 30px 10px" }} />
          {nav.map((n) => (
            <div
              key={n.label}
              className="flex items-center gap-3 rounded-xl"
              style={{
                padding: "12px 14px",
                fontSize: 18,
                fontWeight: n.active ? 600 : 500,
                color: n.active ? T.white : T.charcoal,
                backgroundColor: n.active ? T.accent : "transparent",
              }}
            >
              <Icon name={n.icon} size={20} color={n.active ? T.white : T.muted} />
              {n.label}
            </div>
          ))}
        </aside>
        <main className="flex-1 flex flex-col" style={{ padding: "30px 40px", gap: 24 }}>
          {header}
          {stats}
          {guests}
        </main>
        {newRsvp}
      </div>
    </div>
  );
}

// ─── 7. Check-in ──────────────────────────────────────────────────────────
const GuestQr = memo(function GuestQr() {
  return <QrCode payload="https://invyta.app/i/elena-and-marco/g/maria-santos" size={230} />;
});

function CheckinScene({ lt }: { lt: number }) {
  const phone = prog(lt, 0.2, 1);
  const scan = clamp01((lt - 1.0) / 1.1);
  const scanned = prog(lt, 2.2, 0.45);
  const count = Math.round(63 + prog(lt, 2.3, 0.6));
  const card = prog(lt, 1.0, 0.8);
  const v = useVertical();
  const counter = (
    <div
      className="rounded-3xl p-8"
      style={{
        ...rise(card, 30),
        width: v ? 760 : undefined,
        backgroundColor: T.white,
        border: `1px solid ${T.border}`,
        boxShadow: "0 20px 50px -30px rgba(28,41,66,0.35)",
      }}
    >
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="font-semibold uppercase tracking-wide" style={{ fontSize: 15, color: T.muted }}>
            Checked in
          </div>
          <div
            className="font-bold"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 60,
              lineHeight: 1.1,
              color: T.charcoal,
            }}
          >
            {count} <span style={{ fontSize: 30, color: T.muted }}>/ 98 arriving</span>
          </div>
        </div>
        <span className="font-semibold" style={{ fontSize: 18, color: T.green, opacity: scanned }}>
          +1 just now
        </span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 14, backgroundColor: T.surface }}>
        <div className="h-full rounded-full" style={{ width: `${(count / 98) * 100}%`, backgroundColor: T.green }} />
      </div>
    </div>
  );
  const scanner = (
    <div style={{ opacity: phone, transform: `translateY(${(1 - phone) * 80}px)` }}>
      <Phone w={v ? 360 : 420} h={v ? 740 : 860} screenBg="#0E121A">
        {(rawH) => (
          <div
            className="relative flex flex-col"
            style={{
              height: rawH,
              background: "radial-gradient(circle at 50% 45%, #3A3530 0%, #15161A 70%)",
            }}
          >
            <StatusBar ink="#fff" />
            <div
              className="text-center"
              style={{
                color: "#fff",
                fontSize: 19,
                fontWeight: 600,
                marginTop: 18,
              }}
            >
              Scan guest QR
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="relative" style={{ width: 290, height: 290 }}>
                <div
                  className="absolute flex items-center justify-center rounded-2xl"
                  style={{
                    inset: 18,
                    backgroundColor: "#fff",
                    transform: "rotate(-4deg)",
                  }}
                >
                  <GuestQr />
                </div>
                {[
                  { top: 0, left: 0, br: "18px 0 0 0", bw: "5px 0 0 5px" },
                  { top: 0, right: 0, br: "0 18px 0 0", bw: "5px 5px 0 0" },
                  { bottom: 0, left: 0, br: "0 0 0 18px", bw: "0 0 5px 5px" },
                  { bottom: 0, right: 0, br: "0 0 18px 0", bw: "0 5px 5px 0" },
                ].map(({ br, bw, ...pos }, i) => (
                  <span
                    key={i}
                    className="absolute"
                    style={{
                      ...pos,
                      width: 56,
                      height: 56,
                      borderStyle: "solid",
                      borderColor: scanned > 0 ? "#3DDC84" : "#fff",
                      borderRadius: br,
                      borderWidth: bw,
                    }}
                  />
                ))}
                {scan > 0 && scan < 1 && (
                  <span
                    className="absolute left-3 right-3"
                    style={{
                      top: 12 + scan * 262,
                      height: 3,
                      backgroundColor: "#3DDC84",
                      boxShadow: "0 0 18px 4px rgba(61,220,132,0.6)",
                    }}
                  />
                )}
              </div>
            </div>
            <div
              className="mx-5 mb-8 rounded-3xl flex items-center gap-4"
              style={{
                padding: "20px 22px",
                backgroundColor: "#fff",
                opacity: scanned,
                transform: `translateY(${(1 - scanned) * 40}px)`,
              }}
            >
              <span className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: 52, height: 52, backgroundColor: T.green }}>
                <Icon name="checkCircle" size={28} color="#fff" />
              </span>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: T.charcoal }}>Welcome, Maria Santos!</div>
                <div style={{ fontSize: 15, color: T.muted }}>Checked in · party of 3</div>
              </div>
            </div>
          </div>
        )}
      </Phone>
    </div>
  );
  if (v) {
    return (
      <VStack gap={40}>
        <StepCaption
          lt={lt}
          step="5"
          title={
            <>
              Event day? <Serif>Scan & go.</Serif>
            </>
          }
          sub="Check guests in at the door with just your phone."
        />
        {scanner}
        {counter}
      </VStack>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ gap: 130 }}>
      <div className="flex flex-col" style={{ width: 720, gap: 44 }}>
        <StepCaption
          lt={lt}
          step="5"
          title={
            <>
              Event day?
              <br />
              <Serif>Scan & go.</Serif>
            </>
          }
          sub="Every guest gets a personal QR code. Check them in at the door with just your phone — no extra hardware."
          width={720}
        />
        {counter}
      </div>
      {scanner}
    </div>
  );
}

// ─── 8. Outro ─────────────────────────────────────────────────────────────
function OutroScene({ lt }: { lt: number }) {
  const logo = prog(lt, 0.2, 0.9);
  const h = prog(lt, 0.5, 0.8);
  const sub = prog(lt, 0.85, 0.8);
  const cta = prog(lt, 1.2, 0.8);
  const v = useVertical();
  return (
    <div
      className="absolute flex flex-col items-center justify-center text-center"
      style={{
        gap: 40,
        ...(v ? { left: 70, right: 70, top: V_TOP, bottom: V_BOTTOM } : { inset: 0 }),
      }}
    >
      <div style={{ opacity: logo, transform: `scale(${0.92 + 0.08 * logo})` }}>
        <Logo height={110} />
      </div>
      <h1
        className="font-bold"
        style={{
          ...rise(h, 40),
          fontSize: 96,
          lineHeight: 1.05,
          letterSpacing: "-0.035em",
          color: T.charcoal,
          margin: 0,
        }}
      >
        Every event{v ? <br /> : " "}starts <Serif>free.</Serif>
      </h1>
      <p
        style={{
          ...rise(sub, 24),
          fontSize: 32,
          lineHeight: 1.45,
          color: T.muted,
          margin: 0,
          maxWidth: v ? 860 : 1100,
        }}
      >
        Upgrade only the event that needs more, once — pay with GCash, Maya or any bank app. No subscription.
      </p>
      <div className={v ? "flex flex-col items-center" : "inline-flex items-center"} style={{ ...rise(cta, 24), gap: 28, marginTop: 12 }}>
        <span
          className="rounded-full font-semibold"
          style={{
            fontSize: 34,
            padding: "22px 48px",
            backgroundColor: T.accent,
            color: T.white,
          }}
        >
          Create yours free
        </span>
        <span className="font-semibold" style={{ fontSize: 38, color: T.charcoal }}>
          invyta.app
        </span>
      </div>
    </div>
  );
}

// ─── Composition ──────────────────────────────────────────────────────────
function Composition({ t, format }: { t: number; format: Format }) {
  const { w, h } = FORMATS[format];
  return (
    <VerticalContext.Provider value={format === "vertical"}>
      <div
        className="relative overflow-hidden"
        style={{
          width: w,
          height: h,
          backgroundColor: T.cream,
          fontFamily: "var(--font-sans)",
        }}
      >
        <Backdrop t={t} />
        <Scene t={t} id="hook">
          {(lt) => <HookScene lt={lt} />}
        </Scene>
        <Scene t={t} id="hero">
          {(lt) => <HeroScene lt={lt} />}
        </Scene>
        <Scene t={t} id="templates">
          {(lt) => <TemplatesScene lt={lt} />}
        </Scene>
        <Scene t={t} id="customize">
          {(lt) => <CustomizeScene lt={lt} />}
        </Scene>
        <Scene t={t} id="share">
          {(lt) => <ShareScene lt={lt} />}
        </Scene>
        <Scene t={t} id="rsvps">
          {(lt) => <RsvpScene lt={lt} />}
        </Scene>
        <Scene t={t} id="checkin">
          {(lt) => <CheckinScene lt={lt} />}
        </Scene>
        <Scene t={t} id="outro">
          {(lt) => <OutroScene lt={lt} />}
        </Scene>
      </div>
    </VerticalContext.Provider>
  );
}

export default function ProductVideo() {
  const [params] = useSearchParams();
  const frozen = params.get("t");
  const capture = params.has("capture");
  const format: Format = params.get("format") === "vertical" ? "vertical" : "landscape";
  const { w: width, h: height } = FORMATS[format];
  const [t, setT] = useState(frozen ? Number(frozen) : 0);
  const [fit, setFit] = useState(1);

  // The render script sets the clock itself, one frame at a time.
  useEffect(() => {
    window.__videoDuration = VIDEO_DURATION;
    window.__videoSize = FORMATS[format];
    window.__voiceover = VOICEOVER.map((line) => ({
      start: SCENES[line.scene][0] + line.at,
      text: line.say ?? line.text,
    }));
    window.__setVideoTime = (next) =>
      new Promise((resolve) => {
        flushSync(() => setT(next));
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    return () => {
      delete window.__setVideoTime;
    };
  }, [format]);

  // In the browser, play on a loop in real time.
  useEffect(() => {
    if (capture || frozen) return;
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      setT(((now - startedAt) / 1000) % VIDEO_DURATION);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [capture, frozen]);

  useEffect(() => {
    if (capture) return;
    const update = () => setFit(Math.min(window.innerWidth / width, window.innerHeight / height));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [capture, width, height]);

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: "#0B0E14" }}>
      <div
        style={{
          width: width * fit,
          height: height * fit,
          position: capture ? "fixed" : "relative",
          top: 0,
          left: 0,
        }}
      >
        <div style={{ transform: `scale(${fit})`, transformOrigin: "top left" }}>
          <Composition t={t} format={format} />
        </div>
      </div>
    </div>
  );
}
