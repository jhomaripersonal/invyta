import { useEffect, useState } from "react";
import { T } from "../lib/tokens";

// Full-page loading state. It waits a moment before appearing, so a fast
// load shows nothing instead of a spinner flashing on and off.
export default function PageLoader({ label = "Loading", delayMs = 250 }: { label?: string; delayMs?: number }) {
  const [visible, setVisible] = useState(delayMs === 0);

  useEffect(() => {
    if (delayMs === 0) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: T.cream }} role="status" aria-live="polite">
      {visible && (
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border-2 animate-spin motion-reduce:animate-none"
            style={{ borderColor: T.border, borderTopColor: T.accent }}
          />
          <span className="text-xs font-medium" style={{ color: T.muted }}>
            {label}...
          </span>
        </div>
      )}
      {!visible && <span className="sr-only">{label}</span>}
    </div>
  );
}
