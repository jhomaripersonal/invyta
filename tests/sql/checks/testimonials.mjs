// Testimonial checks, run inside each scenario of test-sql.mjs.
export async function testimonialChecks(db, { one, check, asUser, asServer }) {
  // Supabase grants table access to `authenticated` by default; RLS then decides rows.
  await db.exec(`grant select, insert, update, delete on public.events to authenticated;
    grant select, insert, update, delete on public.testimonials to anon, authenticated;
    grant execute on all functions in schema public to anon, authenticated;`);
  const asRole = async (role, sql) => {
    try {
      await db.exec(`set role ${role}`);
      return await db.query(sql);
    } finally {
      await db.exec("reset role");
    }
  };
  const tryRole = async (label, role, sql, match) => {
    try {
      await asRole(role, sql);
      check(label, false, "expected an error, got none");
    } catch (e) {
      check(label, !match || e.message.includes(match), e.message);
    }
  };

  const { id: host } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('host@example.com', '{"name":"Host"}') returning id`);
  const { id: other } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('other@example.com', '{"name":"Other"}') returning id`);
  const { id: adm } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('boss@example.com', '{"name":"Boss"}') returning id`);
  await asServer(db);
  await db.exec(`update public.profiles set is_admin = true where id = '${adm}'`);

  await asUser(db, host);
  await tryRole("can't submit a testimonial before creating an event", "authenticated",
    `insert into public.testimonials (display_name, quote, rating, consented_at) values ('Host A.', 'Loved it, so easy to use!', 5, now())`, "Create an event");
  await asRole("authenticated", `insert into public.events (owner_id, name, category, slug) values ('${host}', 'Host wedding', 'wedding', 'host-w-1')`);
  await asRole("authenticated", `insert into public.testimonials (user_id, display_name, event_label, quote, rating, status, consented_at)
    values ('${other}', 'Host A.', 'Wedding · Taguig City', 'Loved it, so easy to use!', 5, 'approved', now() - interval '1 year')`);
  await asServer(db);
  let t = await one(db, `select user_id, status, approved_at, consented_at > now() - interval '1 minute' as fresh_consent from public.testimonials where display_name = 'Host A.'`);
  check("submitted as self, pending, consent stamped now (spoofed user/status ignored)", t.user_id === host && t.status === "pending" && t.approved_at === null && t.fresh_consent, JSON.stringify(t));

  await asUser(db, host);
  await tryRole("only one testimonial per organizer", "authenticated",
    `insert into public.testimonials (display_name, quote, consented_at) values ('Again', 'A second testimonial here', now())`, "duplicate");
  let pub = (await asRole("anon", `select * from public.approved_testimonials()`)).rows;
  check("pending testimonial is not public", pub.length === 0);
  await asRole("authenticated", `update public.testimonials set status = 'approved' where user_id = '${host}'`);
  await asServer(db);
  check("owner cannot approve their own testimonial", (await one(db, `select status from public.testimonials where user_id = '${host}'`)).status === "pending");

  await asUser(db, other);
  check("other users can't read someone's testimonial", (await asRole("authenticated", `select id from public.testimonials`)).rows.length === 0);
  await asRole("authenticated", `update public.testimonials set quote = 'hacked quote here' where user_id = '${host}'`);
  await asServer(db);
  check("other users can't edit someone's testimonial", (await one(db, `select quote from public.testimonials where user_id = '${host}'`)).quote === "Loved it, so easy to use!");

  await asUser(db, adm);
  await asRole("authenticated", `update public.testimonials set status = 'approved' where user_id = '${host}'`);
  await asServer(db);
  t = await one(db, `select status, approved_at is not null as has_approved from public.testimonials where user_id = '${host}'`);
  check("admin approves; approved_at stamped", t.status === "approved" && t.has_approved, JSON.stringify(t));
  pub = (await asRole("anon", `select * from public.approved_testimonials()`)).rows;
  check("approved testimonial is public, with display fields only", pub.length === 1 && pub[0].display_name === "Host A." && !("user_id" in pub[0]) && !("email" in pub[0]), JSON.stringify(Object.keys(pub[0] ?? {})));
  const anonTable = (await asRole("anon", `select * from public.testimonials`)).rows;
  check("anonymous visitors can't read the table directly", anonTable.length === 0);

  await asUser(db, host);
  await asRole("authenticated", `update public.testimonials set quote = 'Even better the second time!' where user_id = '${host}'`);
  await asServer(db);
  t = await one(db, `select status, approved_at from public.testimonials where user_id = '${host}'`);
  check("owner's edit sends it back to review and off the landing page", t.status === "pending" && t.approved_at === null, JSON.stringify(t));
  pub = (await asRole("anon", `select * from public.approved_testimonials()`)).rows;
  check("edited testimonial hidden until re-approved", pub.length === 0);

  await asUser(db, host);
  await asRole("authenticated", `delete from public.testimonials where user_id = '${host}'`);
  await asServer(db);
  check("owner can withdraw (delete) their testimonial", (await one(db, `select count(*)::int as n from public.testimonials`)).n === 0);
}
