import { useState, type ReactElement } from "react";
import { COLOR_PALETTES, FONT_PAIRINGS, getPalette } from "../../../data/theme-presets";
import { COVER_STYLES, PAGE_LAYOUTS, coverStyle, pageLayout } from "../../../data/page-layouts";
import { SECTION_STYLES, sectionStyle } from "../../../data/section-styles";
import { TEMPLATE_DESIGNS } from "../../../data/landing-template-previews";
import { TEMPLATES } from "../../../data/templates";
import { applyTemplateDesign } from "../../../data/apply-template-design";
import { planAllows } from "../../../data/plan-limits";
import { useEventPlan } from "../../../lib/event-plan-context";
import { SECTION_LABELS } from "../../../components/invitation/SectionList";
import type { ButtonStyle, EventCategory, InvitationConfig, InvitationSectionType, InvitationTheme, PageLayout } from "../../../types/models";

const T = { charcoal: "#1C2942", border: "#E7E1D8", muted: "#78716C", accent: "#1C2942", white: "#FFFFFF", cream: "#FAF8F5", surface: "#F5F0E8" };

const BUTTON_STYLES: { id: ButtonStyle; label: string }[] = [
  { id: "rounded", label: "Rounded" },
  { id: "square", label: "Square" },
  { id: "outline", label: "Outline" },
];

// Tiny schematic of each page layout for the picker tiles (40x52, a
// phone-ish page): filled blocks are photos, thin bars are text.
const LAYOUT_SKETCH: Record<PageLayout, ReactElement> = {
  classic: <><rect x="4" y="4" width="32" height="18" rx="1.5" fill="currentColor" fillOpacity="0.35" /><rect x="12" y="27" width="16" height="2" rx="1" fill="currentColor" /><rect x="8" y="32" width="24" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.5" /><rect x="12" y="40" width="16" height="2" rx="1" fill="currentColor" /><rect x="8" y="45" width="24" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.5" /></>,
  stationery: <><rect x="4" y="4" width="32" height="44" rx="1" fill="none" stroke="currentColor" strokeWidth="1" /><rect x="6.5" y="6.5" width="27" height="39" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.75" /><rect x="10" y="10" width="20" height="13" fill="currentColor" fillOpacity="0.35" /><path d="M17 28l3 2 3-2-3-2z" fill="currentColor" /><rect x="12" y="34" width="16" height="2" rx="1" fill="currentColor" /><rect x="10" y="39" width="20" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.5" /></>,
  story: <><rect x="4" y="4" width="28" height="44" rx="2" fill="currentColor" fillOpacity="0.35" /><rect x="10" y="30" width="16" height="2.5" rx="1" fill="currentColor" /><rect x="12" y="35" width="12" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.6" /><rect x="35" y="18" width="1.5" height="5" rx="0.75" fill="currentColor" /><circle cx="35.75" cy="26.5" r="0.9" fill="currentColor" fillOpacity="0.5" /><circle cx="35.75" cy="30" r="0.9" fill="currentColor" fillOpacity="0.5" /></>,
  editorial: <><rect x="4" y="4" width="32" height="14" rx="1.5" fill="currentColor" fillOpacity="0.35" /><rect x="4" y="22" width="6" height="4" rx="0.75" fill="currentColor" /><rect x="4" y="29" width="26" height="3" rx="1" fill="currentColor" /><rect x="4" y="35" width="30" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.5" /><rect x="4" y="39" width="24" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.5" /><rect x="4" y="45" width="32" height="0.75" fill="currentColor" fillOpacity="0.4" /></>,
  split: <><rect x="4" y="4" width="15" height="44" rx="1.5" fill="currentColor" fillOpacity="0.35" /><rect x="22" y="8" width="12" height="2" rx="1" fill="currentColor" /><rect x="22" y="13" width="14" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.5" /><rect x="22" y="22" width="12" height="2" rx="1" fill="currentColor" /><rect x="22" y="27" width="14" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.5" /><rect x="22" y="36" width="12" height="2" rx="1" fill="currentColor" /><rect x="22" y="41" width="14" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.5" /></>,
};

function Heading({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: T.muted }}>{children}</p>;
}

function PremiumTag() {
  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: T.accent, color: T.white }}>Premium</span>;
}

