// POST { paymentId } → { status: "pending" | "paid" | "expired" | "failed", eventId }
//
// Called by the app's /payment/return page. The webhook is the primary
// way a payment gets applied, but it can lag (or not be set up yet in a
// new environment), so this asks PayMongo directly about the checkout
// session and applies it the same way — mark_payment_paid is idempotent,
// so whichever of the two arrives second is a no-op. Only the payment's
// own user can confirm it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import { paidPaymentFromSession, retrieveCheckoutSession } from "../_shared/paymongo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Please sign in again." }, 401);

    const { paymentId } = await req.json().catch(() => ({}));
    if (typeof paymentId !== "string") return json({ error: "Missing payment." }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: payment } = await admin
      .from("payments")
      .select("id, status, event_id, checkout_session_id")
      .eq("id", paymentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!payment) return json({ error: "Payment not found." }, 404);
    if (payment.status !== "pending" || !payment.checkout_session_id || !PAYMONGO_SECRET_KEY) {
      return json({ status: payment.status, eventId: payment.event_id });
    }

    const session = await retrieveCheckoutSession(PAYMONGO_SECRET_KEY, payment.checkout_session_id);
    const paid = paidPaymentFromSession(session);
    if (paid) {
      const { error } = await admin.rpc("mark_payment_paid", {
        p_payment_id: payment.id,
        p_amount_centavos: paid.amountCentavos,
        p_provider_payment_id: paid.providerPaymentId,
        p_payment_method: paid.paymentMethod,
      });
      if (error) throw error;
      return json({ status: "paid", eventId: payment.event_id });
    }
    if (session?.attributes?.status === "expired") {
      await admin.from("payments").update({ status: "expired" }).eq("id", payment.id).eq("status", "pending");
      return json({ status: "expired", eventId: payment.event_id });
    }
    return json({ status: "pending", eventId: payment.event_id });
  } catch (err) {
    console.error("confirm-checkout failed:", err);
    return json({ error: "Couldn't check the payment. Please try again." }, 500);
  }
});
