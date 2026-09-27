// Curated palettes/fonts for the Invitation Builder's Design tab. Fonts
// referenced here must already be @imported in src/index.css — no dynamic
// stylesheet loading at runtime.

export interface ColorPalette {
  id: string;
  label: string;
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
}

export const COLOR_PALETTES: ColorPalette[] = [
  { id: "gold", label: "Champagne Gold", primary: "#7A6143", accent: "#E8C5C1", background: "#FAF8F5", surface: "#F5F0E8", text: "#1C2942" },
  { id: "rose", label: "Soft Rose", primary: "#D98E8E", accent: "#F2D4D4", background: "#FDF6F5", surface: "#F8E9E8", text: "#241615" },
  { id: "sage", label: "Sage Garden", primary: "#7C9473", accent: "#C8D5BE", background: "#F6F8F3", surface: "#ECF1E6", text: "#1B2118" },
  { id: "navy", label: "Midnight Navy", primary: "#3B4A6B", accent: "#A9B8D6", background: "#F5F6FA", surface: "#E8EBF3", text: "#161A24" },
  { id: "blush", label: "Blush Pink", primary: "#D9A5B3", accent: "#F0D9E0", background: "#FDF7F9", surface: "#F9ECEF", text: "#241A1C" },
];

export interface FontPairing {
  id: string;
  label: string;
  headingFont: string;
  bodyFont: string;
}

export const FONT_PAIRINGS: FontPairing[] = [
  { id: "classic", label: "Classic", headingFont: "'Playfair Display', Georgia, serif", bodyFont: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { id: "romantic", label: "Romantic", headingFont: "'Cormorant Garamond', Georgia, serif", bodyFont: "'Manrope', system-ui, sans-serif" },
  { id: "modern", label: "Modern", headingFont: "'DM Serif Display', Georgia, serif", bodyFont: "'Inter', system-ui, sans-serif" },
];

export function getPalette(id: string): ColorPalette {
  return COLOR_PALETTES.find((p) => p.id === id) ?? COLOR_PALETTES[0];
}

export function getFontPairing(id: string): FontPairing {
  return FONT_PAIRINGS.find((f) => f.id === id) ?? FONT_PAIRINGS[0];
}
