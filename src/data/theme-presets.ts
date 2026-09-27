// Curated palettes/fonts for the Invitation Builder's Design tab. Fonts
// referenced here must already be loaded by the Google Fonts <link> in
// index.html — no dynamic stylesheet loading at runtime. (Browsers only
// download a family's font files once something on the page uses it, so
// listing extra families there costs little on pages that don't.)

// All colors are 6-digit hex: sections append 2-digit alpha to them
// (e.g. `${palette.text}1F`). `onPrimary` is the text color on `primary`
// (buttons, badges); `primary` itself is also used as text on
// `background`, so both pairs must stay readable (>= 4.5:1).
export interface ColorPalette {
  id: string;
  label: string;
  group: PaletteGroup;
  primary: string;
  onPrimary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  // Dark background with light text. Things that must stay dark-on-light
  // regardless (QR codes, buttons over photos) check this.
  dark: boolean;
}

export type PaletteGroup = "romantic" | "natural" | "rich" | "classic" | "dark";

export const PALETTE_GROUPS: { id: PaletteGroup; label: string }[] = [
  { id: "romantic", label: "Soft & Romantic" },
  { id: "natural", label: "Fresh & Natural" },
  { id: "rich", label: "Rich & Moody" },
  { id: "classic", label: "Classic & Neutral" },
  { id: "dark", label: "Dark & Dramatic" },
];

type LightPreset = Omit<ColorPalette, "onPrimary" | "dark">;
const light = (p: LightPreset): ColorPalette => ({ ...p, onPrimary: "#FFFFFF", dark: false });
const dark = (p: Omit<ColorPalette, "dark">): ColorPalette => ({ ...p, dark: true });

export const COLOR_PALETTES: ColorPalette[] = [
  light({ id: "gold", label: "Champagne Gold", group: "classic", primary: "#7A6143", accent: "#E8C5C1", background: "#FAF8F5", surface: "#F5F0E8", text: "#1C2942" }),
  light({ id: "rose", label: "Soft Rose", group: "romantic", primary: "#A65959", accent: "#F2D4D4", background: "#FDF6F5", surface: "#F8E9E8", text: "#241615" }),
  light({ id: "sage", label: "Sage Garden", group: "natural", primary: "#62785A", accent: "#C8D5BE", background: "#F6F8F3", surface: "#ECF1E6", text: "#1B2118" }),
  light({ id: "navy", label: "Midnight Navy", group: "rich", primary: "#3B4A6B", accent: "#A9B8D6", background: "#F5F6FA", surface: "#E8EBF3", text: "#161A24" }),
  light({ id: "blush", label: "Blush Pink", group: "romantic", primary: "#9C5F72", accent: "#F0D9E0", background: "#FDF7F9", surface: "#F9ECEF", text: "#241A1C" }),
  light({ id: "lavender", label: "Lavender Haze", group: "romantic", primary: "#6E5A92", accent: "#D6CCE8", background: "#F9F7FC", surface: "#EEE9F5", text: "#1E1829" }),
  light({ id: "coral", label: "Coral Sunset", group: "romantic", primary: "#B94A33", accent: "#F6C6B8", background: "#FFF7F4", surface: "#FBE8E2", text: "#2A1510" }),
  light({ id: "dusty-blue", label: "Dusty Blue", group: "natural", primary: "#4F6D8A", accent: "#C4D3E2", background: "#F5F8FB", surface: "#E7EEF5", text: "#16202A" }),
  light({ id: "ocean", label: "Ocean Teal", group: "natural", primary: "#1F6F78", accent: "#B5DDE0", background: "#F4FAFA", surface: "#E3F1F2", text: "#112325" }),
  light({ id: "olive", label: "Olive Grove", group: "natural", primary: "#5E6B3A", accent: "#D3D8B5", background: "#F8F8F1", surface: "#EEEFE0", text: "#1D2012" }),
  light({ id: "terracotta", label: "Terracotta", group: "natural", primary: "#A5502D", accent: "#EBC3A8", background: "#FCF7F3", surface: "#F6EAE1", text: "#2A1A12" }),
  light({ id: "burgundy", label: "Burgundy Wine", group: "rich", primary: "#7B2D3B", accent: "#E3B7BE", background: "#FBF6F6", surface: "#F4E7E8", text: "#24141A" }),
  light({ id: "emerald", label: "Emerald", group: "rich", primary: "#1F5E4A", accent: "#B9D8C9", background: "#F4F8F6", surface: "#E6F0EB", text: "#13201B" }),
  light({ id: "plum", label: "Plum", group: "rich", primary: "#5B2A4E", accent: "#DDB8CF", background: "#FAF6F9", surface: "#F2E6EE", text: "#1F1219" }),
  light({ id: "marigold", label: "Marigold", group: "classic", primary: "#8F6212", accent: "#F1D38E", background: "#FDF9F0", surface: "#F7EED8", text: "#2A2010" }),
  light({ id: "mocha", label: "Mocha", group: "classic", primary: "#6B4F3F", accent: "#DCC7B8", background: "#FAF7F4", surface: "#F0E8E1", text: "#221814" }),
  light({ id: "monochrome", label: "Monochrome", group: "classic", primary: "#2B2B2B", accent: "#D4D0CA", background: "#FAFAF8", surface: "#EFEEEB", text: "#151515" }),
  dark({ id: "noir-gold", label: "Black & Gold", group: "dark", primary: "#C9A45C", onPrimary: "#121110", accent: "#5C4A2A", background: "#121110", surface: "#1C1A17", text: "#F3EEE4" }),
  dark({ id: "midnight-silver", label: "Midnight Silver", group: "dark", primary: "#B8C2D6", onPrimary: "#0F1320", accent: "#3A4560", background: "#0F1320", surface: "#171C2C", text: "#EEF1F7" }),
  dark({ id: "emerald-night", label: "Emerald Night", group: "dark", primary: "#D9BF8C", onPrimary: "#0E1F1A", accent: "#2F5A4B", background: "#0E1F1A", surface: "#152A23", text: "#EFF4EF" }),
  dark({ id: "wine-night", label: "Wine Night", group: "dark", primary: "#E3A9B4", onPrimary: "#1E0F14", accent: "#5A2634", background: "#1E0F14", surface: "#2A151C", text: "#F7ECEE" }),
];

