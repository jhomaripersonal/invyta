// Sample data behind the landing page's "Preview" button (Templates
// section) — a fabricated EventRecord + InvitationConfig per template, fed
// into the exact same SectionList/section-renderer tree the real builder
// and public invitation pages use. So a visitor's "Preview" is a real
// rendering of the product, not a static mockup screenshot.
//
// Each template deliberately varies more than color: font pairing, button
// shape, and — most importantly — which sections are even turned on, so a
// debut genuinely looks like a debut (Entourage, Dress Code) and a
// corporate event genuinely looks like one (Schedule, FAQ, no "Our Story")
// rather than six recolors of the same layout.
import type { EventRecord } from "../lib/events-store";
import type { ButtonStyle, EventCategory, InvitationConfig, InvitationSectionType, InvitationTheme, PageLayout } from "../types/models";
import { SECTION_ORDER } from "./default-invitation";
import type { CoverStyle } from "./page-layouts";

export interface TemplatePreviewSeed {
  templateName: string;
  event: EventRecord;
  invitation: InvitationConfig;
}

interface TemplateBlueprint {
  templateName: string;
  paletteId: string;
  fontPairingId: "classic" | "romantic" | "modern";
  buttonStyle: ButtonStyle;
  // Page structure and cover style. Free templates must stick to the free
  // options (see PAGE_LAYOUTS / COVER_STYLES in page-layouts.ts) — an event
  // created from a free template on the Free plan would otherwise be
  // rejected by the database's design-style check.
  layout: PageLayout;
  coverStyle: CoverStyle;
  // Per-section style overrides (ids from SECTION_STYLES in
  // section-styles.ts); the same free-templates-use-free-styles rule applies.
  sectionStyles?: Partial<Record<InvitationSectionType, string>>;
  eventName: string;
  category: EventCategory;
  venueName: string;
  venueAddress: string;
  imageUrl: string;
  content: Partial<Record<InvitationSectionType, Record<string, unknown>>>;
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildEvent(bp: TemplateBlueprint): EventRecord {
  return {
    id: "preview",
    ownerId: "preview",
    name: bp.eventName,
    category: bp.category,
    host: "",
    date: daysFromNow(120),
    time: "16:00",
    venueName: bp.venueName,
    venueAddress: bp.venueAddress,
    status: "published",
    slug: "preview",
    imageUrl: bp.imageUrl,
    guestCount: 0,
    confirmedGuestCount: 0,
    pendingGuestCount: 0,
    invitation: { sections: [], theme: themeOf(bp) },
    plan: "free",
    ownerPlan: "free",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function themeOf(bp: TemplateBlueprint): InvitationTheme {
  return { paletteId: bp.paletteId, fontPairingId: bp.fontPairingId, buttonStyle: bp.buttonStyle, layout: bp.layout };
}

function withStyle(style: string | undefined, content: Record<string, unknown>): Record<string, unknown> {
  return style ? { ...content, style } : content;
}

function buildInvitation(bp: TemplateBlueprint): InvitationConfig {
  return {
    theme: themeOf(bp),
    sections: SECTION_ORDER.map((type, index) => ({
      type,
      enabled: type in bp.content,
      order: index,
      content: withStyle(type === "cover" ? bp.coverStyle : bp.sectionStyles?.[type], bp.content[type] ?? {}),
    })),
  };
}

function unsplash(id: string): string {
  return `https://images.unsplash.com/${id}?w=480&h=600&fit=crop&auto=format`;
}

const BLUEPRINTS: TemplateBlueprint[] = [
  {
    templateName: "Elegant Garden",
    paletteId: "sage",
    fontPairingId: "romantic",
    buttonStyle: "rounded",
    layout: "story",
    coverStyle: "full",
    sectionStyles: { countdown: "minimal", story: "photo", venue: "map" },
    eventName: "Elena & Marco",
    category: "wedding",
    venueName: "The Garden Pavilion",
    venueAddress: "Tagaytay, Cavite",
    imageUrl: "photo-1519741497674-611481863552",
    content: {
      cover: {},
      countdown: {},
      details: { description: "Join us as we say I do, surrounded by blooming gardens and the people we love most." },
      story: { heading: "Our Story", body: "We met on a rainy afternoon and haven't stopped talking since. Five years later, we're ready for our forever." },
      venue: { name: "The Garden Pavilion", address: "Tagaytay, Cavite" },
      gallery: { imageUrls: [unsplash("photo-1465495976277-4387d4b0b4c6"), unsplash("photo-1519225421980-715cb0215aed")] },
      rsvp: { prompt: "Will you celebrate with us?" },
    },
  },
  {
    templateName: "Golden Hour",
    paletteId: "gold",
    fontPairingId: "classic",
    buttonStyle: "outline",
    layout: "split",
    coverStyle: "framed",
    sectionStyles: { countdown: "boxes", schedule: "cards" },
    eventName: "Sophia & Daniel",
    category: "wedding",
    venueName: "Sunset Terrace",
    venueAddress: "Nasugbu, Batangas",
    imageUrl: "photo-1511285560929-80b456fea0bc",
    content: {
      cover: {},
      countdown: {},
      details: { description: "An evening celebration as the sun sets over the hills — join us for golden light and good company." },
      schedule: {
        items: [
          { time: "4:00 PM", title: "Ceremony", description: "A short outdoor ceremony as the sun begins to set." },
          { time: "6:00 PM", title: "Cocktail Hour", description: "Drinks and hors d'oeuvres on the terrace." },
          { time: "7:30 PM", title: "Reception", description: "Dinner, toasts, and dancing under the stars." },
        ],
      },
      venue: { name: "Sunset Terrace", address: "Nasugbu, Batangas" },
      rsvp: { prompt: "Will you celebrate with us?" },
    },
  },
  {
    templateName: "Pastel Dreams",
    paletteId: "blush",
    fontPairingId: "modern",
    buttonStyle: "square",
    layout: "classic",
    coverStyle: "framed",
    sectionStyles: { countdown: "boxes" },
    eventName: "Mia's 7th Birthday",
    category: "birthday",
    venueName: "Wonderland Events Place",
    venueAddress: "Quezon City",
    imageUrl: "photo-1464349153735-7db50ed83c84",
    content: {
      cover: {},
      countdown: {},
      details: { description: "A whimsical, pastel-filled afternoon fit for a little dreamer turning 7." },
      gallery: { imageUrls: [unsplash("photo-1464349153735-7db50ed83c84")] },
      faq: {
        items: [
          { question: "What should my child wear?", answer: "Anything comfy and colorful — think pastel and play-ready!" },
          { question: "Are parents welcome to stay?", answer: "Absolutely, we'd love to have you celebrate with us." },
        ],
      },
      rsvp: { prompt: "Will you join the fun?" },
    },
  },
  {
    templateName: "Royal Debut",
    paletteId: "navy",
    fontPairingId: "classic",
    buttonStyle: "rounded",
    layout: "stationery",
    coverStyle: "monogram",
    sectionStyles: { countdown: "minimal", venue: "card" },
    eventName: "Isabella's 18th Debut",
    category: "debut",
    venueName: "Grand Ballroom",
    venueAddress: "Makati City",
    imageUrl: "photo-1566633806327-68e152aaf26d",
    content: {
      cover: {},
      countdown: {},
      details: { description: "Eighteen roses, eighteen candles, and a night Isabella will always remember." },
      entourage: {
        groups: [
          { role: "18 Roses", names: "Close friends and family" },
          { role: "18 Candles", names: "Mentors who lit the way" },
          { role: "18 Treasures", names: "Those who shaped her journey" },
        ],
      },
      dress_code: { description: "Formal attire. Gold and champagne tones are encouraged, but not required." },
      venue: { name: "Grand Ballroom", address: "Makati City" },
      rsvp: { prompt: "Will you celebrate with us?" },
    },
  },
  {
    templateName: "Soft Blooms",
    paletteId: "rose",
    fontPairingId: "romantic",
    buttonStyle: "rounded",
    layout: "stationery",
    coverStyle: "framed",
    sectionStyles: { story: "quote", venue: "card" },
    eventName: "Baby Leo's Baptism",
    category: "baptism",
    venueName: "St. Anthony's Chapel",
    venueAddress: "Alabang, Muntinlupa",
    imageUrl: "photo-1515488042361-ee00e0ddd4e4",
    content: {
      cover: {},
      countdown: {},
      details: { description: "A blessed celebration of new beginnings — join us as we welcome Leo into our faith community." },
      story: { heading: "A Note From Us", body: "Our hearts have never been fuller. Thank you for being part of this beautiful milestone with us." },
      venue: { name: "St. Anthony's Chapel", address: "Alabang, Muntinlupa" },
      gift_registry: { message: "Your presence and prayers are all we ask for. Should you wish to give, envelopes will gladly be received.", links: [] },
      rsvp: { prompt: "Will you join us?" },
    },
  },
  {
    templateName: "Classic Navy",
    paletteId: "navy",
    fontPairingId: "modern",
    buttonStyle: "square",
    layout: "classic",
    coverStyle: "full",
    sectionStyles: { countdown: "boxes", schedule: "list" },
    eventName: "Annual Partners Gala",
    category: "company_party",
    venueName: "The Grand Hall",
    venueAddress: "BGC, Taguig",
    imageUrl: "photo-1454165804606-c3d57bc86b40",
    content: {
      cover: {},
      countdown: {},
      details: { description: "An evening of recognition, reflection, and celebration with the people who make it all possible." },
      schedule: {
        items: [
          { time: "6:00 PM", title: "Registration", description: "Arrival and welcome drinks." },
          { time: "7:00 PM", title: "Program", description: "Awards and recognition segment." },
          { time: "8:30 PM", title: "Dinner & Networking", description: "Dinner service followed by open networking." },
        ],
      },
      venue: { name: "The Grand Hall", address: "BGC, Taguig" },
      faq: {
        items: [
          { question: "Is there a dress code?", answer: "Business formal attire is requested." },
          { question: "Is parking available?", answer: "Yes, valet parking is available at the venue entrance." },
        ],
      },
      rsvp: { prompt: "Will you be attending?" },
    },
  },
  {
    templateName: "Minimalist Ivory",
    paletteId: "navy",
    fontPairingId: "modern",
    buttonStyle: "outline",
    layout: "editorial",
    coverStyle: "monogram",
    sectionStyles: { countdown: "minimal", schedule: "list", venue: "map" },
    eventName: "Alicia & Ramon",
    category: "wedding",
    venueName: "The Peninsula Manila",
    venueAddress: "Makati City",
    imageUrl: "photo-1522673607200-164d1b6ce486",
    content: {
      cover: {},
      countdown: {},
      details: { description: "A quiet celebration of love, kept simple and true to who we are." },
      schedule: {
        items: [
          { time: "3:00 PM", title: "Ceremony", description: "An intimate ceremony for close family and friends." },
          { time: "5:00 PM", title: "Reception", description: "Dinner and celebration to follow." },
        ],
      },
      venue: { name: "The Peninsula Manila", address: "Makati City" },
      rsvp: { prompt: "Will you celebrate with us?" },
    },
  },
  {
    templateName: "Tropical Fiesta",
    paletteId: "gold",
    fontPairingId: "modern",
    buttonStyle: "rounded",
    layout: "classic",
    coverStyle: "full",
    sectionStyles: { countdown: "minimal" },
    eventName: "Carlos' 30th Fiesta",
    category: "birthday",
    venueName: "Amanpulo Beach Club",
    venueAddress: "Palawan",
    imageUrl: "photo-1533105079780-92b9be482077",
    content: {
      cover: {},
      countdown: {},
      details: { description: "Sun, sand, and thirty years worth of celebrating — let's fiesta!" },
      gallery: { imageUrls: [unsplash("photo-1533105079780-92b9be482077")] },
      gift_registry: { message: "No gifts needed — just bring your dancing shoes and good vibes.", links: [] },
      rsvp: { prompt: "Will you be there?" },
    },
  },
  {
    templateName: "Modern Grad",
    paletteId: "navy",
    fontPairingId: "modern",
    buttonStyle: "square",
    layout: "classic",
    coverStyle: "full",
    sectionStyles: { schedule: "list", venue: "card" },
    eventName: "Rafael's Graduation",
    category: "graduation",
    venueName: "University Amphitheater",
    venueAddress: "Diliman, Quezon City",
    imageUrl: "photo-1517486808906-6ca8b3f04846",
    content: {
      cover: {},
      countdown: {},
      details: { description: "Four years in the making — join us as we celebrate this milestone and the road ahead." },
      schedule: {
        items: [
          { time: "9:00 AM", title: "Processional", description: "Guests are asked to be seated by 8:45 AM." },
          { time: "10:00 AM", title: "Commencement", description: "The ceremony and conferment of degrees." },
          { time: "12:00 PM", title: "Lunch Reception", description: "Join us for a celebratory lunch after the ceremony." },
        ],
      },
      venue: { name: "University Amphitheater", address: "Diliman, Quezon City" },
      rsvp: { prompt: "Will you be there to celebrate?" },
    },
  },
  {
    templateName: "Boardroom Classic",
    paletteId: "sage",
    fontPairingId: "classic",
    buttonStyle: "outline",
    layout: "editorial",
    coverStyle: "split",
    sectionStyles: { countdown: "boxes", venue: "photo" },
    eventName: "Founders' Appreciation Dinner",
    category: "company_party",
    venueName: "Shangri-La at the Fort",
    venueAddress: "BGC, Taguig",
    imageUrl: "photo-1511578314322-379afb476865",
    content: {
      cover: {},
      countdown: {},
      details: { description: "A dinner to honor the people whose dedication built this company." },
      venue: { name: "Shangri-La at the Fort", address: "BGC, Taguig" },
      gift_registry: { message: "In lieu of gifts, we invite you to support our chosen charity this season.", links: [] },
      rsvp: { prompt: "Will you be attending?" },
    },
  },
  {
    templateName: "Wildflower Vows",
    paletteId: "rose",
    fontPairingId: "classic",
    buttonStyle: "rounded",
    // The one free wedding template, so free options only.
    layout: "stationery",
    coverStyle: "framed",
    sectionStyles: { story: "quote", schedule: "list" },
    eventName: "Carlo & Bianca",
    category: "wedding",
    venueName: "Balay Dako Garden Events",
    venueAddress: "Antipolo, Rizal",
    imageUrl: "photo-1583939003579-730e3918a45a",
    content: {
      cover: {},
      countdown: {},
      details: { description: "A garden wedding filled with wildflowers, laughter, and the people who mean the most to us." },
      story: { heading: "How We Met", body: "A chance encounter at a mutual friend's wedding — turns out fate had other plans for us too." },
      schedule: {
        items: [
          { time: "2:00 PM", title: "Ceremony", description: "An outdoor garden ceremony under the trees." },
          { time: "4:00 PM", title: "Cocktail Hour", description: "Drinks and canapés on the lawn." },
          { time: "6:00 PM", title: "Reception", description: "Dinner, speeches, and dancing under string lights." },
        ],
      },
      gallery: { imageUrls: [unsplash("photo-1583939003579-730e3918a45a"), unsplash("photo-1465495976277-4387d4b0b4c6")] },
      rsvp: { prompt: "Will you celebrate with us?" },
    },
  },
  {
    templateName: "Balloon Bash",
    paletteId: "gold",
    fontPairingId: "romantic",
    buttonStyle: "square",
    layout: "stationery",
    coverStyle: "full",
    sectionStyles: { countdown: "boxes" },
    eventName: "Mateo's 5th Birthday Bash",
    category: "birthday",
    venueName: "Fiesta Fun Party Place",
    venueAddress: "Pasig City",
    imageUrl: "photo-1530103862676-de8c9debad1d",
    content: {
      cover: {},
      countdown: {},
      details: { description: "Balloons, cake, and lots of giggles — join us as Mateo turns five!" },
      gallery: { imageUrls: [unsplash("photo-1530103862676-de8c9debad1d")] },
      faq: {
        items: [
          { question: "What should kids wear?", answer: "Comfortable play clothes — there will be games!" },
          { question: "Are siblings welcome?", answer: "The more the merrier — bring the whole family." },
        ],
      },
      rsvp: { prompt: "Will you join the celebration?" },
    },
  },
  {
    templateName: "Chandelier Ball",
    paletteId: "navy",
    fontPairingId: "romantic",
    buttonStyle: "outline",
    layout: "split",
    coverStyle: "full",
    sectionStyles: { countdown: "minimal", schedule: "cards" },
    eventName: "Sophia's 18th Debut",
    category: "debut",
    venueName: "Manila Marriott Grand Ballroom",
    venueAddress: "Pasay City",
    imageUrl: "photo-1519167758481-83f550bb49b3",
    content: {
      cover: {},
      countdown: {},
      details: { description: "Eighteen years, eighteen roses, and one unforgettable night under the chandeliers." },
      entourage: {
        groups: [
          { role: "18 Roses", names: "Family and close friends" },
          { role: "18 Candles", names: "Ninongs and ninangs who guided her" },
          { role: "18 Treasures", names: "Friends who made every year brighter" },
        ],
      },
      dress_code: { description: "Formal / cocktail attire. Navy and silver tones encouraged." },
      schedule: {
        items: [
          { time: "6:00 PM", title: "Cocktails", description: "Welcome drinks and mingling." },
          { time: "7:00 PM", title: "Grand Entrance", description: "The 18 Roses and 18 Candles program begins." },
          { time: "9:00 PM", title: "Dinner & Dance", description: "Dinner service followed by the dance floor opening." },
        ],
      },
      rsvp: { prompt: "Will you celebrate with us?" },
    },
  },
  {
    templateName: "Little Blessing",
    paletteId: "blush",
    fontPairingId: "classic",
    buttonStyle: "rounded",
    layout: "classic",
    coverStyle: "framed",
    sectionStyles: { story: "quote" },
    eventName: "Baby Amara's Baptism",
    category: "baptism",
    venueName: "Our Lady of Lourdes Parish",
    venueAddress: "San Juan City",
    imageUrl: "photo-1544126592-807ade215a0b",
    content: {
      cover: {},
      countdown: {},
      details: { description: "A blessed morning welcoming Amara into our faith, surrounded by the family who will help guide her." },
      story: { heading: "A Prayer For Amara", body: "May she grow up surrounded by love, faith, and every good thing this world has to offer." },
      venue: { name: "Our Lady of Lourdes Parish", address: "San Juan City" },
      gift_registry: { message: "Your presence and prayers mean the world to us. Should you wish to give, monetary gifts are welcome in lieu of items.", links: [] },
      rsvp: { prompt: "Will you join us?" },
    },
  },
  {
    templateName: "Cap Toss",
    paletteId: "sage",
    fontPairingId: "modern",
    buttonStyle: "square",
    layout: "stationery",
    coverStyle: "framed",
    sectionStyles: { countdown: "minimal", schedule: "list" },
    eventName: "Sophia's College Graduation",
    category: "graduation",
    venueName: "UP Theater",
    venueAddress: "Diliman, Quezon City",
    imageUrl: "photo-1622547748225-3fc4abd2cca0",
    content: {
      cover: {},
      countdown: {},
      details: { description: "Four years, countless all-nighters, and one proud moment — join us as we celebrate this milestone." },
      schedule: {
        items: [
          { time: "8:00 AM", title: "Assembly", description: "Guests seated by 7:45 AM." },
          { time: "9:00 AM", title: "Commencement Exercises", description: "The conferment of degrees." },
          { time: "11:30 AM", title: "Lunch Celebration", description: "Join us for lunch right after." },
        ],
      },
      faq: {
        items: [
          { question: "Is there parking available?", answer: "Yes, visitor parking is available on campus." },
          { question: "Can I bring flowers?", answer: "Of course — the graduate would love that!" },
        ],
      },
      rsvp: { prompt: "Will you be there to celebrate?" },
    },
  },
  {
    templateName: "Grand Summit",
    paletteId: "gold",
    fontPairingId: "modern",
    buttonStyle: "outline",
    layout: "editorial",
    coverStyle: "full",
    sectionStyles: { schedule: "cards", venue: "map" },
    eventName: "Annual Leadership Summit",
    category: "company_party",
    venueName: "Grand Hyatt Manila",
    venueAddress: "BGC, Taguig",
    imageUrl: "photo-1560439514-4e9645039924",
    content: {
      cover: {},
      countdown: {},
      details: { description: "A gathering of our leadership team to reflect on the year and align on what's ahead." },
      schedule: {
        items: [
          { time: "8:00 AM", title: "Registration", description: "Check-in and morning coffee." },
          { time: "9:00 AM", title: "Keynote & Sessions", description: "Leadership talks and breakout sessions." },
          { time: "12:30 PM", title: "Networking Lunch", description: "Lunch and open networking." },
        ],
      },
      venue: { name: "Grand Hyatt Manila", address: "BGC, Taguig" },
      faq: {
        items: [
          { question: "Is there a dress code?", answer: "Business casual attire is requested." },
          { question: "Will sessions be recorded?", answer: "Yes, recordings will be shared with all attendees afterward." },
        ],
      },
      rsvp: { prompt: "Will you be attending?" },
    },
  },
];

export const TEMPLATE_PREVIEWS: Record<string, TemplatePreviewSeed> = Object.fromEntries(
  BLUEPRINTS.map((bp) => [bp.templateName, { templateName: bp.templateName, event: buildEvent(bp), invitation: buildInvitation(bp) }]),
);

// The part of each template that carries over to a real event created
// from it (see createEvent in src/lib/events-store.tsx): its look (palette,
// fonts, button shape, page layout, cover and section styles) and which
// sections it turns on. The sample *content*
// above deliberately does not carry over — its names, dates and stories
// are made up, and an organizer who published without replacing them would
// be sending guests someone else's details. The two copy lines below are
// generic enough to be safe starting text.
export interface TemplateDesign {
  theme: InvitationTheme;
  coverStyle: CoverStyle;
  sectionStyles: Partial<Record<InvitationSectionType, string>>;
  enabledSections: InvitationSectionType[];
  storyHeading?: string;
  rsvpPrompt?: string;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export const TEMPLATE_DESIGNS: Record<string, TemplateDesign> = Object.fromEntries(
  BLUEPRINTS.map((bp) => [
    bp.templateName,
    {
      theme: themeOf(bp),
      coverStyle: bp.coverStyle,
      sectionStyles: bp.sectionStyles ?? {},
      enabledSections: SECTION_ORDER.filter((type) => type in bp.content),
      storyHeading: optionalString(bp.content.story?.heading),
      rsvpPrompt: optionalString(bp.content.rsvp?.prompt),
    },
  ]),
);
