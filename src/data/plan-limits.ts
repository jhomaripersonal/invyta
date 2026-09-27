import type { PlanTier } from "../types/models";

// Plan rules shared by every screen that gates a feature. Each one is
// mirrored server-side in supabase/schema.sql (gallery_photo_limit,
// guest_limit, plan_at_least, template_is_premium,
// gallery_style_is_premium, design_style_is_premium) — keep the two in sync.

const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  premium: 1,
  pro: 2,
  event_planner: 3,
};

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  premium: "Premium",
  pro: "Pro",
  event_planner: "Event Planner",
};

export function planLabel(plan: PlanTier | undefined): string {
  return PLAN_LABELS[plan ?? "free"];
}

// Max photos in an invitation's Gallery section, per plan. `null` means
// unlimited.
export const GALLERY_PHOTO_LIMITS: Record<PlanTier, number | null> = {
  free: 10,
  premium: 30,
  pro: null,
  event_planner: null,
};

export function galleryPhotoLimit(plan: PlanTier | undefined): number | null {
  return GALLERY_PHOTO_LIMITS[plan ?? "free"];
}

// Max guest-list entries per event (organizer-added guests and public RSVP
// submissions alike — one row each, plus-ones don't count separately).
// `null` means unlimited.
export const GUEST_LIMITS: Record<PlanTier, number | null> = {
  free: 50,
  premium: null,
  pro: null,
  event_planner: null,
};

export function guestLimit(plan: PlanTier | undefined): number | null {
  return GUEST_LIMITS[plan ?? "free"];
}

// Lowest plan that unlocks each gated feature, matching the pricing tables
// on the landing page and in Billing.
export type PlanFeature = "premium_templates" | "gallery_styles" | "page_layouts" | "custom_url" | "analytics" | "checkin" | "personalized_links" | "video" | "guest_tools" | "music";

const FEATURE_MIN_PLAN: Record<PlanFeature, PlanTier> = {
  premium_templates: "premium",
  // Premium gallery layouts and photo filters (see src/data/gallery-styles.ts).
  gallery_styles: "premium",
  // Premium page layouts and cover styles (see src/data/page-layouts.ts).
  page_layouts: "premium",
  // Choosing the invitation's own link (see supabase/add-custom-links.sql).
  custom_url: "premium",
  analytics: "premium",
  checkin: "premium",
  personalized_links: "pro",
  // The Video section (supabase/add-video.sql enforces it server-side).
  video: "pro",
  // Advanced guest tools: custom RSVP questions, per-guest party-size
  // limits and bulk actions on the guest list (supabase/add-guest-tools.sql).
  guest_tools: "pro",
  // Background music (supabase/add-background-music.sql).
  music: "pro",
};

// The plan that applies across a user's whole account: their account plan,
// lifted to at least Pro for admins (who get every feature — mirrored by
// effective_plan() in supabase/schema.sql). Events have their own
// effective plan (EventRecord.ownerPlan), which already includes this.
export function accountPlan(user: { plan: PlanTier; isAdmin?: boolean } | null | undefined): PlanTier {
  const plan = user?.plan ?? "free";
  return user?.isAdmin && PLAN_RANK[plan] < PLAN_RANK.pro ? "pro" : plan;
}

export function planAllows(plan: PlanTier | undefined, feature: PlanFeature): boolean {
  return PLAN_RANK[plan ?? "free"] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
}

export function requiredPlanLabel(feature: PlanFeature): string {
  return PLAN_LABELS[FEATURE_MIN_PLAN[feature]];
}