export interface FontPairing {
  id: string;
  label: string;
  // Short names shown in the picker, e.g. "Playfair Display + Plus Jakarta Sans".
  headingName: string;
  bodyName: string;
  headingFont: string;
  bodyFont: string;
}

export const FONT_PAIRINGS: FontPairing[] = [
  { id: "classic", label: "Classic", headingName: "Playfair Display", bodyName: "Plus Jakarta Sans", headingFont: "'Playfair Display', Georgia, serif", bodyFont: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { id: "romantic", label: "Romantic", headingName: "Cormorant Garamond", bodyName: "Manrope", headingFont: "'Cormorant Garamond', Georgia, serif", bodyFont: "'Manrope', system-ui, sans-serif" },
  { id: "modern", label: "Modern", headingName: "DM Serif Display", bodyName: "Inter", headingFont: "'DM Serif Display', Georgia, serif", bodyFont: "'Inter', system-ui, sans-serif" },
  { id: "script", label: "Script", headingName: "Great Vibes", bodyName: "Lora", headingFont: "'Great Vibes', 'Brush Script MT', cursive", bodyFont: "'Lora', Georgia, serif" },
  { id: "formal", label: "Formal", headingName: "Cinzel", bodyName: "EB Garamond", headingFont: "'Cinzel', 'Times New Roman', serif", bodyFont: "'EB Garamond', Georgia, serif" },
  { id: "timeless", label: "Timeless", headingName: "Libre Baskerville", bodyName: "Source Sans 3", headingFont: "'Libre Baskerville', Georgia, serif", bodyFont: "'Source Sans 3', system-ui, sans-serif" },
  { id: "chic", label: "Chic", headingName: "Bodoni Moda", bodyName: "Jost", headingFont: "'Bodoni Moda', Didot, serif", bodyFont: "'Jost', system-ui, sans-serif" },
  { id: "minimal", label: "Minimal", headingName: "Josefin Sans", bodyName: "Lato", headingFont: "'Josefin Sans', system-ui, sans-serif", bodyFont: "'Lato', system-ui, sans-serif" },
  { id: "playful", label: "Playful", headingName: "Fraunces", bodyName: "Nunito", headingFont: "'Fraunces', Georgia, serif", bodyFont: "'Nunito', system-ui, sans-serif" },
];

export function getPalette(id: string): ColorPalette {
  return COLOR_PALETTES.find((p) => p.id === id) ?? COLOR_PALETTES[0];
}

// ── Custom palette ───────────────────────────────────────────────
// The user picks a main color (and optionally an accent) plus a light or
// dark page; everything else is derived from the main color's hue. The
// main color is nudged darker (light page) or lighter (dark page) until
// it reads as text on the page, so any pick stays legible.

export const CUSTOM_PALETTE_ID = "custom";

export interface CustomPaletteInput {
  primary: string;
  accent?: string;
  dark: boolean;
}

type RGB = [number, number, number];

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toUpperCase()}`;
}

const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = (rgb: RGB) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
// Blend `hex` toward `toward` by `amount` (0 = unchanged, 1 = `toward`).
const mix = (hex: string, toward: string, amount: number) => {
  const a = toRgb(hex);
  const b = toRgb(toward);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount) as RGB);
};

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const MIN_CONTRAST = 4.5;

// Step `hex` toward `toward` until it reaches MIN_CONTRAST against `against`.
function ensureContrast(hex: string, against: string, toward: string): string {
  let out = hex;
  for (let i = 1; i <= 20 && contrastRatio(out, against) < MIN_CONTRAST; i++) out = mix(hex, toward, i * 0.05);
  return out;
}

export function buildCustomPalette(input: CustomPaletteInput): ColorPalette {
  const base = normalizeHex(input.primary) ?? COLOR_PALETTES[0].primary;
  const pickedAccent = normalizeHex(input.accent);
  if (input.dark) {
    const background = mix(base, "#000000", 0.88);
    const primary = ensureContrast(base, background, "#FFFFFF");
    return {
      id: CUSTOM_PALETTE_ID,
      label: "Custom",
      group: "dark",
      primary,
      onPrimary: contrastRatio(background, primary) >= contrastRatio("#FFFFFF", primary) ? background : "#FFFFFF",
      accent: pickedAccent ?? mix(primary, background, 0.6),
      background,
      surface: mix(base, "#000000", 0.82),
      text: mix(base, "#FFFFFF", 0.92),
      dark: true,
    };
  }
  const background = mix(base, "#FFFFFF", 0.96);
  return {
    id: CUSTOM_PALETTE_ID,
    label: "Custom",
    group: "classic",
    // Checked against the (slightly tinted) page, which also guarantees
    // the white button text on primary.
    primary: ensureContrast(base, background, "#000000"),
    onPrimary: "#FFFFFF",
    accent: pickedAccent ?? mix(base, "#FFFFFF", 0.7),
    background,
    surface: mix(base, "#FFFFFF", 0.9),
    text: mix(base, "#000000", 0.85),
    dark: false,
  };
}

export function getFontPairing(id: string): FontPairing {
  return FONT_PAIRINGS.find((f) => f.id === id) ?? FONT_PAIRINGS[0];
}
