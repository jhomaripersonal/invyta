// Single-use promo codes — run inside each scenario of run.mjs.
export async function promoCodeChecks(db, { one, check, expectError, asUser, asServer }) {
  const { id: anna } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('anna@example.com', '{"name":"Anna"}') returning id`);
  const { id: ben } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('ben@example.com', '{"name":"Ben"}') returning id`);

  await asUser(db, anna);
  const ev = await one(db, `insert into public.events (owner_id, name, category, slug) values ('${anna}', 'Anna wedding', 'wedding', 'anna-1') returning id`);
  const ev2 = await one(db, `insert into public.events (owner_id, name, category, slug) values ('${anna}', 'Anna party', 'birthday', 'anna-2') returning id`);
  await asUser(db, ben);
  const benEv = await one(db, `insert into public.events (owner_id, name, category, slug) values ('${ben}', 'Ben party', 'birthday', 'ben-1') returning id`);

  await asServer(db);
  await db.exec(`insert into public.promo_codes (code, plan) values ('BETA-ONE', 'pro'), ('BETA-OLD', 'pro'), ('BETA-ANNA', 'premium'), ('BETA-OFF', 'pro')`);
  await db.exec(`update public.promo_codes set expires_at = now() - interval '1 day' where code = 'BETA-OLD'`);
  await db.exec(`update public.promo_codes set assigned_email = 'Anna@Example.com' where code = 'BETA-ANNA'`);
  await db.exec(`update public.promo_codes set active = false where code = 'BETA-OFF'`);
  await expectError(db, "codes must be stored uppercase", `insert into public.promo_codes (code, plan) values ('lower', 'pro')`, "check");

  // RLS with no policies: signed-in users see no codes (in Supabase,
  // authenticated has table grants, so this is an empty result rather than
  // an error).
  await db.exec("grant select on public.promo_codes to authenticated");
  await asUser(db, anna);
  const visible = await db.exec("set role authenticated; select code from public.promo_codes;").catch((e) => { console.log("    (read error: " + e.message + ")"); return null; });
  await db.exec("reset role");
  check("users can't list promo codes", visible === null || (Array.isArray(visible) ? visible.every((r) => r.rows.length === 0) : visible.rows.length === 0));
  await asServer(db);

  const redeem = async (code, uid, email, eventId) =>
    (await one(db, `select public.redeem_promo_code('${code}', '${uid}', '${email}', '${eventId}') as r`)).r.status;

  check("unknown code is invalid", (await redeem("NOPE", anna, "anna@example.com", ev.id)) === "invalid");
  check("inactive code is invalid", (await redeem("BETA-OFF", anna, "anna@example.com", ev.id)) === "invalid");
  check("expired code is refused", (await redeem("BETA-OLD", anna, "anna@example.com", ev.id)) === "expired");
  check("code locked to an email refuses someone else", (await redeem("BETA-ANNA", ben, "ben@example.com", benEv.id)) === "not_yours");
  check("code can't be used on someone else's event", (await redeem("BETA-ONE", anna, "anna@example.com", benEv.id)) === "event_not_found");
  check("nothing was used up by refused attempts", (await one(db, `select count(*)::int as n from public.promo_codes where redeemed_at is not null`)).n === 0);

  check("valid code redeems (case/space-insensitive)", (await redeem(" beta-one ", anna, "anna@example.com", ev.id)) === "ok");
  const row = await one(db, `select plan, owner_plan from public.events where id = '${ev.id}'`);
  check("event upgraded to the code's plan", row.plan === "pro" && row.owner_plan === "pro", JSON.stringify(row));
  const pay = await one(db, `select amount_centavos, status, provider, payment_method, provider_payment_id from public.payments where event_id = '${ev.id}'`);
  check("redemption recorded as a ₱0 paid promo payment", pay.amount_centavos === 0 && pay.status === "paid" && pay.provider === "promo" && pay.provider_payment_id === "BETA-ONE", JSON.stringify(pay));
  const code = await one(db, `select redeemed_by, redeemed_event_id from public.promo_codes where code = 'BETA-ONE'`);
  check("code records who used it and on which event", code.redeemed_by === anna && code.redeemed_event_id === ev.id);

  check("a used code can't be used again by someone else", (await redeem("BETA-ONE", ben, "ben@example.com", benEv.id)) === "used");
  check("a used code can't be used on a second event", (await redeem("BETA-ONE", anna, "anna@example.com", ev2.id)) === "used");
  check("one code per account", (await redeem("BETA-ANNA", anna, "anna@example.com", ev2.id)) === "already_redeemed");
  check("the second event stays Free", (await one(db, `select owner_plan from public.events where id = '${ev2.id}'`)).owner_plan === "free");

  await expectError(db, "₱0 payments are only allowed for promos", `insert into public.payments (user_id, plan, amount_centavos, description) values ('${ben}', 'pro', 0, 'free?')`, "payments_amount_centavos_check");
}
