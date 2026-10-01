// Domain contracts mirroring the DB architecture in the product spec (§33).
// Frontend-only for now — these are the shapes the future API is expected to return.

export type PlanTier = "free" | "premium" | "pro" | "event_planner";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  plan: PlanTier;
  // Set only from the SQL editor (see supabase/add-admin.sql). Shows the
  // Admin link; every admin query is re-checked server-side by is_admin().
  isAdmin: boolean;
  createdAt: string;
}

export type EventCategory =
  | "wedding"
  | "birthday"
  | "debut"
  | "baptism"
  | "anniversary"
  | "engagement"
  | "baby_shower"
  | "bridal_shower"
  | "house_blessing"
  | "graduation"
  | "recognition"
  | "school_reunion"
  | "class_reunion"
  | "company_party"
  | "team_building"
  | "seminar"
  | "conference"
  | "product_launch"
  | "christmas_party"
  | "barangay_event"
  | "fundraiser"
  | "charity_event"
  | "organization_gathering"
  | "wake"
  | "memorial_gathering"
  | "celebration_of_life";

export type EventStatus = "draft" | "published" | "unpublished" | "expired" | "archived";

export interface EventEntity {
  id: string;
  ownerId: string;
  name: string;
  category: EventCategory;
  host: string;
  date: string;
  time: string;
  venueName: string;
  venueAddress: string;
  description?: string;
  dressCode?: string;
  contactDetails?: string;
  status: EventStatus;
  templateId?: string;
  slug: string;
  customSlug?: string;
  passwordProtected: boolean;
  rsvpOpen: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TemplateCategory =
  | "wedding"
  | "birthday"
  | "debut"
  | "baptism"
  | "graduation"
  | "corporate"
  | "minimal"
  | "luxury"
  | "floral"
  | "modern"
  | "traditional_filipino"
  | "kids";

export interface EventTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  previewImageUrl: string;
  isPremium: boolean;
}

export type InvitationSectionType =
  | "cover"
  | "details"
  | "story"
  | "schedule"
  | "venue"
  | "gallery"
  | "video"
  | "dress_code"
  | "entourage"
  | "gift_registry"
  | "faq"
  | "countdown"
  | "rsvp";

export interface InvitationSection {
  type: InvitationSectionType;
  enabled: boolean;
  order: number;
  content: Record<string, unknown>;
}

export type ButtonStyle = "rounded" | "square" | "outline";

// Overall page structure (see src/data/page-layouts.ts). Optional so
// invitations saved before layouts existed keep rendering as "classic".
export type PageLayout = "classic" | "stationery" | "story" | "editorial" | "split";

export interface InvitationTheme {
  // A COLOR_PALETTES id, or "custom" to build one from `customPalette`.
  paletteId: string;
  customPalette?: { primary: string; accent?: string; dark: boolean };
  fontPairingId: string;
  buttonStyle: ButtonStyle;
  layout?: PageLayout;
}

export interface InvitationConfig {
  sections: InvitationSection[];
  theme: InvitationTheme;
  // Background music (Pro): an uploaded audio file guests can play.
  music?: { url: string; title?: string };
}

export type GuestGroup =
  | "family"
  | "friends"
  | "work"
  | "school"
  | "vip"
  | "brides_family"
  | "grooms_family"
  | "other";

export type RsvpStatus = "confirmed" | "pending" | "declined";

export interface Guest {
  id: string;
  eventId: string;
  name: string;
  email?: string;
  phone?: string;
  group: GuestGroup;
  invitationToken: string;
  rsvpStatus: RsvpStatus;
  numberOfGuests: number;
  checkedIn: boolean;
  checkedInAt?: string;
  notes?: string;
}

export interface Rsvp {
  id: string;
  guestId: string;
  eventId: string;
  attending: boolean;
  numberOfGuests: number;
  mealPreference?: string;
  contactInfo?: string;
  message?: string;
  childrenAttending?: number;
  dietaryRestrictions?: string;
  transportationNeeded?: boolean;
  accommodationNeeded?: boolean;
  specialRequests?: string;
  submittedAt: string;
}

export interface EventSchedule {
  id: string;
  eventId: string;
  time: string;
  title: string;
  description?: string;
  order: number;
}

export interface EventVenue {
  id: string;
  eventId: string;
  name: string;
  address: string;
  mapUrl?: string;
  directionsUrl?: string;
}

export interface EventPhoto {
  id: string;
  eventId: string;
  url: string;
  caption?: string;
  uploadedBy: "organizer" | "guest";
  order: number;
}

export interface EventCheckin {
  id: string;
  eventId: string;
  guestId: string;
  checkedInAt: string;
  checkedInBy: string;
}

export interface EventAnalytics {
  eventId: string;
  views: number;
  uniqueVisitors: number;
  rsvpConversionRate: number;
  linkClicks: number;
  qrScans: number;
  checkins: number;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: PlanTier;
  eventId?: string;
  startedAt: string;
  expiresAt?: string;
  status: "active" | "canceled" | "expired";
}

// One checkout attempt to upgrade an event (the `payments` table —
// written only by the payment Edge Functions, readable by its owner).
export interface Payment {
  id: string;
  eventId?: string;
  plan: "premium" | "pro";
  amountCentavos: number;
  currency: "PHP";
  description: string;
  status: "pending" | "paid" | "expired" | "failed";
  // "promo" = a free upgrade from a promo code (amount 0).
  provider: "paymongo" | "promo";
  // e.g. "gcash", "paymaya", "card" — as reported by PayMongo; "promo" for promo codes.
  paymentMethod?: string;
  paidAt?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: "rsvp_received" | "rsvp_changed" | "rsvp_canceled" | "guest_message" | "reminder";
  message: string;
  read: boolean;
  createdAt: string;
}