export function DesignPanel({ config, onChange, category }: { config: InvitationConfig; onChange: (config: InvitationConfig) => void; category: EventCategory }) {
  const plan = useEventPlan();
  const canUsePremiumLayouts = planAllows(plan, "page_layouts");
  const canUsePremiumTemplates = planAllows(plan, "premium_templates");
  const theme = config.theme;
  const layout = pageLayout(theme);
  // Applying a template changes a lot at once, so keep the design from
  // just before it for a one-step Undo — offered only until the next
  // change, so Undo never silently throws away later tweaks.
  const [applied, setApplied] = useState<{ name: string; previous: InvitationConfig } | null>(null);
  const setTheme = (next: InvitationTheme) => {
    setApplied(null);
    onChange({ ...config, theme: next });
  };
  // Suggest templates for this event's category first — unless none of
  // them are usable on the current plan (e.g. every wedding template is
  // Premium), in which case start from the full list. Usable ones first.
  const usable = (t: (typeof TEMPLATES)[number]) => !t.premium || canUsePremiumTemplates;
  const suggested = TEMPLATES.filter((t) => t.category === category);
  const [showAllTemplates, setShowAllTemplates] = useState(() => !suggested.some(usable));
  const templateList = (showAllTemplates || suggested.length === 0 ? TEMPLATES : suggested)
    .slice()
    .sort((a, b) => Number(usable(b)) - Number(usable(a)));

  function applyTemplate(name: string) {
    const design = TEMPLATE_DESIGNS[name];
    if (!design) return;
    setApplied({ name, previous: config });
    onChange(applyTemplateDesign(config, design));
  }

  function setSectionStyle(type: InvitationSectionType, style: string) {
    setApplied(null);
    onChange({ ...config, sections: config.sections.map((s) => (s.type === type ? { ...s, content: { ...s.content, style } } : s)) });
  }

  const styledSections = [...config.sections]
    .sort((a, b) => a.order - b.order)
    .filter((s) => s.enabled && (s.type === "cover" || SECTION_STYLES[s.type]));

  return (
    <div>
      {/* ── Apply a template's design ─────────────────────────────── */}
      <div className="mb-7">
        <Heading>Template designs</Heading>
        <p className="text-[11px] mb-3" style={{ color: T.muted }}>Restyle this invitation in one click — your text, photos and sections stay as they are.</p>
        {applied && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg mb-3 text-xs" style={{ backgroundColor: T.surface, color: T.charcoal }}>
            <span className="truncate">Applied <strong>{applied.name}</strong> — save to keep it.</span>
            <button
              onClick={() => { onChange(applied.previous); setApplied(null); }}
              className="font-semibold flex-shrink-0 underline"
            >
              Undo
            </button>
          </div>
        )}
        <div className="space-y-1.5">
          {templateList.map((t) => {
            const design = TEMPLATE_DESIGNS[t.name];
            if (!design) return null;
            const locked = t.premium && !canUsePremiumTemplates;
            const layoutLabel = PAGE_LAYOUTS.find((l) => l.id === design.theme.layout)?.label;
            const coverLabel = COVER_STYLES.find((c) => c.id === design.coverStyle)?.label;
            const palette = getPalette(design.theme.paletteId);
            return (
              <button
                key={t.id}
                onClick={() => applyTemplate(t.name)}
                disabled={locked}
                title={locked ? "Premium template — included in Premium" : `Apply the ${t.name} design`}
                className="w-full flex items-center gap-3 p-1.5 pr-2.5 rounded-lg text-left transition-colors hover:bg-stone-50 disabled:cursor-not-allowed"
                style={{ border: `1px solid ${T.border}`, opacity: locked ? 0.6 : 1 }}
              >
                <img src={`https://images.unsplash.com/${t.img}?w=80&h=100&fit=crop&auto=format`} alt="" className="w-9 h-11 rounded object-cover flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: palette.primary }} />
                    <span className="text-sm font-medium truncate" style={{ color: T.charcoal }}>{t.name}</span>
                  </span>
                  <span className="block text-[11px] truncate" style={{ color: T.muted }}>{layoutLabel} · {coverLabel}</span>
                </span>
                {t.premium && <PremiumTag />}
              </button>
            );
          })}
        </div>
        {suggested.length > 0 && suggested.length < TEMPLATES.length && (
          <button onClick={() => setShowAllTemplates((v) => !v)} className="text-[11px] font-semibold mt-2" style={{ color: T.accent }}>
            {showAllTemplates ? "Show suggested only" : `Show all ${TEMPLATES.length} templates`}
          </button>
        )}
      </div>

      {/* ── Page layout ───────────────────────────────────────────── */}
      <div className="mb-6">
        <Heading>Page Layout</Heading>
        <div className="grid grid-cols-3 gap-2">
          {PAGE_LAYOUTS.map((l) => {
            const locked = l.premium && !canUsePremiumLayouts;
            const selected = layout === l.id;
            return (
              <button
                key={l.id}
                onClick={() => setTheme({ ...theme, layout: l.id })}
                disabled={locked}
                title={locked ? `${l.description} — included in Premium` : l.description}
                className="relative flex flex-col items-center gap-1.5 px-1 pt-2.5 pb-2 rounded-lg text-[11px] font-medium disabled:cursor-not-allowed"
                style={{
                  border: `1.5px solid ${selected ? T.accent : T.border}`,
                  backgroundColor: selected ? T.cream : T.white,
                  color: selected ? T.accent : T.muted,
                  opacity: locked ? 0.6 : 1,
                }}
              >
                <svg width="40" height="52" viewBox="0 0 40 52" aria-hidden="true">{LAYOUT_SKETCH[l.id]}</svg>
                <span style={{ color: locked ? T.muted : T.charcoal }}>{l.label}</span>
                {locked && <span className="absolute -top-2 -right-1"><PremiumTag /></span>}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] mt-2" style={{ color: T.muted }}>{PAGE_LAYOUTS.find((l) => l.id === layout)?.description}</p>
        {!canUsePremiumLayouts && (
          <p className="text-[11px] mt-1" style={{ color: T.muted }}>Story, Editorial and Split layouts are included in Premium.</p>
        )}
      </div>

      {/* ── Section styles overview ───────────────────────────────── */}
      {styledSections.length > 0 && (
        <div className="mb-6">
          <Heading>Section Styles</Heading>
          <div className="space-y-2">
            {styledSections.map((s) => {
              const options = s.type === "cover" ? COVER_STYLES : SECTION_STYLES[s.type]!;
              const current = s.type === "cover" ? coverStyle(s.content) : sectionStyle(s.type, s.content);
              return (
                <label key={s.type} className="flex items-center justify-between gap-3">
                  <span className="text-sm" style={{ color: T.charcoal }}>{SECTION_LABELS[s.type]}</span>
                  <select
                    value={current}
                    onChange={(e) => setSectionStyle(s.type, e.target.value)}
                    className="text-xs px-2 py-1.5 rounded-lg outline-none min-w-0 max-w-[60%]"
                    style={{ border: `1px solid ${T.border}`, backgroundColor: T.white, color: T.charcoal }}
                  >
                    {options.map((o) => {
                      const locked = o.premium && !canUsePremiumLayouts;
                      return (
                        <option key={o.id} value={o.id} disabled={locked}>
                          {o.label}{locked ? " (Premium)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
              );
            })}
          </div>
          <p className="text-[11px] mt-2" style={{ color: T.muted }}>Each section's tab also has these, with previews.</p>
        </div>
      )}

      {/* ── Colors, type, buttons ─────────────────────────────────── */}
      <div className="mb-6">
        <Heading>Color Palette</Heading>
        <div className="flex flex-wrap gap-3">
          {COLOR_PALETTES.map((p) => (
            <button
              key={p.id}
              onClick={() => setTheme({ ...theme, paletteId: p.id })}
              className="flex flex-col items-center gap-1.5"
              aria-label={p.label}
              title={p.label}
            >
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ backgroundColor: p.primary, border: theme.paletteId === p.id ? `2px solid ${T.charcoal}` : "2px solid transparent", boxShadow: "0 0 0 2px " + p.background }}
              >
                {theme.paletteId === p.id && <span className="text-white text-xs">✓</span>}
              </span>
              <span className="text-[10px]" style={{ color: T.muted }}>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <Heading>Typography</Heading>
        <div className="space-y-2">
          {FONT_PAIRINGS.map((f) => (
            <button
              key={f.id}
              onClick={() => setTheme({ ...theme, fontPairingId: f.id })}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left"
              style={{
                border: `1.5px solid ${theme.fontPairingId === f.id ? T.accent : T.border}`,
                backgroundColor: theme.fontPairingId === f.id ? "rgba(28, 41, 66,0.08)" : "transparent",
              }}
            >
              <span>
                <span className="block text-sm" style={{ fontFamily: f.headingFont, color: T.charcoal }}>{f.label}</span>
                <span className="block text-[11px]" style={{ color: T.muted }}>Heading + body pairing</span>
              </span>
              {theme.fontPairingId === f.id && <span style={{ color: T.accent }}>✓</span>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Heading>Button Style</Heading>
        <div className="flex gap-2">
          {BUTTON_STYLES.map((b) => (
            <button
              key={b.id}
              onClick={() => setTheme({ ...theme, buttonStyle: b.id })}
              className="flex-1 px-3 py-2 text-xs font-medium"
              style={{
                borderRadius: b.id === "square" ? 0 : 10,
                border: `1.5px solid ${theme.buttonStyle === b.id ? T.accent : T.border}`,
                backgroundColor: theme.buttonStyle === b.id ? "rgba(28, 41, 66,0.08)" : "transparent",
                color: T.charcoal,
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
