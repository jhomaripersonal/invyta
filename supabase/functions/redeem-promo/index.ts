// POST { eventId, code } → { plan } | { error }
//
// Redeems a single-use promo code to upgrade ONE event for free. Called
// from the app with the signed-in user's JWT (Supabase verifies it before
// this runs). Who the user is comes from that JWT, never from the body;
// everything else (code still valid, locked to this email, one code per
// account, event belongs to the user) is checked and applied atomically
// by redeem_promo_code() — see supabase/add-promo-codes.sql.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import { PLAN_NAMES, isPaidPlan } from "../_shared/pricing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REFUSALS: Record<string, [string, number]> = {
  invalid: ["That promo code isn't valid.", 404],
  used: ["That promo code has already been used.", 409],
  expired: ["That promo code has expired.", 410],
  not_yours: ["That promo code belongs to a different account.", 403],
  already_redeemed: ["Your account has already used a promo code.", 409],
  event_not_found: ["Event not found.", 404],
  already_has_plan: ["This event already has everything this code unlocks.", 409],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Please sign in again." }, 401);

    const { eventId, code } = await req.json().catch(() => ({}));
    if (typeof eventId !== "string" || typeof code !== "string" || !code.trim()) return json({ error: "Enter a promo code." }, 400);
    if (code.length > 64) return json({ error: REFUSALS.invalid[0] }, 404);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await admin.rpc("redeem_promo_code", {
      p_code: code,
      p_user_id: user.id,
      p_user_email: user.email ?? "",
      p_event_id: eventId,
    });
    if (error) throw error;

    const status: unknown = data?.status;
    const plan: unknown = data?.plan;
    if (status === "ok" && isPaidPlan(plan)) return json({ plan, planName: PLAN_NAMES[plan] });
    const [message, httpStatus] = REFUSALS[typeof status === "string" ? status : ""] ?? ["Couldn't apply the promo code. Please try again.", 500];
    return json({ error: message }, httpStatus);
  } catch (err) {
    console.error("redeem-promo failed:", err);
    return json({ error: "Couldn't apply the promo code. Please try again." }, 500);
  }
});
