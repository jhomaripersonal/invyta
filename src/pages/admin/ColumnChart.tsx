import { useEffect, useRef, useState } from "react";

// Single-series daily column chart for the admin Overview (sign-ups per
// day, revenue per day). One series, so no legend — the title names it.
// Columns: <= 24px wide with a 2px surface gap, 4px rounded data-end,
// square at the single baseline; hairline solid gridlines; hover/focus
// tooltip per column (hit target = the full band, not just the mark); and
// a table view so the numbers are never chart-only.

const INK = { primary: "#1C2942", secondary: "#57534E", muted: "#78716C", grid: "#ECE8E1", surface: "#FFFFFF" };
// Categorical slot 1 from the dataviz reference palette, validated
// against this white surface (lightness band, chroma, >= 3:1 contrast).
const SERIES = "#2a78d6";

const H = 190;
const M = { top: 12, right: 8, bottom: 24, left: 44 };

function niceMax(v: number): number {
  if (v <= 0) return 4;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ColumnChart({ title, subtitle, data, format }: { title: string; subtitle: string; data: { day: string; value: number }[]; format: (v: number) => string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const plotW = Math.max(10, width - M.left - M.right);
  const plotH = H - M.top - M.bottom;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const total = data.reduce((s, d) => s + d.value, 0);

  function barPath(x: number, top: number, w: number): string {
    const base = M.top + plotH;
    const h = base - top;
    if (h <= 0) return "";
    const r = Math.min(4, h, w / 2);
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
  }

  const hovered = hover !== null ? data[hover] : null;

  return (
    // min-w-0 + overflow-hidden: as a grid item, the card must be able to
    // shrink to its column, or the SVG's width would widen the column and the
    // resize observer would measure (and keep) that inflated width.
    <div className="rounded-2xl p-5 min-w-0" style={{ backgroundColor: INK.surface, border: "1px solid #E7E1D8" }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: INK.primary }}>{title}</h3>
          <p className="text-xs mt-0.5" style={{ color: INK.muted }}>{subtitle} · total {format(total)}</p>
        </div>
        <button onClick={() => setAsTable((v) => !v)} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ border: "1px solid #E7E1D8", color: INK.secondary }}>
          {asTable ? "Chart" : "Table"}
        </button>
      </div>

      {/* Measured wrapper stays mounted across the chart/table toggle. */}
      <div ref={wrapRef} className="overflow-hidden">
      {asTable ? (
        <div className="max-h-[190px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: INK.muted }}>
                <th className="text-left font-medium py-1">Day</th>
                <th className="text-right font-medium py-1">{title}</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day} style={{ borderTop: `1px solid ${INK.grid}`, color: INK.primary }}>
                  <td className="py-1">{shortDay(d.day)}</td>
                  <td className="py-1 text-right tabular-nums">{format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg width={width} height={H} role="img" aria-label={`${title}, ${subtitle}`} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={INK.grid} strokeWidth={1} />
                <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={INK.muted}>
                  {format(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = M.left + i * band + (band - barW) / 2;
              return (
                <path key={d.day} d={barPath(x, y(d.value), barW)} fill={SERIES} fillOpacity={hover === null || hover === i ? 1 : 0.45} />
              );
            })}
            {[0, Math.floor((data.length - 1) / 2), data.length - 1].filter((i, idx, arr) => data[i] && arr.indexOf(i) === idx).map((i) => (
              <text key={i} x={M.left + i * band + band / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={INK.muted}>
                {i === data.length - 1 ? "Today" : shortDay(data[i].day)}
              </text>
            ))}
            {/* Hit targets: the whole band, not just the (possibly tiny) column. */}
            {data.map((d, i) => (
              <rect
                key={d.day}
                x={M.left + i * band}
                y={M.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${shortDay(d.day)}: ${format(d.value)}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                style={{ outline: "none" }}
              />
            ))}
          </svg>
          {hovered && hover !== null && (
            <div
              className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap"
              style={{
                left: Math.min(Math.max(M.left + hover * band + band / 2, 60), width - 60),
                top: Math.max(0, y(hovered.value) - 44),
                transform: "translateX(-50%)",
                backgroundColor: INK.primary,
                color: "#FFFFFF",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              <div style={{ opacity: 0.7 }}>{shortDay(hovered.day)}</div>
              <div className="font-semibold">{format(hovered.value)}</div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
