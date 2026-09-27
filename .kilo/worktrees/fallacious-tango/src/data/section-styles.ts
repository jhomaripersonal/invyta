import type { InvitationSectionType } from "../types/models";

// Per-section display styles, stored as the section's own `content.style`
// and picked at the top of that section's tab in the builder. The first
// entry for each section is its original look and the default when
// `style` is missing, so invitations saved before these options existed
// render unchanged. (Cover styles live in page-layouts.ts alongside page
// layouts, since they're picked with them in mind.)
//
// Which styles are Premium is mirrored server-side by
// design_style_is_premium() in supabase/schema.sql — keep the two in sync.

export interface SectionStyleOption {
  id: string;
  label: string;
  description: string;
  premium: boolean;
}

export const SECTION_STYLES: Partial<Record<InvitationSectionType, SectionStyleOption[]>> = {
  countdown: [
    { id: "classic", label: "Classic", description: "Four numbers divided by hairlines", premium: false },
    { id: "boxes", label: "Boxes", description: "Each number in its own tile", premium: false },
    { id: "minimal", label: "Big number", description: "Just the days to go, set large", premium: false },
  ],
  schedule: [
    { id: "timeline", label: "Timeline", description: "Clock icons joined by a line", premium: false },
    { id: "list", label: "List", description: "Times in a column beside each item", premium: false },
    { id: "cards", label: "Cards", description: "Each item on its own card", premium: true },
  ],
  venue: [
    { id: "centered", label: "Centered", description: "Name and address, centered", premium: false },
    { id: "card", label: "Card", description: "Details on a bordered card", premium: false },
    { id: "photo", label: "Photo", description: "Details over a photo of the venue", premium: true },
    { id: "map", label: "Map", description: "An embedded map of the address", premium: true },
  ],
  story: [
    { id: "centered", label: "Centered", description: "Heading and text, centered", premium: false },
    { id: "quote", label: "Pull quote", description: "Set large, like a quotation", premium: false },
    { id: "photo", label: "With photo", description: "Text beside a photo", premium: true },
  ],
};

export function sectionStyle(type: InvitationSectionType, content: Record<string, unknown>): string {
  const options = SECTION_STYLES[type];
  if (!options) return "";
  return options.some((o) => o.id === content.style) ? (content.style as string) : options[0].id;
}
