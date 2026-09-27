// Admin portal & support inbox checks, run inside each scenario of test-sql.mjs.
export async function adminChecks(db, { one, check, expectError, asUser, asServer }) {
  await db.exec(`grant usage on schema public to anon, authenticated;
    grant select, insert, update on public.support_requests to anon, authenticated;
    grant select on public.profiles to authenticated;
    grant execute on all functions in schema public to anon, authenticated;`);
  const { id: u2 } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('member@example.com', '{"name":"Member"}') returning id`);
  const { id: adm } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('admin@example.com', '{"name":"Admin"}') returning id`);

  const asRole = async (role, sql) => {
    try {
      await db.exec(`set role ${role}`);
      return await db.query(sql);
    } finally {
      await db.exec("reset role");
    }
  };

  await asUser(db, u2);
  await expectError(db, "non-admin cannot read admin overview", `select public.admin_overview()`, "Not authorized");
  await expectError(db, "non-admin cannot list payments", `select * from public.admin_payments()`, "Not authorized");
  await expectError(db, "non-admin cannot list users", `select * from public.admin_recent_users()`, "Not authorized");
  try {
    await asRole("authenticated", `update public.profiles set is_admin = true where id = '${u2}'`);
    check("user cannot make themselves admin", false, "update succeeded");
  } catch (e) {
    check("user cannot make themselves admin", e.message.includes("permission denied"), e.message);
  }

  await asServer(db);
  await db.exec(`update public.profiles set is_admin = true where id = '${adm}'`);
  await asUser(db, adm);
  const ov = (await one(db, `select public.admin_overview() as o`)).o;
  check("admin overview returns totals", ov.users_total >= 2 && typeof ov.revenue_total_centavos === "number", JSON.stringify({ users: ov.users_total, paid: ov.payments_paid, revenue: ov.revenue_total_centavos, events: ov.events_total }));
  check("overview has 30 daily buckets for sign-ups and revenue", ov.signups_by_day.length === 30 && ov.revenue_by_day.length === 30);
  check("today's sign-ups counted in the last bucket", ov.signups_by_day[29].value >= 2, JSON.stringify(ov.signups_by_day[29]));
  const users = (await db.query(`select * from public.admin_recent_users(10)`)).rows;
  check("admin can list recent users with email", users.some((u) => u.email === "member@example.com"));

  // Anonymous guest submits, trying to spoof a user id / status / note.
  await db.exec(`select set_config('request.jwt.claim.role', 'anon', false), set_config('request.jwt.claim.sub', '', false)`);
  await asRole("anon", `insert into public.support_requests (user_id, name, email, category, subject, message, status, admin_note)
    values ('${u2}', 'Guest', ' Guest@Example.com ', 'privacy', 'Delete my RSVP', 'Please delete my RSVP.', 'resolved', 'spoofed')`);
  await asServer(db);
  const sr = await one(db, `select user_id, status, admin_note, email from public.support_requests where subject = 'Delete my RSVP'`);
  check("anonymous support request accepted", !!sr);
  check("spoofed user_id / status / admin_note ignored; email normalized", sr && sr.user_id === null && sr.status === "open" && sr.admin_note === null && sr.email === "guest@example.com", JSON.stringify(sr));

  await asUser(db, u2);
  for (let i = 0; i < 5; i++) {
    await asRole("authenticated", `insert into public.support_requests (name, email, category, subject, message) values ('Member', 'member@example.com', 'question', 'Q${i}', 'hi')`);
  }
  try {
    await asRole("authenticated", `insert into public.support_requests (name, email, category, subject, message) values ('Member', 'member@example.com', 'question', 'spam', 'spam')`);
    check("6th request from the same email within an hour is rate-limited", false, "insert succeeded");
  } catch (e) {
    check("6th request from the same email within an hour is rate-limited", e.message.includes("Too many requests"), e.message);
  }

  const ownRows = (await asRole("authenticated", `select user_id from public.support_requests`)).rows;
  check("member sees only their own support requests (RLS)", ownRows.length === 5 && ownRows.every((r) => r.user_id === u2), `saw ${ownRows.length}`);
  await asRole("authenticated", `update public.support_requests set status = 'resolved' where subject = 'Delete my RSVP'`);
  await asServer(db);
  check("member cannot change someone else's request", (await one(db, `select status from public.support_requests where subject = 'Delete my RSVP'`)).status === "open");

  await asUser(db, adm);
  const adminRows = (await asRole("authenticated", `select id from public.support_requests`)).rows;
  check("admin sees every support request", adminRows.length === 6, `saw ${adminRows.length}`);
  await asRole("authenticated", `update public.support_requests set status = 'resolved', admin_note = 'Deleted' where subject = 'Delete my RSVP'`);
  await asServer(db);
  const res = await one(db, `select status, admin_note, resolved_at is not null as has_resolved from public.support_requests where subject = 'Delete my RSVP'`);
  check("admin can resolve a request; resolved_at stamped", res.status === "resolved" && res.admin_note === "Deleted" && res.has_resolved, JSON.stringify(res));
}
