// Database tests: runs Invyta's SQL in real Postgres (PGlite, in-process —
// no database server needed) with small stubs for the Supabase-provided
// pieces (auth schema, roles, storage), via two install paths:
//
//   1. Fresh install — supabase/schema.sql
//   2. Existing project — the original schema (fixtures/schema-before-
//      patches.sql, as it was before any patch existed) + every patch in
//      PATCH_ORDER, which must match the order documented in the README.
//
// Then exercises the rules that protect money, plan limits and privacy.
// Run: pnpm test:sql
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { adminChecks } from "./checks/admin.mjs";
import { testimonialChecks } from "./checks/testimonials.mjs";
import { adminPremiumChecks } from "./checks/admin-premium.mjs";
import { customLinkChecks } from "./checks/custom-links.mjs";
import { videoChecks } from "./checks/video.mjs";
import { rsvpProtectionChecks } from "./checks/rsvp-protection.mjs";
import { guestToolsChecks } from "./checks/guest-tools.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const read = (p) => readFileSync(here(p), "utf8");

// The order an existing project applies the patches in (README → "Getting
// started"). A new patch file must be added here, or the check below fails.
const PATCH_ORDER = [
  "add-free-plan-limits",
  "update-premium-templates",
  "add-gallery-styles",
  "add-account-deletion",
  "add-page-layouts",
  "add-section-styles",
  "add-payments",
  "add-admin",
  "add-testimonials",
  "add-admin-premium",
  "add-custom-links",
  "add-video",
  "add-rsvp-protection",
  "add-guest-tools",
  "add-background-music",
  "add-priority-support",
];

const STUBS = `
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  -- As in Supabase: API roles may call auth.uid()/auth.role().
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
`;

