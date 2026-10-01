import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase-client";
import type { Payment } from "../types/models";
import type { PaidPlan } from "../data/pricing";

// Client side of per-event upgrades. The browser never sees the PayMongo
// secret or decides a price: it asks the create-checkout Edge Function to
// start a checkout for an event + plan, then follows the returned URL to
// PayMongo's hosted page. See supabase/functions/.

// Edge Function errors come back as an HTTP response; surface the
// function's own { error } message instead of a generic one.
async function functionError(error: unknown, fallback: string): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    if (body?.error) return new Error(body.error);
  }
  return new Error(fallback);
}

export async function startEventUpgrade(eventId: string, plan: PaidPlan): Promise<void> {
  const { data, error } = await supabase.functions.invoke("create-checkout", { body: { eventId, plan } });
  if (error || !data?.checkoutUrl) throw await functionError(error, "Couldn't start checkout. Please try again.");
  window.location.assign(data.checkoutUrl);
}

// Applies a single-use promo code to one event (redeem-promo Edge
// Function). The server checks the code and applies the upgrade; on
// success the caller should refresh events to pick up the new plan.
export async function redeemPromoCode(eventId: string, code: string): Promise<PaidPlan> {
  const { data, error } = await supabase.functions.invoke("redeem-promo", { body: { eventId, code: code.trim() } });
  if (error || !data?.plan) throw await functionError(error, "Couldn't apply the promo code. Please try again.");
  return data.plan;
}

export type PaymentStatus = Payment["status"];

// Asks the server to check a payment with PayMongo (in case the webhook
// hasn't landed yet) and apply it if it's paid.
export async function confirmPayment(paymentId: string): Promise<{ status: PaymentStatus; eventId: string | null }> {
  const { data, error } = await supabase.functions.invoke("confirm-checkout", { body: { paymentId } });
  if (error || !data?.status) throw await functionError(error, "Couldn't check the payment.");
  return { status: data.status, eventId: data.eventId ?? null };
}

type PaymentRow = {
  id: string;
  event_id: string | null;
  plan: Payment["plan"];
  amount_centavos: number;
  currency: "PHP";
  description: string;
  status: PaymentStatus;
  provider: Payment["provider"];
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
};

// The signed-in organizer's own payments (RLS: "read own payments").
export async function listPayments(): Promise<Payment[]> {
  const { data, error } = await supabase.from("payments").select("*").order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as PaymentRow[]).map((r) => ({
    id: r.id,
    eventId: r.event_id ?? undefined,
    plan: r.plan,
    amountCentavos: r.amount_centavos,
    currency: r.currency,
    description: r.description,
    status: r.status,
    provider: r.provider,
    paymentMethod: r.payment_method ?? undefined,
    paidAt: r.paid_at ?? undefined,
    createdAt: r.created_at,
  }));
}

export function paymentMethodLabel(method?: string): string {
  if (!method) return "—";
  return { gcash: "GCash", paymaya: "Maya", card: "Card", grab_pay: "GrabPay", qrph: "QR Ph", promo: "Promo code" }[method] ?? method;
}
