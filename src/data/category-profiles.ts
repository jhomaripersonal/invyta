import type { EventCategory, InvitationSectionType } from "../types/models";

// How an invitation reads for each kind of event: its starting copy, what
// each section is called, and which sections start switched off. Nothing
// here changes what a section *is* — a wake's "Tribute" is the Story
// section under another name — so every invitation keeps the same section
// set, and text the organizer wrote always wins over these defaults.

export interface SectionCopy {
  // The section's name in the builder and in the invitation's top bar.
  name: string;
  // Shorter name for the top bar, where `name` is too long for a link.
  short?: string;
  // Small label above the heading on the invitation.
  eyebrow: string;
  // The heading, with `accent` (its last word or two) set in the accent
  // style. For Story, Video and Entourage this is only the starting text —
  // the section's own heading replaces it.
  heading: string;
  accent?: string;
}

export interface RsvpCopy {
  prompt: string;
  confirmedTitle: string;
  confirmedBody: string;
  declinedTitle: string;
  declinedBody: string;
  messagePlaceholder: string;
}

export interface CategoryProfile {
  // False for memorial events: no confetti when a guest confirms.
  celebratory: boolean;
  // Cover subtitle for a new invitation; "{category}" is the category's
  // label in lower case.
  coverSubtitle: string;
  // Cover host line for a new invitation; "{host}" is the event's host.
  hostLine: string;
  // Sections a new invitation never starts with, even when the chosen
  // template turns them on. The organizer can still switch them on.
  offByDefault: InvitationSectionType[];
  // Example role shown in the builder's Entourage form.
  entourageRole: string;
  rsvp: RsvpCopy;
  sections: Record<InvitationSectionType, SectionCopy>;
}

type ProfilePatch = Partial<Omit<CategoryProfile, "rsvp" | "sections">> & {
  rsvp?: Partial<RsvpCopy>;
  sections?: Partial<Record<InvitationSectionType, Partial<SectionCopy>>>;
};

function extend(base: CategoryProfile, patch: ProfilePatch): CategoryProfile {
  const sections = { ...base.sections };
  for (const [type, copy] of Object.entries(patch.sections ?? {}) as [InvitationSectionType, Partial<SectionCopy>][]) {
    sections[type] = {
      ...sections[type],
      // A renamed section or a new heading doesn't inherit the short name
      // or accent word that belonged to the old one.
      ...(copy.name ? { short: undefined } : {}),
      ...(copy.heading ? { accent: undefined } : {}),
      ...copy,
    };
  }
  return { ...base, ...patch, rsvp: { ...base.rsvp, ...patch.rsvp }, sections };
}

// Weddings, birthdays and other personal celebrations — the wording every
// invitation had before profiles existed.
const CELEBRATION: CategoryProfile = {
  celebratory: true,
  coverSubtitle: "You're invited to celebrate this {category}",
  hostLine: "Hosted by {host}",
  offByDefault: [],
  entourageRole: "Best Man",
  rsvp: {
    prompt: "Will you celebrate with us?",
    confirmedTitle: "You're on the guest list",
    confirmedBody: "We can't wait to celebrate with you.",
    declinedTitle: "Thanks for letting us know",
    declinedBody: "We'll miss you, but we appreciate the heads up.",
    messagePlaceholder: "Message for the host (optional)",
  },
  sections: {
    cover: { name: "Cover", eyebrow: "", heading: "" },
    countdown: { name: "Countdown", eyebrow: "", heading: "" },
    details: { name: "Details", eyebrow: "The Details", heading: "" },
    story: { name: "Story", eyebrow: "Our Story", heading: "Our Story" },
    schedule: { name: "Schedule", eyebrow: "Timeline", heading: "Order of the", accent: "day" },
    venue: { name: "Venue", eyebrow: "The Venue", heading: "Where we", accent: "gather" },
    gallery: { name: "Gallery", eyebrow: "Gallery", heading: "A few of our", accent: "favorites" },
    video: { name: "Video", eyebrow: "Video", heading: "Our Film" },
    dress_code: { name: "Dress Code", eyebrow: "Dress Code", heading: "What to", accent: "wear" },
    entourage: { name: "Entourage", eyebrow: "Entourage", heading: "The entourage" },
    gift_registry: { name: "Gift Registry", short: "Registry", eyebrow: "Gift Registry", heading: "With", accent: "love" },
    faq: { name: "FAQ", eyebrow: "Questions", heading: "Good to", accent: "know" },
    rsvp: { name: "RSVP", eyebrow: "RSVP", heading: "" },
  },
};

const DEBUT = extend(CELEBRATION, {
  entourageRole: "18 Roses",
  sections: { entourage: { name: "The 18s", eyebrow: "The 18s", heading: "The eighteens" } },
});