let failures = 0;
let passes = 0;
function check(label, ok, extra = "") {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${extra ? "  — " + extra : ""}`);
}
async function expectError(db, label, sql, match) {
  try {
    await db.exec(sql);
    check(label, false, "expected an error, got none");
  } catch (e) {
    check(label, !match || e.message.includes(match), e.message);
  }
}

async function asUser(db, uid) {
  await db.exec(`select set_config('request.jwt.claim.role', 'authenticated', false), set_config('request.jwt.claim.sub', '${uid}', false)`);
}
async function asServer(db) {
  await db.exec(`select set_config('request.jwt.claim.role', 'service_role', false), set_config('request.jwt.claim.sub', '', false)`);
}
const one = async (db, sql) => (await db.query(sql)).rows[0];

// Patches from before the baseline — already folded into
// fixtures/schema-before-patches.sql, so not re-applied.
const PRE_BASELINE = [
  "add-checkin",
  "add-gallery-limits",
  "add-guest-management",
  "add-image-upload",
  "add-invitation-column",
  "add-owner-plan",
  "add-personalized-links",
  "fix-rsvp-policy",
];

// Every other patch file in supabase/ must have a place in PATCH_ORDER.
{
  console.log("=== Patch order ===");
  const files = readdirSync(here("../../supabase"))
    .filter((f) => f.endsWith(".sql") && f !== "schema.sql")
    .map((f) => f.replace(/\.sql$/, ""))
    .filter((f) => !PRE_BASELINE.includes(f));
  const missing = files.filter((f) => !PATCH_ORDER.includes(f));
  check("every patch file is in PATCH_ORDER", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : `${PATCH_ORDER.length} patches`);
}

async function scenario(name, setup) {
  console.log(`\n=== ${name} ===`);
  const db = new PGlite();
  await db.exec(STUBS);
  try {
    await setup(db);
    check("SQL installs without errors", true);
  } catch (e) {
    check("SQL installs without errors", false, e.message);
    return;
  }

  const { id: uid } = await one(db, `insert into auth.users (raw_user_meta_data) values ('{"name":"Test"}') returning id`);
  check("profile auto-created for new user", !!(await one(db, `select 1 as x from public.profiles where id = '${uid}'`)));

  await asUser(db, uid);
  await expectError(db, "user cannot change own profiles.plan (column grant)", `set role authenticated; update public.profiles set plan = 'pro' where id = '${uid}'; reset role;`, "permission denied");
  await db.exec("reset role");

  const ev = await one(db, `insert into public.events (owner_id, name, category, slug, plan) values ('${uid}', 'Elena & Marco', 'wedding', 'em-1', 'pro') returning id, plan, owner_plan`);
  check("new event forced to Free even if client sends plan='pro'", ev.plan === "free" && ev.owner_plan === "free", `plan=${ev.plan} owner_plan=${ev.owner_plan}`);

  await db.exec(`update public.events set plan = 'pro', owner_plan = 'pro' where id = '${ev.id}'`);
  const tampered = await one(db, `select plan, owner_plan from public.events where id = '${ev.id}'`);
  check("owner cannot self-upgrade event plan / owner_plan", tampered.plan === "free" && tampered.owner_plan === "free", JSON.stringify(tampered));

  await expectError(db, "Premium template blocked on Free event", `update public.events set template_id = 'golden-hour' where id = '${ev.id}'`, "Premium templates");
  await expectError(db, "Premium layout blocked on Free event", `update public.events set invitation = '{"theme":{"layout":"story"},"sections":[]}' where id = '${ev.id}'`, "Premium");
  await expectError(db, "Premium section style blocked on Free event", `update public.events set invitation = '{"theme":{},"sections":[{"type":"venue","content":{"style":"map"}}]}' where id = '${ev.id}'`, "Premium");

  for (let i = 0; i < 50; i++) await db.exec(`insert into public.guests (event_id, name) values ('${ev.id}', 'Guest ${i}')`);
  await expectError(db, "51st guest blocked on Free event", `insert into public.guests (event_id, name) values ('${ev.id}', 'One too many')`, "guest limit");
  await expectError(db, "check-in blocked on Free event", `update public.guests set checked_in = true where event_id = '${ev.id}' and name = 'Guest 0'`, "check-in");

  // ── payment ──
  await asServer(db);
  const pay = await one(db, `insert into public.payments (user_id, event_id, plan, amount_centavos, description) values ('${uid}', '${ev.id}', 'premium', 19900, 'Premium — Elena & Marco') returning id`);
  await expectError(db, "mark_payment_paid rejects wrong amount", `select public.mark_payment_paid('${pay.id}', 100, 'pay_x', 'gcash')`, "does not match");
  let p = await one(db, `select status from public.payments where id = '${pay.id}'`);
  check("payment still pending after rejected amount", p.status === "pending");
  await db.exec(`select public.mark_payment_paid('${pay.id}', 19900, 'pay_x', 'gcash')`);
  p = await one(db, `select status, payment_method, paid_at is not null as has_paid_at from public.payments where id = '${pay.id}'`);
  const up = await one(db, `select plan, owner_plan from public.events where id = '${ev.id}'`);
  check("payment marked paid", p.status === "paid" && p.payment_method === "gcash" && p.has_paid_at);
  check("event upgraded to Premium by payment", up.plan === "premium" && up.owner_plan === "premium", JSON.stringify(up));
  await db.exec(`select public.mark_payment_paid('${pay.id}', 19900, 'pay_x', 'gcash')`);
  check("second mark_payment_paid is a no-op (idempotent)", (await one(db, `select count(*)::int as n from public.payments where status = 'paid'`)).n === 1);

  await asUser(db, uid);
  await db.exec(`insert into public.guests (event_id, name) values ('${ev.id}', 'Guest 51')`);
  check("51st guest allowed once event is Premium", true);
  await db.exec(`update public.guests set checked_in = true where event_id = '${ev.id}' and name = 'Guest 0'`);
  check("check-in allowed once event is Premium", true);
  await db.exec(`update public.events set invitation = '{"theme":{"layout":"story"},"sections":[{"type":"venue","content":{"style":"map"}}]}', template_id = 'golden-hour' where id = '${ev.id}'`);
  check("Premium design + template allowed once event is Premium", true);

  const ev2 = await one(db, `insert into public.events (owner_id, name, category, slug) values ('${uid}', 'Mia 7th', 'birthday', 'mia-1') returning id, owner_plan`);
  check("other events of the same user stay Free", ev2.owner_plan === "free");

  // ── downgrade protection + account-level plan ──
  await asServer(db);
  const pay2 = await one(db, `insert into public.payments (user_id, event_id, plan, amount_centavos, description) values ('${uid}', '${ev.id}', 'pro', 30000, 'Pro upgrade') returning id`);
  await db.exec(`select public.mark_payment_paid('${pay2.id}', 30000, 'pay_y', 'card')`);
  check("Premium → Pro upgrade applied", (await one(db, `select plan from public.events where id = '${ev.id}'`)).plan === "pro");
  const pay3 = await one(db, `insert into public.payments (user_id, event_id, plan, amount_centavos, description) values ('${uid}', '${ev.id}', 'premium', 19900, 'late premium') returning id`);
  await db.exec(`select public.mark_payment_paid('${pay3.id}', 19900, 'pay_z', 'gcash')`);
  check("a later Premium payment never downgrades a Pro event", (await one(db, `select plan from public.events where id = '${ev.id}'`)).plan === "pro");

  await db.exec(`update public.profiles set plan = 'event_planner' where id = '${uid}'`);
  const planner = await one(db, `select owner_plan from public.events where id = '${ev2.id}'`);
  check("account-level plan lifts every event (effective = max)", planner.owner_plan === "event_planner", planner.owner_plan);

  await adminChecks(db, { one, check, expectError, asUser, asServer });
  await testimonialChecks(db, { one, check, asUser, asServer });
  await adminPremiumChecks(db, { one, check, asUser, asServer });
  await customLinkChecks(db, { one, check, asUser, asServer });
  await videoChecks(db, { one, check, expectError, asUser, asServer });
  await rsvpProtectionChecks(db, { one, check, asUser, asServer });
  await guestToolsChecks(db, { one, check, expectError, asUser, asServer });

  // ── retention on deletion ──
  await db.exec(`delete from auth.users where id = '${uid}'`);
  const kept = await one(db, `select count(*)::int as n, count(user_id)::int as with_user from public.payments`);
  check("payments survive account deletion with user_id nulled", kept.n === 3 && kept.with_user === 0, JSON.stringify(kept));
}

await scenario("Fresh install (schema.sql)", (db) => db.exec(read("../../supabase/schema.sql")));

await scenario("Existing project (original schema + every patch in order)", async (db) => {
  await db.exec(read("fixtures/schema-before-patches.sql"));
  for (const patch of PATCH_ORDER) {
    try {
      await db.exec(read(`../../supabase/${patch}.sql`));
    } catch (e) {
      throw new Error(`${patch}.sql: ${e.message}`);
    }
  }
});

console.log(failures === 0 ? `\nALL ${passes} SQL CHECKS PASS` : `\n${failures} FAILURE(S), ${passes} passed`);
process.exitCode = failures === 0 ? 0 : 1;
