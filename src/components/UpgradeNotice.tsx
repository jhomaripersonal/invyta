const T = {
  accent: "#1C2942",
  charcoal: "#1C2942",
  border: "#E7E1D8",
  muted: "#78716C",
  surface: "#F5F0E8",
  white: "#FFFFFF",
};

// Shown in place of a dashboard feature the organizer's plan doesn't
// include (see planAllows in src/data/plan-limits.ts).
export default function UpgradeNotice({ title, body, planName, onUpgrade, ctaLabel = "Upgrade this event" }: { title: string; body: string; planName: string; onUpgrade: () => void; ctaLabel?: string }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6 rounded-2xl" style={{ backgroundColor: T.white, border: `1px dashed ${T.border}` }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: T.surface }}>
        <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke={T.accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="8" width="11" height="8" rx="1.5" />
          <path d="M6 8V5.5a3 3 0 0 1 6 0V8" />
        </svg>
      </div>
      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full mb-3" style={{ backgroundColor: T.accent, color: T.white }}>{planName}</span>
      <h3 className="font-semibold mb-1" style={{ color: T.charcoal }}>{title}</h3>
      <p className="text-sm mb-5 max-w-sm" style={{ color: T.muted }}>{body}</p>
      <button
        onClick={onUpgrade}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
        style={{ backgroundColor: T.accent, color: T.white }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
