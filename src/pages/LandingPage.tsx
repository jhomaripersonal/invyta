import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, animate, motionValue, useReducedMotion, AnimatePresence, MotionConfig, type Variants } from "framer-motion";
import webAppLogo from "../assets/webApp-logo-mark.png";
import { Icon, type IconName } from "../components/Icon";
import { SectionList } from "../components/invitation/SectionList";
import { resolveTheme } from "../components/invitation/theme";
import TemplatePreviewModal from "../components/invitation/TemplatePreviewModal";
import { TEMPLATES as CATALOG_TEMPLATES } from "../data/templates";
import { listApprovedTestimonials, type PublicTestimonial } from "../lib/testimonials";
import { SECTION_ORDER } from "../data/default-invitation";
import type { EventRecord } from "../lib/events-store";
import type { EventCategory, InvitationConfig } from "../types/models";
import { PAYMENTS_ENABLED, formatPeso, upgradePriceCentavos } from "../data/pricing";
import { T } from "../lib/tokens";

type NavTarget = "landing" | "dashboard" | "login" | "register";

// ─── Scroll-reveal primitives ───────────────────────────────────────────────
// A section's heading/content fades up into place the first time it scrolls
// into view; grids of cards (steps, features, templates, testimonials,
// pricing) stagger their children in one after another rather than popping
// in all at once.
const EASE = [0.22, 1, 0.36, 1] as const;

// Blocks come into focus as they arrive: a short rise out of a soft blur.
// The blur is dropped entirely once settled (transitionEnd) — a lingering
// `filter: blur(0)` keeps every revealed block on its own compositing
// layer for the life of the page.
const REVEAL_HIDDEN = { opacity: 0, y: 16, filter: "blur(10px)" };
const revealShow = (delay = 0) => ({
  opacity: 1,
  y: 0,
  filter: "blur(0px)",
  transition: { duration: 0.45, ease: EASE, delay },
  transitionEnd: { filter: "none" },
});

const fadeUp: Variants = {
  hidden: REVEAL_HIDDEN,
  show: revealShow(),
};

// A tight stagger, so a row of cards reads as one arrival rather than a
// slow queue.
const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
};

type RevealProps = { children: React.ReactNode; className?: string; style?: React.CSSProperties };

function Reveal({ children, className, style, delay = 0 }: RevealProps & { delay?: number }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{ hidden: REVEAL_HIDDEN, show: revealShow(delay) }}
    >
      {children}
    </motion.div>
  );
}

function RevealGroup({ children, className, style }: RevealProps) {
  return (
    <motion.div className={className} style={style} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={staggerContainer}>
      {children}
    </motion.div>
  );
}

function RevealItem({ children, className, style, onClick }: RevealProps & { onClick?: () => void }) {
  return (
    <motion.div className={className} style={style} variants={fadeUp} onClick={onClick}>
      {children}
    </motion.div>
  );
}


// ─── Reusable primitives ────────────────────────────────────────────────────
function SectionLabel({ children }: { children: string }) {
  return <p className="text-xs font-bold uppercase tracking-[0.15em] mb-3" style={{ color: T.accent }}>{children}</p>;
}

