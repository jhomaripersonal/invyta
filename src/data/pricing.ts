import type { PlanTier } from "../types/models";

// Display prices for per-event upgrades. The server decides what's
// actually charged (supabase/functions/_shared/pricing.ts) — keep the two
// in sync.

export type PaidPlan = "premium" | "pro";

// Paid upgrades are off until the PayMongo integration is finished: the
// upgrade dialog and Billing show "Coming soon" instead of checkout (promo
// credits still work). Set VITE_PAYMENTS_ENABLED=true (e.g. in .env.local,
// or in Vercel when going live) to turn checkout on.
export const PAYMENTS_ENABLED = import.meta.env.VITE_PAYMENTS_ENABLED === "true";

const PLAN_PRICE_CENTAVOS: Record<PlanTier, number> = { free: 0, premium: 19900, pro: 49900, event_planner: 0 };

// Upgrading an event that already has a paid plan costs only the difference.
export function upgradePriceCentavos(purchasedPlan: PlanTier, target: PaidPlan): number {
  return Math.max(0, PLAN_PRICE_CENTAVOS[target] - PLAN_PRICE_CENTAVOS[purchasedPlan]);
}

export function formatPeso(centavos: number): string {
  const pesos = centavos / 100;
  return `₱${pesos.toLocaleString("en-PH", { minimumFractionDigits: pesos % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

// What each plan includes — shown in the upgrade dialog and on Billing,
// matching the landing page's pricing section.
export const PLAN_FEATURES: Record<"free" | PaidPlan, string[]> = {
  free: ["Basic templates", "Basic RSVP", "Up to 50 guests", "Up to 10 gallery photos", "Standard URL", "Invyta branding"],
  premium: ["All premium templates & layouts", "Custom invitation link", "Unlimited guests", "Up to 30 gallery photos", "Analytics & QR check-in", "No Invyta branding"],
  pro: ["Everything in Premium", "Video section (YouTube, Vimeo, Facebook)", "Background music", "Unlimited gallery photos", "Personalized guest links", "Custom RSVP questions", "Party-size limits & bulk guest actions", "Priority support"],
};
