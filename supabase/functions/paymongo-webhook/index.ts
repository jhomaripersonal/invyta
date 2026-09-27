// PayMongo → POST webhook. Deploy with --no-verify-jwt: PayMongo can't
// send a Supabase JWT; the Paymongo-Signature header (verified against
// the raw body with PAYMONGO_WEBHOOK_SECRET) is what authenticates it.
//
// Handles checkout_session.payment.paid by applying the payment through
// mark_payment_paid (idempotent, amount-checked, upgrades the event in the
// same transaction). Responds 2xx for anything that retrying can't fix
// (other event types, unknown payments, amount mismatches — those are
// logged), and 5xx for transient failures so PayMongo retries.
//
// Register it in PayMongo for the "checkout_session.payment.paid" event at
// https://<project-ref>.supabase.co/functions/v1/paymongo-webhook
import { createClient } from "npm:@supabase/supabase-js@2";
import { paidPaymentFromSession, verifyWebhookSignature } from "../_shared/paymongo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PAYMONGO_WEBHOOK_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  if (!(await verifyWebhookSignature(req.headers.get("Paymongo-Signature"), rawBody, WEBHOOK_SECRET))) {
    console.warn("paymongo-webhook: invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const type = event?.data?.attributes?.type;
  if (type !== "checkout_session.payment.paid") return new Response("ignored", { status: 200 });

  const session = event.data.attributes.data;
  const paymentId = session?.attributes?.metadata?.payment_id ?? session?.attributes?.reference_number;
  const paid = paidPaymentFromSession(session);
  if (!paymentId || !paid) {
    console.warn("paymongo-webhook: paid event without a payment id or paid payment", session?.id);
    return new Response("ok", { status: 200 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await admin.rpc("mark_payment_paid", {
    p_payment_id: paymentId,
    p_amount_centavos: paid.amountCentavos,
    p_provider_payment_id: paid.providerPaymentId,
    p_payment_method: paid.paymentMethod,
  });
  if (error) {
    const permanent = /does not match|Unknown payment|invalid input syntax/i.test(error.message);
    console.error(`paymongo-webhook: mark_payment_paid failed (${permanent ? "not retrying" : "will retry"}):`, error.message);
    return new Response(permanent ? "ok" : "retry", { status: permanent ? 200 : 500 });
  }
  return new Response("ok", { status: 200 });
});