const BAPTISM = extend(CELEBRATION, {
  entourageRole: "Ninong",
  sections: {
    story: { eyebrow: "A Note", heading: "A Note From Us" },
    entourage: { name: "Godparents", eyebrow: "Godparents", heading: "Ninongs & ninangs" },
  },
});

const GRADUATION = extend(CELEBRATION, {
  entourageRole: "Valedictorian",
  sections: {
    story: { eyebrow: "The Journey", heading: "The Journey" },
    entourage: { name: "Honorees", eyebrow: "Honorees", heading: "The honorees" },
  },
});

const REUNION = extend(CELEBRATION, {
  coverSubtitle: "You're invited to our {category}",
  entourageRole: "Batch President",
  sections: { entourage: { name: "Organizers", eyebrow: "Organizers", heading: "The organizers" } },
});

// Corporate and community events: an invitation to attend rather than to
// celebrate, with no couple or family behind an "Our Story".
const FORMAL = extend(CELEBRATION, {
  coverSubtitle: "You're invited to our {category}",
  entourageRole: "Program Host",
  rsvp: {
    prompt: "Will you be attending?",
    confirmedBody: "We look forward to seeing you.",
    declinedBody: "We're sorry you can't make it.",
  },
  sections: {
    story: { name: "About", eyebrow: "About", heading: "About the event" },
    schedule: { eyebrow: "Program", heading: "What to", accent: "expect" },
    venue: { heading: "Where to", accent: "find us" },
    gallery: { heading: "Event", accent: "highlights" },
    video: { heading: "Featured Video" },
    entourage: { name: "Organizers", eyebrow: "Organizers", heading: "The organizers" },
    gift_registry: { name: "Gifts", eyebrow: "Gifts", heading: "A note on", accent: "gifts" },
  },
});

const COMMUNITY = extend(FORMAL, { rsvp: { prompt: "Will you join us?" } });

const CAUSE = extend(COMMUNITY, {
  sections: {
    story: { eyebrow: "Our Cause", heading: "Our Cause" },
    gift_registry: { name: "Donations", eyebrow: "Donations", heading: "Ways to", accent: "give" },
  },
});

const MEMORIAL = extend(CELEBRATION, {
  celebratory: false,
  coverSubtitle: "In loving memory",
  hostLine: "From {host}",
  offByDefault: ["countdown"],
  entourageRole: "Children",
  rsvp: {
    prompt: "Will you be joining us?",
    confirmedTitle: "Thank you for letting us know",
    confirmedBody: "Your presence will mean a great deal to the family.",
    declinedTitle: "Thank you for letting us know",
    declinedBody: "Thank you for keeping the family in your thoughts.",
    messagePlaceholder: "Message for the family (optional)",
  },
  sections: {
    story: { name: "Tribute", eyebrow: "In Loving Memory", heading: "A Life Remembered" },
    schedule: { eyebrow: "Schedule", heading: "Order of", accent: "service" },
    gallery: { heading: "Cherished", accent: "memories" },
    video: { heading: "A Tribute" },
    dress_code: { eyebrow: "Attire" },
    entourage: { name: "Family", eyebrow: "The Family", heading: "The bereaved family" },
    gift_registry: { name: "Condolences", eyebrow: "In Lieu of Flowers", heading: "With", accent: "gratitude" },
  },
});

const WAKE = extend(MEMORIAL, {
  sections: { schedule: { heading: "Viewing", accent: "schedule" } },
});

const PROFILES: Record<EventCategory, CategoryProfile> = {
  wedding: CELEBRATION,
  birthday: CELEBRATION,
  debut: DEBUT,
  baptism: BAPTISM,
  anniversary: CELEBRATION,
  engagement: CELEBRATION,
  baby_shower: CELEBRATION,
  bridal_shower: CELEBRATION,
  house_blessing: CELEBRATION,
  graduation: GRADUATION,
  recognition: extend(GRADUATION, { coverSubtitle: "You're invited to our recognition day" }),
  school_reunion: REUNION,
  class_reunion: REUNION,
  company_party: FORMAL,
  team_building: FORMAL,
  seminar: FORMAL,
  conference: FORMAL,
  product_launch: FORMAL,
  christmas_party: FORMAL,
  barangay_event: COMMUNITY,
  fundraiser: CAUSE,
  charity_event: CAUSE,
  organization_gathering: COMMUNITY,
  wake: WAKE,
  memorial_gathering: MEMORIAL,
  celebration_of_life: MEMORIAL,
};

// Takes any string so a category the app doesn't know (an older row, a
// value added to the database first) still gets the default wording.
export function categoryProfile(category: string): CategoryProfile {
  return PROFILES[category as EventCategory] ?? CELEBRATION;
}
