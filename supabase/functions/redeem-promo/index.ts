// POST { action: "redeem", code }    → { plan } | { error }
// POST { action: "use", eventId }    → { plan } | { error }
//
// Promo codes (test launch). "redeem" checks a code and gives the signed-in
// account one free credit for the code's plan; "use" spends that credit on
// one of the account's events. Called from the app with the user's JWT
// (Supabase verifies it before this runs). Who the user is comes from that
// JWT, never from the body; everything else is checked and applied
// atomically by redeem_promo_code() / use_promo_credit() — see
// supabase/add-promo-codes.sql.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import { PLAN_NAMES, isPaidPlan } from "../_shared/pricing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REFUSALS: Record<string, [string, number]> = {
  invalid: ["That promo code isn't valid.", 404],
  expired: ["That promo code has expired.", 410],
  full: ["Sorry — all the spots for this promo code have been claimed.", 409],
  already_redeemed: ["Your account has already used a promo code.", 409],
  no_credit: ["You don't have a promo credit to use.", 409],
  event_not_found: ["Event not found.", 404],
  already_has_plan: ["This event already has everything your promo credit unlocks.", 409],
};

const FAILED = "Couldn't apply the promo code. Please try again.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Please sign in again." }, 401);

    const { action, code, eventId } = await req.json().catch(() => ({}));
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let result;
    if (action === "redeem") {
      if (typeof code !== "string" || !code.trim()) return json({ error: "Enter a promo code." }, 400);
      if (code.length > 64) return json({ error: REFUSALS.invalid[0] }, 404);
      result = await admin.rpc("redeem_promo_code", { p_code: code, p_user_id: user.id });
    } else if (action === "use") {
      if (typeof eventId !== "string") return json({ error: "Choose an event." }, 400);
      result = await admin.rpc("use_promo_credit", { p_user_id: user.id, p_event_id: eventId });
    } else {
      return json({ error: "Unknown action." }, 400);
    }
    if (result.error) throw result.error;

    const status: unknown = result.data?.status;
    const plan: unknown = result.data?.plan;
    if (status === "ok" && isPaidPlan(plan)) return json({ plan, planName: PLAN_NAMES[plan] });
    const [message, httpStatus] = REFUSALS[typeof status === "string" ? status : ""] ?? [FAILED, 500];
    return json({ error: message }, httpStatus);
  } catch (err) {
    console.error("redeem-promo failed:", err);
    return json({ error: FAILED }, 500);
  }
});
