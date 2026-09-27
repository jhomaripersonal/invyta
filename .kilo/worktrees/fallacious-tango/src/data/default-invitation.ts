import type { InvitationConfig, InvitationSectionType } from "../types/models";
import { EVENT_CATEGORIES } from "./event-categories";
import type { TemplateDesign } from "./landing-template-previews";

export interface DefaultInvitationSeed {
  name: string;
  category: string;
  host?: string;
  description?: string;
  venueName?: string;
  venueAddress?: string;
  dressCode?: string;
  contactDetails?: string;
}

export const SECTION_ORDER: InvitationSectionType[] = [
  "cover",
  "countdown",
  "details",
  "story",
  "schedule",
  "venue",
  "gallery",
  "dress_code",
  "entourage",
  "gift_registry",
  "faq",
  "rsvp",
];

// Enabled out of the box because they map directly to fields the Create
// Event wizard already collects — everything else starts off so a fresh
// invitation isn't cluttered with empty sections.
const ENABLED_BY_DEFAULT: InvitationSectionType[] = ["cover", "countdown", "details", "venue", "rsvp"];

// With a template design (the one the organizer picked in the Create Event
// wizard), the invitation starts with that template's look and section
// set instead of the plain defaults — the event's own details fill the
// content either way.
export function createDefaultInvitation(seed: DefaultInvitationSeed, design?: TemplateDesign): InvitationConfig {
  const categoryLabel = EVENT_CATEGORIES.find((c) => c.id === seed.category)?.label ?? seed.category;

  const contentByType: Record<InvitationSectionType, Record<string, unknown>> = {
    cover: {
      ...(design ? { style: design.coverStyle } : {}),
      title: seed.name,
      subtitle: `You're invited to celebrate this ${categoryLabel.toLowerCase()}`,
      hostLine: seed.host ? `Hosted by ${seed.host}` : "",
    },
    countdown: {},
    details: {
      description: seed.description ?? "",
    },
    story: {
      heading: design?.storyHeading ?? "Our Story",
      body: "",
    },
    schedule: {
      items: [] as { time: string; title: string; description: string }[],
    },
    venue: {
      name: seed.venueName ?? "",
      address: seed.venueAddress ?? "",
      mapUrl: "",
    },
    gallery: {
      imageUrls: [] as string[],
    },
    dress_code: {
      description: seed.dressCode ?? "",
    },
    entourage: {
      groups: [] as { role: string; names: string }[],
    },
    gift_registry: {
      message: "",
      links: [] as { label: string; url: string }[],
    },
    faq: {
      items: [] as { question: string; answer: string }[],
    },
    rsvp: {
      prompt: design?.rsvpPrompt ?? "Will you celebrate with us?",
    },
  };

  // The template's section styles (e.g. a Schedule shown as cards) ride
  // along on each section's content, like the cover style does.
  for (const [type, style] of Object.entries(design?.sectionStyles ?? {})) {
    contentByType[type as InvitationSectionType] = { ...contentByType[type as InvitationSectionType], style };
  }

  const enabled = design?.enabledSections ?? ENABLED_BY_DEFAULT;

  return {
    sections: SECTION_ORDER.map((type, index) => ({
      type,
      // Cover and RSVP are the invitation's frame — always on, even if a
      // template's section list somehow left one out.
      enabled: type === "cover" || type === "rsvp" || enabled.includes(type),
      order: index,
      content: contentByType[type],
    })),
    theme: design?.theme ?? {
      paletteId: "gold",
      fontPairingId: "classic",
      buttonStyle: "rounded",
    },
  };
}
