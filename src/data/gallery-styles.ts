import type { CSSProperties } from "react";

// Gallery section display options, stored on the gallery section's own
// content as `layout` and `filter` (alongside `imageUrls`, which stays a
// plain string array — the server-side photo limit counts it). A missing
// value means the defaults below, so invitations saved before these
// options existed keep rendering exactly as they did.
//
// Which options are Premium is mirrored server-side by
// gallery_style_is_premium() in supabase/schema.sql — keep the two in sync.

export type GalleryLayout = "masonry" | "grid" | "featured" | "slideshow" | "polaroid";
export type GalleryFilter = "none" | "bw" | "warm" | "soft";

export const DEFAULT_GALLERY_LAYOUT: GalleryLayout = "masonry";
export const DEFAULT_GALLERY_FILTER: GalleryFilter = "none";

export const GALLERY_LAYOUTS: { id: GalleryLayout; label: string; description: string; premium: boolean }[] = [
  { id: "masonry", label: "Masonry", description: "Staggered columns, photos keep their shape", premium: false },
  { id: "grid", label: "Grid", description: "Even squares", premium: false },
  { id: "featured", label: "Featured", description: "One large photo, smaller ones below", premium: true },
  { id: "slideshow", label: "Slideshow", description: "Swipeable, plays on its own", premium: true },
  { id: "polaroid", label: "Polaroid", description: "Tilted white-framed prints", premium: true },
];

export const GALLERY_FILTERS: { id: GalleryFilter; label: string; premium: boolean }[] = [
  { id: "none", label: "Original", premium: false },
  { id: "bw", label: "Black & white", premium: true },
  { id: "warm", label: "Warm", premium: true },
  { id: "soft", label: "Soft", premium: true },
];

// Plain CSS filters, applied at render time — the uploaded photo itself is
// never modified, so switching back to "Original" is always lossless.
const FILTER_CSS: Record<GalleryFilter, string | undefined> = {
  none: undefined,
  bw: "grayscale(1) contrast(1.05)",
  warm: "sepia(0.35) saturate(1.15) contrast(1.02)",
  soft: "brightness(1.06) contrast(0.88) saturate(0.85)",
};

export function galleryFilterStyle(filter: GalleryFilter): CSSProperties {
  const css = FILTER_CSS[filter];
  return css ? { filter: css } : {};
}

export function galleryLayout(content: Record<string, unknown>): GalleryLayout {
  const v = content.layout;
  return GALLERY_LAYOUTS.some((l) => l.id === v) ? (v as GalleryLayout) : DEFAULT_GALLERY_LAYOUT;
}

export function galleryFilter(content: Record<string, unknown>): GalleryFilter {
  const v = content.filter;
  return GALLERY_FILTERS.some((f) => f.id === v) ? (v as GalleryFilter) : DEFAULT_GALLERY_FILTER;
}
