import { useState } from "react";
import { motion } from "framer-motion";
import { SectionList } from "./SectionList";
import { useScrollportHeight } from "./useScrollportHeight";
import { TEMPLATE_PREVIEWS } from "../../data/landing-template-previews";

const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  border: "#E7E1D8",
  muted: "#78716C",
  surface: "#F5F0E8",
  white: "#FFFFFF",
};

const EASE = [0.22, 1, 0.36, 1] as const;

type PreviewDevice = "mobile" | "tablet" | "desktop";

// Same widths as the Invitation Builder's own device switcher (see
// InvitationBuilderPage's DEVICE_WIDTH) so "what a guest sees" matches
// between the two previews.
const PREVIEW_DEVICE_WIDTH: Record<PreviewDevice, number> = { mobile: 380, tablet: 700, desktop: 1040 };

// A real rendering of the invitation this template produces — the exact
// same SectionList tree the Invitation Builder's live preview and the
// actual public /i/:slug page use — fed with fabricated sample content
// (src/data/landing-template-previews.ts), not a static mockup image.
// Shared by the landing page and the dashboard's Templates view, which
// each supply their own footer action.
export default function TemplatePreviewModal({ templateName, ctaLabel, onCta, onClose }: { templateName: string; ctaLabel: string; onCta: () => void; onClose: () => void }) {
  const seed = TEMPLATE_PREVIEWS[templateName];
  const [device, setDevice] = useState<PreviewDevice>("mobile");
  const [scrollRef, screenHeight] = useScrollportHeight();
  if (!seed) return null;
  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-8"
      style={{ backgroundColor: "rgba(28, 41, 66,0.6)" }}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col transition-[width] duration-200"
        style={{ backgroundColor: T.white, maxHeight: "88vh", width: PREVIEW_DEVICE_WIDTH[device], maxWidth: "94vw" }}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: EASE }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${T.border}` }}>
          <span className="text-sm font-semibold truncate">{seed.templateName}</span>
          <div className="flex items-center gap-1 p-1 rounded-lg flex-shrink-0" style={{ backgroundColor: T.surface }}>
            {(["mobile", "tablet", "desktop"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium capitalize"
                style={{ backgroundColor: device === d ? T.white : "transparent", color: device === d ? T.charcoal : T.muted }}
              >
                {d}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-stone-100 flex-shrink-0" style={{ color: T.muted }} aria-label="Close preview">✕</button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          <SectionList invitation={seed.invitation} event={seed.event} interactive={false} showWatermark={false} screenHeight={screenHeight} />
        </div>
        <div className="p-4 flex-shrink-0" style={{ borderTop: `1px solid ${T.border}` }}>
          <button onClick={onCta} className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90" style={{ backgroundColor: T.accent, color: T.white }}>
            {ctaLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
