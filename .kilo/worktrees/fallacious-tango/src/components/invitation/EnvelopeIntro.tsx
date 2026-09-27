import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { EventRecord } from "../../lib/events-store";
import type { ResolvedTheme } from "./theme";
import { formatLongDate } from "./format";

const EASE = [0.22, 1, 0.36, 1] as const;

function sessionKey(slug: string): string {
  return `invyta-envelope-opened:${slug}`;
}

// A one-time "opening" ritual in front of the real page — a closed
// envelope with a wax seal that a guest taps, the flap folding open before
// the whole gate fades away to reveal the invitation underneath (which is
// already fully mounted the entire time, so there's no pop-in once the
// gate is gone). Only meant for the real public page — not the Builder
// preview or the landing page's demo renders, both of which need to show
// content immediately rather than sit behind a one-tap gate.
export function EnvelopeIntro({ event, theme }: { event: EventRecord; theme: ResolvedTheme }) {
  const [stage, setStage] = useState<"closed" | "opening" | "done">(() => {
    try {
      return sessionStorage.getItem(sessionKey(event.slug)) === "1" ? "done" : "closed";
    } catch {
      return "closed";
    }
  });

  // Background stays put while the gate is up — nothing to scroll to yet.
  useEffect(() => {
    if (stage === "done") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [stage]);

  function handleOpen() {
    if (stage !== "closed") return;
    setStage("opening");
    try {
      sessionStorage.setItem(sessionKey(event.slug), "1");
    } catch {
      // best-effort — a private-browsing tab just sees the gate again next visit
    }
    setTimeout(() => setStage("done"), 650);
  }

  return (
    <AnimatePresence>
      {stage !== "done" && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ backgroundColor: theme.palette.background, cursor: stage === "closed" ? "pointer" : "default" }}
          onClick={handleOpen}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <motion.div
            className="text-center"
            animate={stage === "opening" ? { opacity: 0, scale: 0.94 } : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: EASE, delay: stage === "opening" ? 0.15 : 0 }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] mb-7" style={{ color: theme.palette.text, opacity: 0.55 }}>
              You're Invited
            </p>

            {/* Envelope, built from plain divs (no image asset) so it
                always matches the invitation's own theme colors. */}
            <div className="mx-auto mb-8">
              {/* `perspective` has to sit on the flap's direct parent (not
                  further up the tree) or the 3D fold has no vanishing point
                  and just looks like a flat squash instead of a hinge. */}
              <div className="relative" style={{ width: 180, height: 120, perspective: 900 }}>
                <div className="absolute inset-0 rounded-md" style={{ backgroundColor: theme.palette.surface, border: `1px solid ${theme.palette.text}22` }} />
                {/* bottom fold, sitting under the flap for depth */}
                <div
                  className="absolute inset-x-0 bottom-0 rounded-b-md"
                  style={{ height: "70%", backgroundColor: theme.palette.surface, clipPath: "polygon(0 100%, 50% 38%, 100% 100%)", opacity: 0.7 }}
                />
                {/* flap — the part that actually opens */}
                <motion.div
                  className="absolute inset-x-0 top-0 rounded-t-md"
                  style={{
                    height: "62%",
                    background: `linear-gradient(135deg, ${theme.palette.primary}, ${theme.palette.primary}CC)`,
                    clipPath: "polygon(0 0, 100% 0, 50% 100%)",
                    transformOrigin: "top center",
                  }}
                  animate={{ rotateX: stage === "opening" ? -170 : 0 }}
                  transition={{ duration: 0.6, ease: EASE }}
                />
                {/* wax seal */}
                <div
                  className="absolute rounded-full flex items-center justify-center"
                  style={{
                    width: 34,
                    height: 34,
                    left: "50%",
                    top: "42%",
                    transform: "translate(-50%, -50%)",
                    backgroundColor: theme.palette.accent,
                    border: `1px solid ${theme.palette.primary}55`,
                    zIndex: 2,
                  }}
                >
                  <span style={{ fontFamily: theme.fonts.headingFont, fontStyle: "italic", color: theme.palette.text, fontSize: 14 }}>
                    {event.name.charAt(0)}
                  </span>
                </div>
              </div>
            </div>

            <h1 className="text-2xl mb-2" style={{ fontFamily: theme.fonts.headingFont, color: theme.palette.text }}>
              {event.name}
            </h1>
            <p className="text-sm mb-8" style={{ color: theme.palette.text, opacity: 0.6 }}>
              {formatLongDate(event)}
            </p>

            <motion.p
              className="text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: theme.palette.primary }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              Tap to open
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
