// Promo codes and credits — run inside each scenario of run.mjs.
export async function promoCodeChecks(db, { one, check, expectError, asUser, asServer }) {
  const newUser = async (name) => (await one(db, `insert into auth.users (email, raw_user_meta_data) values ('${name}@example.com', '{"name":"${name}"}') returning id`)).id;
  const anna = await newUser("anna");
  const ben = await newUser("ben");
  const cara = await newUser("cara");
  const dan = await newUser("dan");

  await asUser(db, anna);
  const ev = await one(db, `insert into public.events (owner_id, name, category, slug) values ('${anna}', 'Anna wedding', 'wedding', 'anna-1') returning id`);
  const ev2 = await one(db, `insert into public.events (owner_id, name, category, slug) values ('${anna}', 'Anna party', 'birthday', 'anna-2') returning id`);
  await asUser(db, ben);
  const benEv = await one(db, `insert into public.events (owner_id, name, category, slug) values ('${ben}', 'Ben party', 'birthday', 'ben-1') returning id`);

  await asServer(db);
  await db.exec(`insert into public.promo_codes (code, plan, max_redemptions) values ('BETA-SHARED', 'pro', 2), ('BETA-OLD', 'pro', 5), ('BETA-OFF', 'pro', 5), ('BETA-PREM', 'premium', 5)`);
  await db.exec(`update public.promo_codes set expires_at = now() - interval '1 day' where code = 'BETA-OLD'`);
  await db.exec(`update public.promo_codes set active = false where code = 'BETA-OFF'`);
  await expectError(db, "codes must be stored uppercase", `insert into public.promo_codes (code, plan) values ('lower', 'pro')`, "check");

  // RLS with no policies: signed-in users see no codes (in Supabase,
  // authenticated has table grants, so this is an empty result rather than
  // an error).
  await db.exec("grant select on public.promo_codes, public.promo_redemptions to authenticated");
  await asUser(db, anna);
  const visible = await db.exec("set role authenticated; select code from public.promo_codes;").catch(() => null);
  await db.exec("reset role");
  check("users can't list promo codes", visible === null || visible.every((r) => r.rows.length === 0));
  await asServer(db);

  const redeem = async (code, uid) => (await one(db, `select public.redeem_promo_code('${code}', '${uid}') as r`)).r.status;
  const use = async (uid, eventId) => (await one(db, `select public.use_promo_credit('${uid}', '${eventId}') as r`)).r.status;

  check("unknown code is invalid", (await redeem("NOPE", anna)) === "invalid");
  check("inactive code is invalid", (await redeem("BETA-OFF", anna)) === "invalid");
  check("expired code is refused", (await redeem("BETA-OLD", anna)) === "expired");
  check("no credit before redeeming", (await use(anna, ev.id)) === "no_credit");

  check("shared code redeems (case/space-insensitive)", (await redeem(" beta-shared ", anna)) === "ok");
  check("second person can redeem the same code", (await redeem("BETA-SHARED", ben)) === "ok");
  check("code stops at max_redemptions", (await redeem("BETA-SHARED", cara)) === "full");
  check("one code per account", (await redeem("BETA-PREM", anna)) === "already_redeemed");
  check("redeeming the same code again is refused", (await redeem("BETA-SHARED", anna)) === "already_redeemed");
  check("redeeming alone doesn't upgrade anything", (await one(db, `select owner_plan from public.events where id = '${ev.id}'`)).owner_plan === "free");

  await asUser(db, anna);
  const own = await db.exec("set role authenticated; select user_id, used_at from public.promo_redemptions;");
  await db.exec("reset role");
  const rows = own[own.length - 1].rows;
  check("organizer can read only their own credit", rows.length === 1 && rows[0].user_id === anna && rows[0].used_at === null, JSON.stringify(rows));
  await asServer(db);

  check("credit can't be used on someone else's event", (await use(anna, benEv.id)) === "event_not_found");
  check("organizer picks the event: credit used on their second event", (await use(anna, ev2.id)) === "ok");
  const up = await one(db, `select plan, owner_plan from public.events where id = '${ev2.id}'`);
  check("chosen event upgraded to the code's plan", up.plan === "pro" && up.owner_plan === "pro", JSON.stringify(up));
  check("other event stays Free", (await one(db, `select owner_plan from public.events where id = '${ev.id}'`)).owner_plan === "free");
  const pay = await one(db, `select amount_centavos, status, provider, payment_method, provider_payment_id from public.payments where event_id = '${ev2.id}'`);
  check("use recorded as a ₱0 paid promo payment", pay.amount_centavos === 0 && pay.status === "paid" && pay.provider === "promo" && pay.provider_payment_id === "BETA-SHARED", JSON.stringify(pay));
  const red = await one(db, `select event_id, used_at is not null as used from public.promo_redemptions where user_id = '${anna}'`);
  check("credit records which event it was used on", red.used && red.event_id === ev2.id);
  check("a credit can be used only once", (await use(anna, ev.id)) === "no_credit");

  // A credit isn't wasted on an event that already has the plan.
  await db.exec(`update public.events set plan = 'pro' where id = '${benEv.id}'`);
  check("credit not spent on an event that already has the plan", (await use(ben, benEv.id)) === "already_has_plan");
  check("…and is still available afterwards", (await one(db, `select used_at from public.promo_redemptions where user_id = '${ben}'`)).used_at === null);

  // A Premium code works the same way.
  check("Premium code redeems", (await redeem("BETA-PREM", dan)) === "ok");
  await asUser(db, dan);
  const danEv = await one(db, `insert into public.events (owner_id, name, category, slug) values ('${dan}', 'Dan event', 'birthday', 'dan-1') returning id`);
  await asServer(db);
  check("Premium credit used", (await use(dan, danEv.id)) === "ok");
  check("event upgraded to Premium", (await one(db, `select owner_plan from public.events where id = '${danEv.id}'`)).owner_plan === "premium");

  await expectError(db, "₱0 payments are only allowed for promos", `insert into public.payments (user_id, plan, amount_centavos, description) values ('${ben}', 'pro', 0, 'free?')`, "payments_amount_centavos_check");
}
