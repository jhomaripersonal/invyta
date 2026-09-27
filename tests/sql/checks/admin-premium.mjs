// Admins get every Premium/Pro feature — run inside each scenario of test-sql.mjs.
export async function adminPremiumChecks(db, { one, check, asUser, asServer }) {
  const { id: staff } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('staff@example.com', '{"name":"Staff"}') returning id`);
  const { id: regular } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('regular@example.com', '{"name":"Regular"}') returning id`);

  await asUser(db, staff);
  const ev = await one(db, `insert into public.events (owner_id, name, category, slug) values ('${staff}', 'Staff test event', 'wedding', 'staff-1') returning id, owner_plan`);
  check("before admin: event is Free", ev.owner_plan === "free");

  await asServer(db);
  await db.exec(`update public.profiles set is_admin = true where id = '${staff}'`);
  let row = await one(db, `select plan, owner_plan from public.events where id = '${ev.id}'`);
  check("making someone admin lifts their existing events to Pro (nothing purchased)", row.owner_plan === "pro" && row.plan === "free", JSON.stringify(row));

  await asUser(db, staff);
  const ev2 = await one(db, `insert into public.events (owner_id, name, category, slug, template_id) values ('${staff}', 'Staff new event', 'wedding', 'staff-2', 'golden-hour') returning owner_plan`);
  check("admin's new event starts as Pro, and can use a Premium template at creation", ev2.owner_plan === "pro");
  await db.exec(`update public.events set invitation = '{"theme":{"layout":"split"},"sections":[{"type":"venue","content":{"style":"map"}},{"type":"gallery","content":{"layout":"polaroid","filter":"warm"}}]}' where id = '${ev.id}'`);
  check("admin can use Premium layouts, section and gallery styles", true);
  for (let i = 0; i < 51; i++) await db.exec(`insert into public.guests (event_id, name) values ('${ev.id}', 'G${i}')`);
  check("admin event not capped at 50 guests", (await one(db, `select count(*)::int as n from public.guests where event_id = '${ev.id}'`)).n === 51);
  await db.exec(`update public.guests set checked_in = true where event_id = '${ev.id}' and name = 'G0'`);
  check("admin event can use QR check-in", true);
  const guest = await one(db, `select id from public.guests where event_id = '${ev.id}' and name = 'G1'`);
  await db.exec(`update public.events set status = 'published' where id = '${ev.id}'`);
  check("admin event supports personalized links (Pro)", (await db.query(`select * from public.get_guest_public('${guest.id}')`)).rows.length === 1);

  await asUser(db, regular);
  const reg = await one(db, `insert into public.events (owner_id, name, category, slug) values ('${regular}', 'Regular event', 'birthday', 'reg-1') returning owner_plan`);
  check("non-admin users are unaffected (still Free)", reg.owner_plan === "free");

  await asServer(db);
  await db.exec(`update public.profiles set is_admin = false where id = '${staff}'`);
  row = await one(db, `select owner_plan from public.events where id = '${ev.id}'`);
  check("removing admin drops their events back to what was paid for", row.owner_plan === "free", row.owner_plan);

  await db.exec(`update public.profiles set is_admin = true, plan = 'event_planner' where id = '${staff}'`);
  row = await one(db, `select owner_plan from public.events where id = '${ev.id}'`);
  check("an admin with a higher account plan keeps the higher one", row.owner_plan === "event_planner", row.owner_plan);
}
