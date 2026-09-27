// PayMongo helpers + pricing shared by the Edge Functions
// (supabase/functions/_shared). Imports the TypeScript sources directly —
// Node 22 strips the types. Run: pnpm test:functions
import { createHmac } from "node:crypto";
import { verifyWebhookSignature, paidPaymentFromSession } from "../../supabase/functions/_shared/paymongo.ts";
import { upgradePriceCentavos, planAtLeast, isPaidPlan } from "../../supabase/functions/_shared/pricing.ts";
import { upgradePriceCentavos as displayPrice } from "../../src/data/pricing.ts";

let failures = 0;
let passes = 0;
const check = (label, ok, extra = "") => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${extra ? "  — " + extra : ""}`);
};

console.log("=== Webhook signature ===");
const secret = "whsk_test_abc123";
const session = {
  id: "cs_123",
  type: "checkout_session",
  attributes: {
    reference_number: "pay-uuid",
    status: "active",
    metadata: { payment_id: "pay-uuid", event_id: "ev-uuid", plan: "premium" },
    payments: [{ id: "pay_pm_1", type: "payment", attributes: { amount: 19900, currency: "PHP", status: "paid", source: { type: "gcash" } } }],
  },
};
const sign = (body, ts, key = secret) => createHmac("sha256", key).update(`${ts}.${body}`).digest("hex");
const testBody = JSON.stringify({ data: { id: "evt_1", attributes: { type: "checkout_session.payment.paid", livemode: false, data: session } } });
const ts = "1727260000";
check("valid test-mode signature accepted", await verifyWebhookSignature(`t=${ts},te=${sign(testBody, ts)},li=`, testBody, secret));
check("tampered body rejected", !(await verifyWebhookSignature(`t=${ts},te=${sign(testBody, ts)},li=`, testBody.replace("19900", "100"), secret)));
check("wrong secret rejected", !(await verifyWebhookSignature(`t=${ts},te=${sign(testBody, ts, "whsk_other")},li=`, testBody, secret)));
check("missing header rejected", !(await verifyWebhookSignature(null, testBody, secret)));
check("missing secret rejected", !(await verifyWebhookSignature(`t=${ts},te=${sign(testBody, ts)},li=`, testBody, "")));
check("test-mode event with only a live signature rejected", !(await verifyWebhookSignature(`t=${ts},te=,li=${sign(testBody, ts)}`, testBody, secret)));
const liveBody = testBody.replace('"livemode":false', '"livemode":true');
check("live-mode event checked against li", await verifyWebhookSignature(`t=${ts},te=,li=${sign(liveBody, ts)}`, liveBody, secret));
check("live-mode event with only te rejected", !(await verifyWebhookSignature(`t=${ts},te=${sign(liveBody, ts)},li=`, liveBody, secret)));
check("non-JSON body rejected", !(await verifyWebhookSignature(`t=${ts},te=${sign("nope", ts)},li=`, "nope", secret)));

console.log("\n=== Checkout session parsing ===");
const paid = paidPaymentFromSession(session);
check("paid payment extracted", paid && paid.amountCentavos === 19900 && paid.providerPaymentId === "pay_pm_1" && paid.paymentMethod === "gcash", JSON.stringify(paid));
check("unpaid session → null", paidPaymentFromSession({ attributes: { payments: [{ id: "p", attributes: { status: "failed", amount: 1 } }] } }) === null);
check("session without payments → null", paidPaymentFromSession({ attributes: {} }) === null);

console.log("\n=== Pricing ===");
check("Free → Premium = ₱199", upgradePriceCentavos("free", "premium") === 19900);
check("Free → Pro = ₱499", upgradePriceCentavos("free", "pro") === 49900);
check("Premium → Pro = ₱300 difference", upgradePriceCentavos("premium", "pro") === 30000);
check("Pro → Premium never negative", upgradePriceCentavos("pro", "premium") === 0);
check("plan ranking", planAtLeast("pro", "premium") && !planAtLeast("free", "premium") && planAtLeast("event_planner", "pro"));
check("isPaidPlan rejects free/event_planner/junk", !isPaidPlan("free") && !isPaidPlan("event_planner") && !isPaidPlan(undefined) && isPaidPlan("pro"));
// The app shows prices from src/data/pricing.ts; the server charges from
// _shared/pricing.ts. They must never disagree.
const pairs = [["free", "premium"], ["free", "pro"], ["premium", "pro"], ["pro", "premium"]];
check("displayed prices match what the server charges", pairs.every(([from, to]) => displayPrice(from, to) === upgradePriceCentavos(from, to)));

console.log(failures === 0 ? `\nALL ${passes} PAYMENT CHECKS PASS` : `\n${failures} FAILURE(S), ${passes} passed`);
process.exitCode = failures === 0 ? 0 : 1;