function SectionHeading({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-3xl md:text-4xl font-bold leading-tight ${className}`} style={{ letterSpacing: "-0.025em" }}>{children}</h2>;
}

function Serif({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>{children}</span>;
}

// ─── Icons ──────────────────────────────────────────────────────────────────
const ChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 3l4 4-4 4"/></svg>
);

// ─── Hero device scene ───────────────────────────────────────────────────
// A laptop with a phone leaning in front of it, both showing the real
// invitation a guest would get — the same SectionList tree (in the public
// page's website mode) that the builder preview and /i/:slug render — so
// "one link, looks right on every screen" reads at a glance instead of
// behind a carousel.
//
// Each screen is rendered at the device's real CSS size (1280px laptop,
// 390px phone) and scaled down to fit its frame — the standard mockup
// trick; the invitation's container queries then give each screen its
// true layout. The pages scroll themselves (real scrollTop, so the site's
// sticky top bar stays put) on a slow loop, like someone reading through.
//
// Scene geometry is in "scene px" at a fixed natural size; useFitScale
// shrinks the whole scene to whatever width its column has.

const HERO_THEME = { paletteId: "gold", fontPairingId: "classic", buttonStyle: "rounded" } as const;
const HERO_PALETTE = resolveTheme(HERO_THEME).palette;
const HERO_URL = { host: "invytaph.sbs", path: "/i/elena-and-marco" };

const HERO_EVENT: EventRecord = {
  id: "hero-preview",
  ownerId: "hero-preview",
  name: "Elena & Marco",
  category: "wedding",
  host: "",
  date: "2026-09-25",
  time: "16:00",
  venueName: "The Blue Leaf",
  venueAddress: "Taguig City",
  status: "published",
  slug: "hero-preview",
  imageUrl: "photo-1519741497674-611481863552",
  guestCount: 108,
  confirmedGuestCount: 87,
  pendingGuestCount: 12,
  invitation: { sections: [], theme: HERO_THEME },
  plan: "free",
  ownerPlan: "free",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const HERO_CONTENT: Partial<Record<string, Record<string, unknown>>> = {
  cover: {},
  countdown: {},
  details: { description: "Join us as we celebrate the beginning of our forever, surrounded by the people who mean the most to us." },
  venue: { name: "The Blue Leaf", address: "Taguig City" },
  rsvp: { prompt: "Will you celebrate with us?" },
};

const HERO_INVITATION: InvitationConfig = {
  theme: HERO_THEME,
  sections: SECTION_ORDER.map((type, index) => ({ type, order: index, enabled: type in HERO_CONTENT, content: HERO_CONTENT[type] ?? {} })),
};

// Natural scene size, scene px.
export const SCENE_W = 540;
export const SCENE_H = 410;

// Laptop: lid (bezel + screen) over a wider aluminium base.
const LAPTOP = {
  left: 0,
  top: 16,
  screenW: 440,
  screenH: 275, // 16:10
  bezel: 10,
  bezelTop: 14, // a little deeper for the camera
  baseW: 510,
  baseH: 13,
  rawW: 1280, // CSS width the page is rendered at
  chromeH: 64, // browser toolbar, raw px
};
const LAPTOP_SCALE = LAPTOP.screenW / LAPTOP.rawW;
const LAPTOP_RAW_H = LAPTOP.screenH / LAPTOP_SCALE;

// Phone: in front of the laptop's right side, standing slightly lower so
// it reads as nearer.
const PHONE = {
  w: 150,
  h: 318, // ≈ 9:19
  bezel: 5,
  radius: 30,
  right: 4,
  bottom: 14,
  rawW: 390,
  statusH: 54, // status bar incl. the Dynamic Island, raw px
  toolbarH: 84, // browser address bar + home indicator, raw px
};
const PHONE_SCALE = (PHONE.w - PHONE.bezel * 2) / PHONE.rawW;
const PHONE_RAW_H = (PHONE.h - PHONE.bezel * 2) / PHONE_SCALE;

// Scrolls its content down and back up forever, pausing at each end — only
// while it's on screen, and not at all for visitors who ask their device
// for reduced motion.
function AutoScroll({ height, delay, children }: { height: number; delay: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion) return;
    const position = motionValue(0);
    const unsubscribe = position.on("change", (v) => {
      el.scrollTop = v;
    });
    let controls: ReturnType<typeof animate> | undefined;
    let visible = true;

    // Let webfonts and images settle before measuring how far there is to go.
    const start = setTimeout(() => {
      const distance = el.scrollHeight - el.clientHeight;
      if (distance <= 0) return;
      controls = animate(position, [0, 0, distance, distance, 0], {
        duration: 22,
        times: [0, 0.1, 0.5, 0.62, 1],
        ease: "easeInOut",
        repeat: Infinity,
      });
      if (!visible) controls.pause();
    }, 600 + delay);

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) controls?.play();
      else controls?.pause();
    });
    observer.observe(el);

    return () => {
      clearTimeout(start);
      controls?.stop();
      unsubscribe();
      observer.disconnect();
    };
  }, [reduceMotion, delay]);

  return (
    <div ref={ref} className="overflow-hidden" style={{ height }}>
      {children}
    </div>
  );
}

// The invitation itself at raw (device CSS) size, in website mode with its
// cover filling the visible screen, as on a real visit.
function HeroInvitation({ viewportH }: { viewportH: number }) {
  return <SectionList invitation={HERO_INVITATION} event={HERO_EVENT} interactive={false} showWatermark={false} screenHeight={`${viewportH}px`} site />;
}

const LockGlyph = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill={color} aria-hidden>
    <path d="M3.5 5V3.75a2.5 2.5 0 0 1 5 0V5h.25A1.25 1.25 0 0 1 10 6.25v3.5A1.25 1.25 0 0 1 8.75 11h-5.5A1.25 1.25 0 0 1 2 9.75v-3.5A1.25 1.25 0 0 1 3.25 5zm1.25 0h2.5V3.75a1.25 1.25 0 0 0-2.5 0z" />
  </svg>
);

function LaptopScreen() {
  const viewportH = LAPTOP_RAW_H - LAPTOP.chromeH;
  return (
    <div style={{ width: LAPTOP.rawW, height: LAPTOP_RAW_H, transform: `scale(${LAPTOP_SCALE})`, transformOrigin: "top left", backgroundColor: HERO_PALETTE.background }}>
      {/* Browser toolbar */}
      <div className="flex items-center gap-6 px-6" style={{ height: LAPTOP.chromeH, backgroundColor: "#ECEAE6", borderBottom: "1px solid #D9D5CE" }}>
        <div className="flex gap-2.5">
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <span key={c} className="rounded-full" style={{ width: 14, height: 14, backgroundColor: c }} />
          ))}
        </div>
        <div className="flex-1 flex justify-center">
          <div className="flex items-center justify-center gap-2.5 rounded-xl" style={{ width: 600, height: 38, backgroundColor: "#FFFFFF", color: "#57534E", fontSize: 17 }}>
            <LockGlyph size={14} color="#78716C" />
            <span>
              <span style={{ color: "#1C2942" }}>{HERO_URL.host}</span>
              {HERO_URL.path}
            </span>
          </div>
        </div>
        <div style={{ width: 66 }} />
      </div>
      <AutoScroll height={viewportH} delay={0}>
        <HeroInvitation viewportH={viewportH} />
      </AutoScroll>
    </div>
  );
}

function PhoneScreen() {
  const viewportH = PHONE_RAW_H - PHONE.statusH - PHONE.toolbarH;
  const ink = HERO_PALETTE.dark ? "#FFFFFF" : "#111111";
  return (
    <div className="relative" style={{ width: PHONE.rawW, height: PHONE_RAW_H, transform: `scale(${PHONE_SCALE})`, transformOrigin: "top left", backgroundColor: HERO_PALETTE.background }}>
      {/* Status bar, tinted to the page like a real mobile browser */}
      <div className="relative flex items-center justify-between px-8" style={{ height: PHONE.statusH, color: ink }}>
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>9:41</span>
        <span className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ top: 11, width: 122, height: 35, backgroundColor: "#000" }} />
        <svg width="72" height="14" viewBox="0 0 72 14" fill={ink} aria-hidden>
          {/* signal */}
          <rect x="0" y="9" width="3.5" height="5" rx="1" />
          <rect x="5.5" y="6.5" width="3.5" height="7.5" rx="1" />
          <rect x="11" y="4" width="3.5" height="10" rx="1" />
          <rect x="16.5" y="1" width="3.5" height="13" rx="1" />
          {/* wifi */}
          <path d="M34 13.5l-2.3-2.8a3.6 3.6 0 0 1 4.6 0zM29.3 8a7.3 7.3 0 0 1 9.4 0l-1.5 1.8a4.9 4.9 0 0 0-6.4 0zM26.8 5a11 11 0 0 1 14.4 0l-1.5 1.8a8.7 8.7 0 0 0-11.4 0z" />
          {/* battery */}
          <rect x="46.5" y="1.5" width="22" height="11" rx="3" fill="none" stroke={ink} strokeOpacity="0.4" />
          <rect x="48.5" y="3.5" width="18" height="7" rx="1.5" />
          <path d="M70 5.5v3a1.5 1.5 0 0 0 0-3z" fillOpacity="0.4" />
        </svg>
      </div>
      <AutoScroll height={viewportH} delay={3500}>
        <HeroInvitation viewportH={viewportH} />
      </AutoScroll>
      {/* Browser address bar + home indicator */}
      <div className="flex flex-col items-center" style={{ height: PHONE.toolbarH, backgroundColor: "rgba(246,245,243,0.96)", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
        <div className="flex items-center justify-center gap-2 rounded-2xl mt-2.5" style={{ width: 350, height: 44, backgroundColor: "#E7E5E1", color: "#1C1917", fontSize: 17 }}>
          <LockGlyph size={13} color="#57534E" />
          {HERO_URL.host}
        </div>
        <span className="rounded-full mt-auto mb-2" style={{ width: 134, height: 5, backgroundColor: "#111" }} />
      </div>
    </div>
  );
}

function Laptop() {
  const lidW = LAPTOP.screenW + LAPTOP.bezel * 2;
  const lidH = LAPTOP.screenH + LAPTOP.bezel + LAPTOP.bezelTop;
  return (
    <div className="absolute" style={{ left: LAPTOP.left, top: LAPTOP.top, width: LAPTOP.baseW }}>
      {/* Lid */}
      <div
        className="relative mx-auto"
        style={{
          width: lidW,
          height: lidH,
          padding: `${LAPTOP.bezelTop}px ${LAPTOP.bezel}px ${LAPTOP.bezel}px`,
          borderRadius: "16px 16px 4px 4px",
          background: "linear-gradient(180deg, #232A38, #121722)",
          boxShadow: "0 0 0 1px #3A4254, 0 30px 60px -24px rgba(28,41,66,0.45)",
        }}
      >
        <span className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ top: 5, width: 5, height: 5, backgroundColor: "#343C4C" }} />
        <div className="relative overflow-hidden" style={{ width: LAPTOP.screenW, height: LAPTOP.screenH, borderRadius: 3 }}>
          <LaptopScreen />
          {/* Faint glass reflection */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 38%)" }} />
        </div>
      </div>
      {/* Base: hinge, deck with the finger notch, and its shadow */}
      <div className="relative" style={{ width: LAPTOP.baseW, height: LAPTOP.baseH }}>
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(180deg, #E4E0D9 0%, #CBC5BB 55%, #A9A297 100%)",
            borderRadius: "3px 3px 12px 12px / 3px 3px 10px 10px",
            boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset",
          }}
        />
        <div className="absolute left-1/2 -translate-x-1/2 top-0" style={{ width: 76, height: 5, borderRadius: "0 0 6px 6px", backgroundColor: "#B7B0A5" }} />
      </div>
    </div>
  );
}

function Phone() {
  return (
    <div
      className="absolute"
      style={{
        right: PHONE.right,
        bottom: PHONE.bottom,
        width: PHONE.w,
        height: PHONE.h,
        padding: PHONE.bezel,
        borderRadius: PHONE.radius,
        background: "linear-gradient(150deg, #3A4254 0%, #151A24 45%, #0B0E14 100%)",
        boxShadow: "0 0 0 1px #4A5366, inset 0 0 0 1px rgba(255,255,255,0.06), 0 34px 60px -18px rgba(28,41,66,0.55), 0 12px 24px -12px rgba(28,41,66,0.35)",
      }}
    >
      {/* Side buttons */}
      {[
        { side: "left", top: 70, h: 18 },
        { side: "left", top: 98, h: 30 },
        { side: "left", top: 134, h: 30 },
        { side: "right", top: 104, h: 44 },
      ].map((b) => (
        <span
          key={`${b.side}-${b.top}`}
          className="absolute"
          style={{ [b.side]: -2.5, top: b.top, width: 3, height: b.h, borderRadius: 2, backgroundColor: "#2A3140" }}
        />
      ))}
      <div className="relative overflow-hidden w-full h-full" style={{ borderRadius: PHONE.radius - PHONE.bezel }}>
        <PhoneScreen />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(125deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 32%)" }} />
      </div>
    </div>
  );
}

function CarouselArrow({ direction, onClick, disabled }: { direction: "left" | "right"; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? "Previous" : "Next"}
      className={`absolute top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-105 disabled:opacity-0 disabled:pointer-events-none ${direction === "left" ? "left-2" : "right-2"}`}
      style={{ backgroundColor: T.white, color: T.charcoal, boxShadow: "0 4px 14px rgba(28,41,66,0.2)" }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {direction === "left" ? <path d="M10 3L5 8l5 5" /> : <path d="M6 3l5 5-5 5" />}
      </svg>
    </button>
  );
}

function useFitScale(naturalWidth: number) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / naturalWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [naturalWidth]);

  return { measureRef, scale };
}

// The laptop + phone scene at its natural size (SCENE_W × SCENE_H) times
// `scale`. Also used, without the entrance animation, for the launch
// post images (src/pages/LaunchMockup.tsx).
export function DeviceScene({ scale = 1, entrance = true }: { scale?: number; entrance?: boolean }) {
  return (
    // inert: the invitations inside are pictures here — nothing in them
    // should take focus or clicks.
    <div inert className="relative select-none" style={{ width: SCENE_W, height: SCENE_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
      {/* Soft shadow under the laptop's base */}
      <div
        className="absolute"
        style={{
          left: LAPTOP.left - 10,
          width: LAPTOP.baseW + 20,
          top: LAPTOP.top + LAPTOP.screenH + LAPTOP.bezel + LAPTOP.bezelTop + LAPTOP.baseH - 12,
          height: 30,
          background: "radial-gradient(closest-side, rgba(28,41,66,0.28), rgba(28,41,66,0))",
        }}
      />
      {/* The wrappers cover the whole scene: an animated (transformed)
          element becomes its absolutely-positioned children's frame. */}
      <motion.div
        className="absolute inset-0"
        initial={entrance ? { opacity: 0, y: 24 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
      >
        <Laptop />
      </motion.div>
      <motion.div
        className="absolute inset-0"
        initial={entrance ? { opacity: 0, y: 40, x: 16 } : false}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 0.8, ease: EASE, delay: 0.35 }}
      >
        <Phone />
      </motion.div>
    </div>
  );
}

function DeviceShowcase() {
  // Measures its own (purely CSS-driven) width to compute the fit scale —
  // deliberately not the box being scaled, or the two would feed back into
  // each other.
  const { measureRef, scale } = useFitScale(SCENE_W);

  return (
    <div className="flex flex-col items-center md:items-end">
      <div ref={measureRef} className="w-full flex justify-center md:justify-end" style={{ maxWidth: SCENE_W }}>
        <div
          role="img"
          aria-label="The sample invitation for Elena & Marco, open on a laptop and on a phone"
          style={{ width: SCENE_W * scale, height: SCENE_H * scale }}
        >
          <DeviceScene scale={scale} />
        </div>
      </div>

      <p className="mt-3 text-xs" style={{ color: T.muted }}>
        One link — opens beautifully on every phone and computer
      </p>
    </div>
  );
}

export default function LandingPage({ onNav }: { onNav: (p: NavTarget) => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // The template filter lives here so the hero and occasion tiles can open
  // the showcase on a category, instead of sending visitors to sign in
  // before they've seen anything.
  const [templateCategory, setTemplateCategory] = useState("All");
  function browseTemplates(category = "All") {
    setTemplateCategory(CATS.includes(category) ? category : "All");
    document.getElementById("templates")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    // "user": visitors who ask their device for reduced motion get fades
    // without movement, and no looping float.
    <MotionConfig reducedMotion="user">
    <div style={{ backgroundColor: T.cream, color: T.charcoal }}>
      {/* ── NAV ─────────────────────────────────────────────────────── */}
      <motion.header
        className="sticky top-0 z-50"
        style={{ backgroundColor: "rgba(250,248,245,0.9)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${T.border}` }}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Logo */}
          <img src={webAppLogo} alt="Invyta" className="h-9 w-auto flex-shrink-0" />

          {/* Desktop links */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {[["#features", "Features"], ["#templates", "Templates"], ["#pricing", "Pricing"], ["#faq", "FAQ"]].map(([href, label]) => (
              <a key={href} href={href} className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-stone-100" style={{ color: T.muted }}>
                {label}
              </a>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            <button onClick={() => onNav("register")} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 btn-lift" style={{ backgroundColor: T.accent, color: T.white }}>
              Get started <ChevronRight />
            </button>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-stone-100"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <span className="w-5 h-0.5 rounded-full bg-stone-700 block" />
            <span className="w-5 h-0.5 rounded-full bg-stone-700 block" />
          </button>
        </div>

        {/* Mobile drawer */}
        <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="md:hidden px-6 pb-5 pt-2 flex flex-col gap-1 overflow-hidden"
            style={{ borderTop: `1px solid ${T.border}` }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            {[["#features", "Features"], ["#templates", "Templates"], ["#pricing", "Pricing"], ["#faq", "FAQ"]].map(([href, label], i) => (
              <motion.a
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 rounded-lg text-sm font-medium"
                style={{ color: T.muted }}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: EASE, delay: 0.06 + i * 0.045 }}
              >
                {label}
              </motion.a>
            ))}
            <div className="mt-3 pt-3 flex flex-col gap-2" style={{ borderTop: `1px solid ${T.border}` }}>
              <button onClick={() => onNav("register")} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ backgroundColor: T.accent, color: T.white }}>Get started</button>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </motion.header>

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Ambient blobs */}
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          <div className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-20 -top-32 -right-32" style={{ backgroundColor: T.accent }} />
          <div className="absolute w-[400px] h-[400px] rounded-full blur-3xl opacity-10 bottom-0 -left-20" style={{ backgroundColor: T.rose }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-28 grid grid-cols-1 md:grid-cols-[1fr_540px] gap-14 items-center">
          {/* Copy */}
          <motion.div initial="hidden" animate="show" variants={staggerContainer}>
            <motion.h1 variants={fadeUp} className="text-[clamp(2.5rem,5vw,3.75rem)] font-bold leading-[1.1] mb-6" style={{ letterSpacing: "-0.03em" }}>
              Beautiful <Serif><span style={{ color: T.accent }}>invitations.</span></Serif>
              <br />Smarter events.
            </motion.h1>

            <motion.p variants={fadeUp} className="text-lg leading-relaxed mb-8 max-w-md" style={{ color: T.muted }}>
              Create a stunning digital invitation, collect RSVPs, manage guests, and make every Filipino celebration unforgettable.
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-wrap gap-3 mb-5">
              <button
                onClick={() => onNav("register")}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90 btn-lift"
                style={{ backgroundColor: T.accent, color: T.white, boxShadow: "0 4px 14px rgba(28, 41, 66,0.35)" }}
              >
                Create an invitation
              </button>
              <button
                onClick={() => browseTemplates()}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all hover:bg-stone-100 btn-lift"
                style={{ backgroundColor: T.white, color: T.charcoal, border: `1.5px solid ${T.border}` }}
              >
                Explore templates
              </button>
            </motion.div>

            <motion.p variants={fadeUp} className="text-xs" style={{ color: T.muted }}>
              Free to start · No credit card required ·{" "}
              <a href="/sample" className="font-semibold underline" style={{ color: T.charcoal }}>See a sample invitation</a>
            </motion.p>

          </motion.div>

          {/* Laptop + phone mockup */}
          <DeviceShowcase />
        </div>
      </section>

      {/* ── COVER STRIP ─────────────────────────────────────────────── */}
      {/* Every template's cover drifting past, full width. Pauses under the
          pointer or keyboard focus; with reduced motion it holds still and
          scrolls by hand instead (see .invyta-marquee in index.css). Tapping
          a cover opens that occasion's templates. */}
      <div className="invyta-marquee-viewport py-6" style={{ backgroundColor: T.surface, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
        <div className="invyta-marquee">
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex gap-4 pr-4" aria-hidden={copy === 1 || undefined}>
              {TEMPLATES.map((t) => (
                <li key={t.id} className="flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => browseTemplates(t.category)}
                    tabIndex={copy === 1 ? -1 : undefined}
                    aria-label={`See ${t.category} templates, like ${t.name}`}
                    className="group block w-32 text-left"
                  >
                    <span className="block rounded-xl overflow-hidden mb-2" style={{ aspectRatio: "3/4", border: `1px solid ${T.border}`, backgroundColor: T.white }}>
                      <img
                        src={`https://images.unsplash.com/${t.img}?w=200&h=260&fit=crop&auto=format`}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </span>
                    <span className="block text-xs font-semibold truncate" style={{ color: T.charcoal }}>{t.name}</span>
                    <span className="block text-[11px]" style={{ color: T.muted }}>{t.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {/* ── PRODUCT VIDEO ──────────────────────────────────────────── */}
      {/* Rendered by `pnpm video` and copied into public/video. Only the
          metadata loads up front, so the ~9 MB file streams on play. */}
      <section className="pt-24">
        <div className="max-w-5xl mx-auto px-6">
          <Reveal className="text-center mb-10">
            <SectionLabel>See it in action</SectionLabel>
            <SectionHeading>
              Watch an invitation <Serif>come together</Serif>
            </SectionHeading>
          </Reveal>
          <Reveal>
            <div
              className="rounded-2xl overflow-hidden"
              style={{ aspectRatio: "16/9", backgroundColor: T.charcoal, border: `1px solid ${T.border}`, boxShadow: "0 20px 50px rgba(28, 41, 66, 0.18)" }}
            >
              <video
                src="/video/invyta.mp4"
                controls
                playsInline
                preload="metadata"
                className="w-full h-full object-cover"
                aria-label="Invyta product walkthrough video"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal className="text-center mb-16">
            <SectionLabel>How it works</SectionLabel>
            <SectionHeading>
              From idea to <Serif>celebration</Serif> in minutes
            </SectionHeading>
          </Reveal>

          <RevealGroup className="relative grid md:grid-cols-4 gap-8">
            {/* Connector line */}
            <div className="hidden md:block absolute top-6 left-[12.5%] right-[12.5%] h-px" style={{ backgroundColor: T.border }} />

            {[
              { n: "1", title: "Choose a template", desc: "Browse beautifully designed templates for every occasion and celebration type." },
              { n: "2", title: "Customize freely", desc: "Add your event details, photos, and personal touches with our intuitive builder." },
              { n: "3", title: "Share the link", desc: "Send via WhatsApp, Messenger, or email. One link, every guest." },
              { n: "4", title: "Track responses", desc: "Watch RSVPs come in live. Manage your guest list from one clean dashboard." },
            ].map((s) => (
              <RevealItem key={s.n} className="relative flex flex-col items-center text-center gap-3">
                <div
                  className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mb-1 flex-shrink-0"
                  style={{ backgroundColor: T.white, border: `2px solid ${T.accent}`, color: T.accent }}
                >
                  {s.n}
                </div>
                <h3 className="font-semibold text-[0.9rem]">{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: T.muted }}>{s.desc}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── TEMPLATE SHOWCASE ──────────────────────────────────────── */}
      <section id="templates" className="py-24 scroll-mt-16" style={{ backgroundColor: T.surface }}>
        <div className="max-w-7xl mx-auto px-6">
          <Reveal className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <SectionLabel>Templates</SectionLabel>
              <SectionHeading>Find your perfect <Serif>invitation</Serif></SectionHeading>
            </div>
            {templateCategory !== "All" && (
              <button onClick={() => setTemplateCategory("All")} className="text-sm font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-70 flex-shrink-0" style={{ color: T.accent }}>
                See all {TEMPLATES.length} templates <ChevronRight />
              </button>
            )}
          </Reveal>
          <TemplateShowcase onNav={onNav} active={templateCategory} setActive={setTemplateCategory} />
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────── */}
      <section id="features" className="py-24 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal className="text-center mb-16">
            <SectionLabel>Features</SectionLabel>
            <SectionHeading>Everything you need for <Serif>unforgettable</Serif> events</SectionHeading>
          </Reveal>
          <RevealGroup className="grid md:grid-cols-3 gap-5">
            {[
              { icon: "message" as IconName, title: "Interactive Invitations", desc: "Beautiful webpages—not flat images—with countdowns, galleries, add-to-calendar and RSVP forms built in." },
              { icon: "checkCircle" as IconName, title: "RSVP Management", desc: "Set a reply-by date, see who's coming at a glance, and ask your own questions like song requests. Questions on Pro." },
              { icon: "send" as IconName, title: "One-Tap Reminders", desc: "Nudge guests who haven't replied on Messenger, Viber, WhatsApp, SMS or email, with the message already written." },
              { icon: "users" as IconName, title: "Guest Management", desc: "Organize by group, send personalized links, and export the list for your caterer or coordinator." },
              { icon: "qr" as IconName, title: "QR Code Check-in", desc: "Event day made easy. Scan QR codes for fast, contactless guest check-in at the door." },
              { icon: "chart" as IconName, title: "Event Analytics", desc: "Follow RSVP activity day by day, response rates, guest groups and check-in progress." },
              { icon: "sparkle" as IconName, title: "Your Motif, Your Style", desc: "20+ color palettes, light or dark, or your own motif colors — with 9 font pairings and 5 page layouts." },
              { icon: "video" as IconName, title: "Videos & Prenup Films", desc: "Share your prenup film, same-day edit or a message from YouTube, Vimeo or Facebook, right on your invitation. On Pro." },
              { icon: "music" as IconName, title: "Background Music", desc: "Play your song as guests open the invitation, with a tap to pause. On Pro." },
            ].map((f) => (
              <RevealItem
                key={f.title}
                className="rounded-2xl p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: T.surface }}
                >
                  <Icon name={f.icon} size={19} color={T.accent} />
                </div>
                <h3 className="font-semibold text-[0.9375rem] mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: T.muted }}>{f.desc}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── CELEBRATIONS ────────────────────────────────────────────── */}
      <section className="py-24" style={{ backgroundColor: T.surface }}>
        <div className="max-w-7xl mx-auto px-6">
          <Reveal className="text-center mb-12">
            <SectionLabel>Made for every occasion</SectionLabel>
            <SectionHeading>Made for celebrations <Serif>that matter</Serif></SectionHeading>
          </Reveal>
          <RevealGroup className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Wedding", color: "rgba(28, 41, 66,0.12)" },
              { label: "Debut", color: "rgba(232,197,193,0.3)" },
              { label: "Baptism", color: "rgba(186,221,214,0.3)" },
              { label: "Birthday", color: "rgba(253,186,116,0.2)" },
              { label: "Graduation", color: "rgba(147,197,253,0.25)" },
              { label: "Corporate", color: "rgba(167,167,167,0.15)" },
            ].map((c) => (
              <motion.button
                key={c.label}
                variants={fadeUp}
                onClick={() => browseTemplates(c.label)}
                aria-label={`See ${c.label} templates`}
                className="flex flex-col items-center justify-center p-6 rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ backgroundColor: c.color, border: `1px solid ${T.border}` }}
              >
                <span className="text-sm font-semibold">{c.label}</span>
              </motion.button>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── WHY INVYTA ─────────────────────────────────────────────── */}
      {/* Factual reasons only. Real, consented testimonials can go here once
          there are customers to quote — never invented ones. */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal className="text-center mb-14">
            <SectionLabel>Why Invyta</SectionLabel>
            <SectionHeading>Built for hosts <Serif>and their guests</Serif></SectionHeading>
          </Reveal>
          <RevealGroup className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: "users" as IconName,
                title: "Guests' details stay private",
                desc: "Guest lists and RSVPs are visible only to you, never to other guests — handled under the Philippine Data Privacy Act.",
              },
              {
                icon: "tag" as IconName,
                title: "Pay per event, not per month",
                desc: "Every event starts free. Upgrade only the one that needs more, once, via QR Ph (GCash, Maya or any bank app) — no subscription.",
              },
              {
                icon: "send" as IconName,
                title: "Made for phones and group chats",
                desc: "One link that opens beautifully on any phone and shows a proper preview card when shared on Messenger or Viber.",
              },
            ].map((b) => (
              <RevealItem key={b.title} className="rounded-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: T.surface }}>
                  <Icon name={b.icon} size={18} color={T.accent} />
                </div>
                <div>
                  <div className="text-base font-semibold mb-1.5">{b.title}</div>
                  <p className="text-[0.875rem] leading-relaxed" style={{ color: T.muted }}>{b.desc}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
          <HostTestimonials />
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 scroll-mt-16" style={{ backgroundColor: T.surface }}>
        <div className="max-w-5xl mx-auto px-6">
          <Reveal className="text-center mb-14">
            <SectionLabel>Pricing</SectionLabel>
            <SectionHeading>Simple, <Serif>transparent</Serif> pricing</SectionHeading>
          </Reveal>

          <RevealGroup className="grid md:grid-cols-3 gap-5 items-stretch">
            {[
              { name: "Free", price: "₱0", sub: "forever", highlight: false, badge: null, features: ["Basic templates", "Basic RSVP", "Up to 50 guests", "Up to 10 gallery photos", "Standard URL", "Invyta branding"], cta: "Get started free" },
              { name: "Premium", price: PREMIUM_PRICE, sub: "per event", highlight: true, badge: PAYMENTS_ENABLED ? "Most Popular" : "Coming soon", features: ["All premium templates", "Unlimited guests", "Custom link (e.g. /i/elena-and-marco)", "Up to 30 gallery photos", "Analytics & QR check-in", "Remove Invyta branding"], cta: PAYMENTS_ENABLED ? "Choose Premium" : "Get started free" },
              { name: "Pro", price: PRO_PRICE, sub: "per event", highlight: false, badge: PAYMENTS_ENABLED ? null : "Coming soon", features: ["Everything in Premium", "Video — your prenup film or SDE", "Background music", "Unlimited gallery photos", "Personalized invitations", "Custom RSVP questions", "Party-size limits & bulk guest actions", "Priority support"], cta: PAYMENTS_ENABLED ? "Choose Pro" : "Get started free" },
            ].map((p) => (
              <RevealItem
                key={p.name}
                className="rounded-2xl p-7 flex flex-col"
                style={{
                  backgroundColor: p.highlight ? T.charcoal : T.white,
                  color: p.highlight ? T.white : T.charcoal,
                  border: p.highlight ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                }}
              >
                {p.badge && (
                  <span className="text-[11px] font-bold px-3 py-1 rounded-full self-start mb-4" style={{ backgroundColor: p.highlight ? T.white : T.accent, color: p.highlight ? T.charcoal : T.white }}>
                    {p.badge}
                  </span>
                )}
                {/* Keeps prices level across the row; stacked on mobile it's just a gap. */}
                {!p.badge && <div className="hidden md:block h-7 mb-4" />}
                <div className="text-sm font-semibold mb-1" style={{ color: p.highlight ? "rgba(255,255,255,0.65)" : T.muted }}>{p.name}</div>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-4xl font-bold" style={{ letterSpacing: "-0.03em" }}>{p.price}</span>
                </div>
                <div className="text-xs mb-7" style={{ color: p.highlight ? "rgba(255,255,255,0.6)" : T.muted }}>{p.sub}</div>

                <ul className="space-y-3 mb-8 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="7" fill={p.highlight ? T.white : T.accent} fillOpacity={p.highlight ? 0.2 : 0.15} />
                        <path d="M4.5 7l2 2 3-3" stroke={p.highlight ? T.white : T.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span style={{ color: p.highlight ? "rgba(255,255,255,0.75)" : T.muted }}>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => onNav("register")}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 btn-lift"
                  style={{
                    backgroundColor: p.highlight ? T.white : T.surface,
                    color: T.charcoal,
                    border: p.highlight ? "none" : `1px solid ${T.border}`,
                  }}
                >
                  {p.cta}
                </button>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <section id="faq" className="pt-24 scroll-mt-16">
        <div className="max-w-3xl mx-auto px-6">
          <Reveal className="text-center mb-10">
            <SectionLabel>FAQ</SectionLabel>
            <SectionHeading>Questions, <Serif>answered</Serif></SectionHeading>
          </Reveal>
          <Reveal>
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
              {FAQ.map((item, i) => (
                <details key={item.q} className="group" style={{ borderTop: i ? `1px solid ${T.border}` : undefined }}>
                  <summary className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 cursor-pointer list-none font-semibold text-[0.9375rem] [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="flex-shrink-0 transition-transform group-open:rotate-45 text-xl leading-none" style={{ color: T.muted }} aria-hidden="true">+</span>
                  </summary>
                  <p className="px-5 sm:px-6 pb-5 -mt-1 text-sm leading-relaxed" style={{ color: T.muted }}>{item.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────────────── */}
      <section className="py-24">
        <Reveal className="max-w-3xl mx-auto px-6 text-center">
          <SectionHeading className="mb-4">
            Ready to celebrate?{" "}
            <Serif><span style={{ color: T.accent }}>Start for free.</span></Serif>
          </SectionHeading>
          <p className="text-base mb-8 max-w-md mx-auto" style={{ color: T.muted }}>
            Create a beautiful invitation for your next celebration in minutes — free to start.
          </p>
          <button
            onClick={() => onNav("register")}
            className="px-8 py-4 rounded-xl font-semibold text-base transition-all hover:opacity-90 hover:shadow-lg btn-lift"
            style={{ backgroundColor: T.accent, color: T.white, boxShadow: "0 4px 20px rgba(28, 41, 66,0.3)" }}
          >
            Create Your First Invitation
          </button>
        </Reveal>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: T.charcoal, color: "rgba(255,255,255,0.6)" }}>
        <div className="max-w-7xl mx-auto px-6 py-14">
          <div className="grid md:grid-cols-5 gap-10 mb-12">
            <div className="md:col-span-2">
              {/* T.accent equals T.charcoal (both navy), so the logo's own
                  navy/gold colors would vanish against this dark footer —
                  rendered as a white silhouette instead via filter. */}
              <img src={webAppLogo} alt="Invyta" className="h-8 w-auto" style={{ filter: "brightness(0) invert(1)" }} />
              <p className="text-sm mt-3 max-w-[240px] leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                Create. Invite. Celebrate. Beautiful digital invitations for every Filipino celebration.
              </p>
            </div>
            {[
              { title: "Product", links: ["Templates", "Features", "Pricing", "FAQ"] },
              // Blog and Careers come back once there's something behind them.
              { title: "Company", links: ["About", "Contact"] },
              { title: "Legal", links: ["Privacy", "Terms", "Cookies"] },
            ].map((col) => (
              <div key={col.title}>
                <div className="text-xs font-bold uppercase tracking-[0.12em] mb-4 text-white">{col.title}</div>
                <ul className="space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l}><a href={FOOTER_LINK_HREF[l] ?? "#"} className="text-sm hover:text-white transition-colors" style={{ color: "rgba(255,255,255,0.45)" }}>{l}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-8 flex flex-col md:flex-row justify-between items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>© 2026 Invyta. All rights reserved.</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Made for Filipino celebrations</p>
          </div>
        </div>
      </footer>
    </div>
    </MotionConfig>
  );
}

// Real testimonials from organizers — shown only once an admin has
// approved at least one (see supabase/add-testimonials.sql), with the name
// and event line each organizer chose and consented to. Renders nothing
// until then, so the page never shows placeholder reviews.
function HostTestimonials() {
  const [items, setItems] = useState<PublicTestimonial[]>([]);
  useEffect(() => {
    listApprovedTestimonials(6).then(setItems);
  }, []);
  if (items.length === 0) return null;

  return (
    <div className="mt-20">
      <Reveal className="text-center mb-10">
        <SectionLabel>From our hosts</SectionLabel>
        <SectionHeading>What hosts <Serif>say</Serif></SectionHeading>
      </Reveal>
      {/* One or two reviews sit centered rather than leaving empty columns. */}
      <RevealGroup className={`grid gap-5 ${items.length === 1 ? "max-w-md mx-auto" : items.length === 2 ? "md:grid-cols-2 max-w-3xl mx-auto" : "md:grid-cols-3"}`}>
        {items.map((t) => (
          <RevealItem key={t.id} className="rounded-2xl p-6 flex flex-col gap-5" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
            {t.rating && (
              <div className="flex gap-0.5" aria-label={`${t.rating} out of 5 stars`}>
                {[...Array(5)].map((_, i) => (
                  <svg key={i} width="14" height="14" viewBox="0 0 14 14" fill={i < t.rating! ? T.accent : T.border} aria-hidden="true"><path d="M7 1l1.56 3.17L12 4.72l-2.5 2.43.59 3.44L7 9l-3.09 1.63.59-3.44L2 4.72l3.44-.55L7 1z"/></svg>
                ))}
              </div>
            )}
            <p className="text-[0.875rem] leading-relaxed flex-1" style={{ color: T.muted }}>"{t.quote}"</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: T.accent }}>
                {t.displayName.split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-semibold">{t.displayName}</div>
                {t.eventLabel && <div className="text-xs mt-0.5" style={{ color: T.muted }}>{t.eventLabel}</div>}
              </div>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </div>
  );
}

// Footer links that have a real destination; the rest stay placeholders
// until those pages exist.
const FOOTER_LINK_HREF: Record<string, string> = {
  Templates: "#templates",
  Features: "#features",
  Pricing: "#pricing",
  FAQ: "#faq",
  Privacy: "/privacy",
  Terms: "/terms",
  Cookies: "/privacy#cookies",
  Contact: "/contact",
  About: "/about",
};

// ─── Template showcase ──────────────────────────────────────────────────────
// TEMPLATES is derived from the same catalog (src/data/templates.ts) that
// the Create Event wizard and the Dashboard's Templates page use — one
// list of "which templates exist," not three copies that can drift out of
// sync with each other. The marketing page groups them into 6 broad pill
// categories (a coarser, curated taxonomy than the app's full ~25-value
// EventCategory), so each catalog entry gets a display label mapped here.
const CATS = ["All", "Wedding", "Birthday", "Debut", "Baptism", "Graduation", "Corporate"];

const PREMIUM_PRICE = formatPeso(upgradePriceCentavos("free", "premium"));
const PRO_PRICE = formatPeso(upgradePriceCentavos("free", "pro"));
const FAQ: { q: string; a: string }[] = [
  {
    q: "Do my guests need to download an app or make an account?",
    a: "No. Your invitation is a webpage that opens in any phone or computer browser. Guests RSVP with just their name — no app, no sign-up.",
  },
  {
    q: "How does pricing work? Is it a subscription?",
    a: `No subscription. Every event starts free, and you only upgrade the event that needs more: Premium is ${PREMIUM_PRICE} and Pro is ${PRO_PRICE}, paid once for that event. Moving from Premium to Pro later costs only the difference.`,
  },
  {
    q: "How can I pay?",
    a: "With QR Ph — scan the code using GCash, Maya or any bank app — through our payment partner PayMongo.",
  },
  {
    q: "Can I still edit the invitation after I've sent it?",
    a: "Yes. Changes you save appear right away for everyone who has the link, so there's no need to send it again.",
  },
  {
    q: "How do I send it to guests?",
    a: "Share one link in your group chats, on Messenger, Viber or anywhere — it shows a proper preview card. On Pro, each guest can get their own personal link that greets them by name.",
  },
  {
    q: "Who can see my guest list?",
    a: "Only you. Guests never see who else is invited or how others replied, and guest data is handled under the Philippine Data Privacy Act.",
  },
];
const CATEGORY_DISPLAY_LABEL: Partial<Record<EventCategory, string>> = {
  wedding: "Wedding",
  birthday: "Birthday",
  debut: "Debut",
  baptism: "Baptism",
  graduation: "Graduation",
  company_party: "Corporate",
};
const TEMPLATES = CATALOG_TEMPLATES.map((t) => ({ ...t, category: CATEGORY_DISPLAY_LABEL[t.category] ?? t.category }));

// A large main preview with a horizontal thumbnail strip underneath —
// selecting a thumbnail crossfades the main image and moves a shared
// highlight ring (Framer Motion `layoutId`) from the old thumbnail to the
// new one, the "magic move" behind motion.dev's carousel-thumbnail-gallery
// example (https://motion.dev/examples/react-carousel-thumbnail-gallery).
function TemplateShowcase({ onNav, active, setActive }: { onNav: (p: NavTarget) => void; active: string; setActive: (category: string) => void }) {
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const filtered = active === "All" ? TEMPLATES : TEMPLATES.filter((t) => t.category === active);
  const current = filtered[Math.min(selected, filtered.length - 1)];

  // A category switch can shrink the list out from under the current
  // index (or change what it points at) — snap back to the first result.
  useEffect(() => {
    setSelected(0);
  }, [active]);

  function go(next: number) {
    setSelected(Math.max(0, Math.min(filtered.length - 1, next)));
  }

  return (
    <div>
      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setActive(c)}
            className="px-4 py-2 rounded-full text-sm font-medium transition-all"
            style={{
              backgroundColor: active === c ? T.accent : T.white,
              color: active === c ? T.white : T.muted,
              border: `1px solid ${active === c ? T.accent : T.border}`,
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {current && (
        <Reveal>
          {/* Main preview */}
          <div className="relative rounded-2xl overflow-hidden mb-5" style={{ border: `1px solid ${T.border}`, aspectRatio: "16/9" }}>
            <AnimatePresence mode="wait">
              <motion.img
                key={current.name}
                src={`https://images.unsplash.com/${current.img}?w=1200&h=675&fit=crop&auto=format`}
                alt={current.name}
                initial={{ opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="absolute inset-0 w-full h-full object-cover"
              />
            </AnimatePresence>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(28,41,66,0.8) 0%, rgba(28,41,66,0) 50%)" }} />
            {current.premium && (
              <span className="absolute top-4 right-4 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: T.accent, color: T.white }}>
                Premium
              </span>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
              <h3 className="text-white text-lg sm:text-xl font-bold mb-0.5">{current.name}</h3>
              <p className="text-xs sm:text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
                {current.category}{!current.premium ? " · Free" : ""}
              </p>
            </div>
            {filtered.length > 1 && (
              <>
                <CarouselArrow direction="left" onClick={() => go(selected - 1)} disabled={selected === 0} />
                <CarouselArrow direction="right" onClick={() => go(selected + 1)} disabled={selected === filtered.length - 1} />
              </>
            )}
          </div>

          <div className="flex gap-3 mb-6">
            <button
              onClick={() => setPreviewName(current.name)}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 btn-lift"
              style={{ backgroundColor: T.white, color: T.charcoal, border: `1px solid ${T.border}` }}
            >
              Preview
            </button>
            <button
              onClick={() => onNav("register")}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 btn-lift"
              style={{ backgroundColor: T.accent, color: T.white }}
            >
              Use this template
            </button>
          </div>

          {/* Thumbnail strip — plain tappable buttons, no hover dependency */}
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {filtered.map((t, i) => (
              <button
                key={t.name}
                onClick={() => setSelected(i)}
                aria-label={`Show ${t.name}`}
                aria-current={i === selected}
                className="relative flex-shrink-0 rounded-xl overflow-hidden"
                style={{ width: 84 }}
              >
                <div style={{ aspectRatio: "3/4" }}>
                  <img
                    src={`https://images.unsplash.com/${t.img}?w=200&h=260&fit=crop&auto=format`}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover transition-opacity duration-200"
                    style={{ opacity: i === selected ? 1 : 0.5 }}
                  />
                </div>
                {i === selected && (
                  <motion.div
                    layoutId="template-thumb-ring"
                    className="absolute inset-0 rounded-xl pointer-events-none"
                    style={{ border: `2.5px solid ${T.accent}`, boxShadow: "0 2px 10px rgba(28,41,66,0.25)" }}
                    transition={{ type: "spring", stiffness: 500, damping: 34 }}
                  />
                )}
              </button>
            ))}
          </div>
        </Reveal>
      )}

      {previewName && <TemplatePreviewModal templateName={previewName} ctaLabel="Use this template — free to start" onCta={() => onNav("register")} onClose={() => setPreviewName(null)} />}
    </div>
  );
}
