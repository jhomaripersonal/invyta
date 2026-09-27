import type { CSSProperties } from "react";
import { CUSTOM_PALETTE_ID, buildCustomPalette, contrastRatio, getFontPairing, getPalette, type ColorPalette, type FontPairing } from "../../data/theme-presets";
import { pageLayout } from "../../data/page-layouts";
import type { ButtonStyle, InvitationTheme, PageLayout } from "../../types/models";

export interface ResolvedTheme {
  palette: ColorPalette;
  fonts: FontPairing;
  buttonStyle: ButtonStyle;
  layout: PageLayout;
}

export function resolveTheme(theme: InvitationTheme): ResolvedTheme {
  return {
    palette: theme.paletteId === CUSTOM_PALETTE_ID && theme.customPalette ? buildCustomPalette(theme.customPalette) : getPalette(theme.paletteId),
    fonts: getFontPairing(theme.fontPairingId),
    buttonStyle: theme.buttonStyle,
    layout: pageLayout(theme),
  };
}

export function buttonRadiusClass(style: ButtonStyle): string {
  if (style === "square") return "rounded-none";
  if (style === "outline") return "rounded-xl";
  return "rounded-xl";
}

export function buttonStyleProps(style: ButtonStyle, palette: ColorPalette): CSSProperties {
  if (style === "outline") {
    return { backgroundColor: "transparent", color: palette.primary, border: `1.5px solid ${palette.primary}` };
  }
  return { backgroundColor: palette.primary, color: palette.onPrimary };
}

// Ink for things that stay dark-on-light whatever the palette: QR codes
// (scanners want dark on white) and white buttons laid over photos.
export function inkOnWhite(palette: ColorPalette): string {
  return palette.dark ? "#1C1917" : palette.text;
}

// Text color for an arbitrary fill (e.g. a user-picked accent): `prefer`
// when it reads well enough, otherwise white or near-black.
export function readableOn(fill: string, prefer: string): string {
  if (contrastRatio(prefer, fill) >= 4.5) return prefer;
  return contrastRatio("#FFFFFF", fill) >= contrastRatio("#1C1917", fill) ? "#FFFFFF" : "#1C1917";
}

// The Editorial layout sets content sections flush-left with a wider
// measure; every other layout centers them. Sections use these instead
// of hard-coding "text-center" / "mx-auto" so one switch reflows them all.
export function isEditorial(theme: ResolvedTheme): boolean {
  return theme.layout === "editorial";
}

export function alignClass(theme: ResolvedTheme): string {
  return isEditorial(theme) ? "text-left" : "text-center";
}

// Readable line length for body copy — centered and narrow normally,
// left-aligned and a little wider in Editorial.
export function measureClass(theme: ResolvedTheme): string {
  return isEditorial(theme) ? "max-w-md" : "max-w-xs mx-auto";
}
