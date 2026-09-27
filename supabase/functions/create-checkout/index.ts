// POST { eventId, plan: "premium" | "pro" } → { checkoutUrl, paymentId }
//
// Starts a PayMongo hosted checkout to upgrade ONE event. Called from the
// app with the signed-in user's JWT (Supabase verifies it before this
// runs). The price is decided here, never by the client: the event is
// read through the user's own RLS-scoped client (so they must own it),
// priced by upgradePriceCentavos, recorded as a pending payment with the
// service role, and only then sent to PayMongo.
//
// Env: PAYMONGO_SECRET_KEY, APP_URL (e.g. https://invyta.app — where
// PayMongo sends the guest back), optional PAYMONGO_PAYMENT_METHODS
// (comma-separated, default "gcash,paymaya,card"; only list methods
// activated on your PayMongo account). SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import { PLAN_NAMES, isPaidPlan, planAtLeast, upgradePriceCentavos } from "../_shared/pricing.ts";
import { createCheckoutSession } from "../_shared/paymongo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
const PAYMENT_METHODS = (Deno.env.get("PAYMONGO_PAYMENT_METHODS") ?? "gcash,paymaya,card").split(",").map((m) => m.trim()).filter(Boolean);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!PAYMONGO_SECRET_KEY || !APP_URL) {
    console.error("create-checkout: PAYMONGO_SECRET_KEY or APP_URL is not set");
    return json({ error: "Payments aren't configured yet." }, 503);
  }

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Please sign in again." }, 401);

    const { eventId, plan } = await req.json().catch(() => ({}));
    if (typeof eventId !== "string" || !isPaidPlan(plan)) return json({ error: "Choose a plan to upgrade to." }, 400);

    // RLS + the explicit owner filter mean this only finds the caller's own event.
    const { data: event } = await userClient
      .from("events")
      .select("id, name, plan, owner_plan")
      .eq("id", eventId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!event) return json({ error: "Event not found." }, 404);
    if (planAtLeast(event.owner_plan, plan)) return json({ error: `This event already has ${PLAN_NAMES[plan]}.` }, 409);

    const amount = upgradePriceCentavos(event.plan, plan);
    const description = `Invyta ${PLAN_NAMES[plan]} — ${event.name}`;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: payment, error: insertError } = await admin
      .from("payments")
      .insert({ user_id: user.id, event_id: event.id, plan, amount_centavos: amount, description })
      .select("id")
      .single();
    if (insertError || !payment) throw insertError ?? new Error("Couldn't record the payment.");

    const session = await createCheckoutSession(PAYMONGO_SECRET_KEY, {
      amountCentavos: amount,
      name: `${PLAN_NAMES[plan]} plan — ${event.name}`,
      description,
      paymentMethodTypes: PAYMENT_METHODS,
      successUrl: `${APP_URL}/payment/return?payment=${payment.id}`,
      cancelUrl: `${APP_URL}/payment/return?payment=${payment.id}&cancelled=1`,
      referenceNumber: payment.id,
      metadata: { payment_id: payment.id, event_id: event.id, plan },
    });

    await admin.from("payments").update({ checkout_session_id: session.id }).eq("id", payment.id);
    return json({ checkoutUrl: session.checkoutUrl, paymentId: payment.id });
  } catch (err) {
    console.error("create-checkout failed:", err);
    return json({ error: "Couldn't start checkout. Please try again." }, 500);
  }
});
