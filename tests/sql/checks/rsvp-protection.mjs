// Public RSVP spam protection — run inside each scenario of tests/sql/run.mjs.
export async function rsvpProtectionChecks(db, { one, check, asUser, asServer }) {
  await db.exec(`grant usage on schema public to anon, authenticated;
    grant select, insert, update on public.guests to anon, authenticated;
    grant select on public.events to anon, authenticated;`);
  const asAnon = () => db.exec(`select set_config('request.jwt.claim.role', 'anon', false), set_config('request.jwt.claim.sub', '', false)`);
  const anonInsert = async (sql) => {
    try {
      await db.exec("set role anon");
      await db.exec(sql);
    } finally {
      await db.exec("reset role");
    }
  };
  const tryAnon = async (label, sql, match) => {
    try {
      await anonInsert(sql);
      check(label, false, "expected an error, got none");
    } catch (e) {
      check(label, !match || e.message.includes(match), e.message);
    }
  };
  const rsvp = (eventId, name, extra = "") => `insert into public.guests (event_id, name, rsvp_status, number_of_guests${extra ? ", " + extra.split("=")[0] : ""}) values ('${eventId}', '${name}', 'confirmed', 1${extra ? ", " + extra.split("=")[1] : ""})`;

  const { id: host } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('rsvphost@example.com', '{"name":"Host"}') returning id`);
  await asUser(db, host);
  const { id: ev } = await one(db, `insert into public.events (owner_id, name, category, slug, status) values ('${host}', 'Big wedding', 'wedding', 'bw', 'published') returning id`);
  await asServer(db);
  await db.exec(`update public.events set plan = 'pro' where id = '${ev}'`); // unlimited guests, so only the spam limits apply

  // A burst of public RSVPs: 30 in a minute are fine, the 31st isn't.
  await asAnon();
  for (let i = 0; i < 30; i++) await anonInsert(rsvp(ev, `Guest ${i}`));
  check("30 public RSVPs within a minute are accepted", (await one(db, `select count(*)::int as n from public.guests where event_id = '${ev}' and source = 'rsvp'`)).n === 30);
  await tryAnon("the 31st within a minute is rate-limited", rsvp(ev, "Guest 30"), "Too many RSVPs");

  // Spoofing: a public RSVP can't claim to be host-added or backdate itself.
  await asServer(db);
  await db.exec(`update public.guests set submitted_at = now() - interval '2 minutes' where event_id = '${ev}'`); // let the minute window pass
  await asAnon();
  await anonInsert(`insert into public.guests (event_id, name, rsvp_status, number_of_guests, source, submitted_at) values ('${ev}', 'Sneaky', 'confirmed', 1, 'host', now() - interval '1 day')`);
  const sneaky = await one(db, `select source, submitted_at > now() - interval '1 minute' as fresh from public.guests where name = 'Sneaky'`);
  check("public RSVP can't claim source='host' or backdate submitted_at", sneaky.source === "rsvp" && sneaky.fresh, JSON.stringify(sneaky));

  // Duplicates and size limits.
  await tryAnon("same name again within 10 minutes is rejected", rsvp(ev, "  sneaky "), "already RSVP");
  await tryAnon("more than 20 people in one RSVP is rejected", `insert into public.guests (event_id, name, rsvp_status, number_of_guests) values ('${ev}', 'Big family', 'confirmed', 21)`, "at most 20");
  await tryAnon("an oversized message is rejected", `insert into public.guests (event_id, name, rsvp_status, number_of_guests, message) values ('${ev}', 'Chatty', 'confirmed', 1, repeat('x', 1001))`, "guests_field_sizes");
  await tryAnon("an oversized name is rejected", rsvp(ev, "x".repeat(121)), "guests_field_sizes");

  // The host is never rate-limited (e.g. a CSV import of 120 guests at once).
  await asUser(db, host);
  await db.exec(`insert into public.guests (event_id, name, number_of_guests) select '${ev}', 'Imported ' || g, 1 from generate_series(1, 120) g`);
  const hostRows = await one(db, `select count(*)::int as n, bool_and(source = 'host') as all_host from public.guests where event_id = '${ev}' and name like 'Imported %'`);
  check("host can add 120 guests at once (not rate-limited, marked as host-added)", hostRows.n === 120 && hostRows.all_host, JSON.stringify(hostRows));
  await asAnon();
  await anonInsert(rsvp(ev, "After the import"));
  check("host additions don't use up the public RSVP limits", true);

  // Hourly and total caps.
  await asServer(db);
  await db.exec(`insert into public.guests (event_id, name, number_of_guests, source, submitted_at) select '${ev}', 'Hour ' || g, 1, 'rsvp', now() - interval '30 minutes' from generate_series(1, 470) g`);
  await asAnon();
  await tryAnon("more than 500 public RSVPs within an hour is rate-limited", rsvp(ev, "One more this hour"), "Too many RSVPs");
  await asServer(db);
  await db.exec(`insert into public.guests (event_id, name, number_of_guests, source, submitted_at) select '${ev}', 'Old ' || g, 1, 'rsvp', now() - interval '2 days' from generate_series(1, 1500) g`);
  await db.exec(`update public.guests set submitted_at = now() - interval '2 days' where event_id = '${ev}' and name like 'Hour %'`);
  await asAnon();
  await tryAnon("an invitation stops accepting public RSVPs at 2,000", rsvp(ev, "Number 2001"), "isn't accepting more");

  // Organizer-side limits still allow normal use.
  await asUser(db, host);
  await db.exec(`insert into public.guests (event_id, name, number_of_guests) values ('${ev}', 'Lola and the whole family', 25)`);
  check("host can still add a party of 25 (the 20-person limit is for public RSVPs)", true);
}
