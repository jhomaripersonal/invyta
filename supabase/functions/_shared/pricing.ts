// Server-side prices — the only ones that count. The client never sends an
// amount; it asks for a plan, and create-checkout prices it here. Mirrored
// for display by src/data/pricing.ts — keep the two in sync.

export type PaidPlan = "premium" | "pro";

// Price of each plan for one event, in centavos (₱1 = 100).
const PLAN_PRICE_CENTAVOS: Record<string, number> = {
  free: 0,
  premium: 19900,
  pro: 49900,
};

const RANK = ["free", "premium", "pro", "event_planner"];

export function isPaidPlan(plan: unknown): plan is PaidPlan {
  return plan === "premium" || plan === "pro";
}

export function planAtLeast(plan: string, min: string): boolean {
  return RANK.indexOf(plan) >= RANK.indexOf(min);
}

// Upgrading an event that already has a paid plan costs only the
// difference (Premium → Pro = ₱300).
export function upgradePriceCentavos(purchasedPlan: string, target: PaidPlan): number {
  const already = PLAN_PRICE_CENTAVOS[purchasedPlan] ?? 0;
  return Math.max(0, PLAN_PRICE_CENTAVOS[target] - already);
}

export const PLAN_NAMES: Record<PaidPlan, string> = { premium: "Premium", pro: "Pro" };
