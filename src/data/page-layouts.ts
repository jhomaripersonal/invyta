import type { InvitationTheme, PageLayout } from "../types/models";

// Page layouts (the invitation's overall structure, stored as
// `theme.layout`) and cover styles (stored as the cover section's
// `content.style`). Both are optional in saved invitations: a missing
// value means "classic" / "full", the look every invitation had before
// these options existed.
//
// Which options are Premium is mirrored server-side by
// design_style_is_premium() in supabase/schema.sql — keep the two in sync.

export type CoverStyle = "full" | "framed" | "split" | "monogram";

export const DEFAULT_PAGE_LAYOUT: PageLayout = "classic";
export const DEFAULT_COVER_STYLE: CoverStyle = "full";

export const PAGE_LAYOUTS: { id: PageLayout; label: string; description: string; premium: boolean }[] = [
  { id: "classic", label: "Classic", description: "Centered sections, stacked top to bottom", premium: false },
  { id: "stationery", label: "Stationery", description: "Printed-card look on textured paper", premium: false },
  { id: "story", label: "Story", description: "Full-screen panels, one section at a time", premium: true },
  { id: "editorial", label: "Editorial", description: "Magazine style — left-aligned, big type", premium: true },
  { id: "split", label: "Split", description: "Cover pinned beside the content on wide screens", premium: true },
];

export const COVER_STYLES: { id: CoverStyle; label: string; description: string; premium: boolean }[] = [
  { id: "full", label: "Full photo", description: "Edge-to-edge photo with the title over it", premium: false },
  { id: "framed", label: "Arch frame", description: "Photo in an arched frame, title below", premium: false },
  { id: "split", label: "Side by side", description: "Photo and title next to each other", premium: true },
  { id: "monogram", label: "Monogram", description: "No photo — initials in an ornamental ring", premium: true },
];

export function pageLayout(theme: InvitationTheme): PageLayout {
  return PAGE_LAYOUTS.some((l) => l.id === theme.layout) ? (theme.layout as PageLayout) : DEFAULT_PAGE_LAYOUT;
}

export function coverStyle(content: Record<string, unknown>): CoverStyle {
  const v = content.style;
  return COVER_STYLES.some((c) => c.id === v) ? (v as CoverStyle) : DEFAULT_COVER_STYLE;
}
