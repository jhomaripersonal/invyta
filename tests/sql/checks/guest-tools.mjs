// RSVP deadline, custom RSVP questions, party-size limits, background music
// and priority support — run inside each scenario of tests/sql/run.mjs.
export async function guestToolsChecks(db, { one, check, expectError, asUser, asServer }) {
  await db.exec(`grant usage on schema public to anon, authenticated;
    grant select, insert, update on public.guests to anon, authenticated;
    grant select on public.events to anon, authenticated;
    grant insert on public.support_requests to anon, authenticated;`);
  const asAnon = () => db.exec(`select set_config('request.jwt.claim.role', 'anon', false), set_config('request.jwt.claim.sub', '', false)`);
  const asAnonRole = async (sql) => {
    try {
      await db.exec("set role anon");
      return await db.exec(sql);
    } finally {
      await db.exec("reset role");
    }
  };
  const tryAnon = async (label, sql, match) => {
    try {
      await asAnonRole(sql);
      check(label, false, "expected an error, got none");
    } catch (e) {
      check(label, !match || e.message.includes(match), e.message);
    }
  };
  const q = (v) => JSON.stringify(v).replace(/'/g, "''");
  const rsvpSection = (content, enabled = true) => ({ theme: {}, sections: [{ type: "rsvp", enabled, order: 0, content }] });
  const phDate = (offsetDays) => {
    const d = new Date(Date.now() + 8 * 3600e3 + offsetDays * 86400e3);
    return d.toISOString().slice(0, 10);
  };

  const { id: host } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('toolshost@example.com', '{"name":"Tools"}') returning id`);
  await asUser(db, host);
  const newEvent = async (slug) => (await one(db, `insert into public.events (owner_id, name, category, slug, status) values ('${host}', 'Tools ${slug}', 'wedding', '${slug}', 'published') returning id`)).id;
  const setPlan = async (id, plan) => {
    await asServer(db);
    await db.exec(`update public.events set plan = '${plan}' where id = '${id}'`);
    await asUser(db, host);
  };

  // ── RSVP deadline ──
  const dl = await newEvent("tools-deadline");
  await db.exec(`update public.events set invitation = '${q(rsvpSection({ deadline: phDate(0) }))}' where id = '${dl}'`);
  await asAnon();
  await asAnonRole(`insert into public.guests (event_id, name, rsvp_status, number_of_guests) values ('${dl}', 'On the day', 'confirmed', 1)`);
  check("RSVP accepted on the deadline day itself (Philippine time)", true);
  await asUser(db, host);
  await db.exec(`update public.events set invitation = '${q(rsvpSection({ deadline: phDate(-1) }))}' where id = '${dl}'`);
  await asAnon();
  await tryAnon("public RSVP rejected after the deadline", `insert into public.guests (event_id, name, rsvp_status, number_of_guests) values ('${dl}', 'Too late', 'confirmed', 1)`, "have closed");
  await asUser(db, host);
  await db.exec(`insert into public.guests (event_id, name) values ('${dl}', 'Added by host after deadline')`);
  check("host can still add guests after the deadline", true);
  await db.exec(`update public.events set invitation = '${q(rsvpSection({ deadline: "2026-02-31" }))}' where id = '${dl}'`);
  await asAnon();
  await asAnonRole(`insert into public.guests (event_id, name, rsvp_status, number_of_guests) values ('${dl}', 'Bad date', 'confirmed', 1)`);
  check("an invalid deadline counts as no deadline", true);

  // ── custom RSVP questions (Pro) ──
  const qs = await newEvent("tools-questions");
  const withQuestions = q(rsvpSection({ questions: [{ id: "song", label: "Song request?", type: "text" }] }));
  await expectError(db, "Free event can't add custom RSVP questions", `update public.events set invitation = '${withQuestions}' where id = '${qs}'`, "Pro plan");
  await setPlan(qs, "premium");
  await expectError(db, "Premium event can't add custom RSVP questions", `update public.events set invitation = '${withQuestions}' where id = '${qs}'`, "Pro plan");
  await db.exec(`update public.events set invitation = '${q(rsvpSection({ questions: [{ id: "x", label: "Draft" }] }, false))}' where id = '${qs}'`);
  check("questions in a switched-off RSVP section can be saved", true);

  // Answers from a public RSVP are dropped below Pro, kept on Pro.
  await asAnon();
  await asAnonRole(`insert into public.guests (event_id, name, rsvp_status, number_of_guests, answers, max_party_size, reminded_at) values ('${qs}', 'Premium guest', 'confirmed', 1, '{"song":"Hi"}', 20, now())`);
  let row = await one(db, `select answers, max_party_size, reminded_at from public.guests where name = 'Premium guest'`);
  check("public RSVP answers dropped below Pro", JSON.stringify(row.answers) === "{}", JSON.stringify(row.answers));
  check("public RSVP can't set max_party_size or reminded_at", row.max_party_size === null && row.reminded_at === null, JSON.stringify(row));
  await setPlan(qs, "pro");
  await db.exec(`update public.events set invitation = '${withQuestions}' where id = '${qs}'`);
  check("Pro event can add custom RSVP questions", true);
  await asAnon();
  await asAnonRole(`insert into public.guests (event_id, name, rsvp_status, number_of_guests, answers) values ('${qs}', 'Pro guest', 'confirmed', 1, '{"song":"September"}')`);
  row = await one(db, `select answers from public.guests where name = 'Pro guest'`);
  check("public RSVP answers kept on Pro", row.answers.song === "September", JSON.stringify(row.answers));
  await tryAnon("oversized answers are rejected", `insert into public.guests (event_id, name, rsvp_status, number_of_guests, answers) values ('${qs}', 'Essay', 'confirmed', 1, jsonb_build_object('song', repeat('x', 6000)))`, "guests_answers_size");
  await tryAnon("answers must be an object", `insert into public.guests (event_id, name, rsvp_status, number_of_guests, answers) values ('${qs}', 'Array', 'confirmed', 1, '[1]')`, "guests_answers_size");

  // ── party-size limit on personalized links ──
  await asUser(db, host);
  const { id: fam } = await one(db, `insert into public.guests (event_id, name, max_party_size) values ('${qs}', 'Santos family', 3) returning id`);
  await asAnon();
  const pub = (await asAnonRole(`select * from public.get_guest_public('${fam}')`))[0].rows[0];
  check("get_guest_public returns the party-size limit", pub?.max_party_size === 3, JSON.stringify(pub));
  await tryAnon("personalized RSVP over the party-size limit is rejected", `select public.update_guest_rsvp('${fam}', 'Santos family', true, 4, null, null)`, "up to 3 people");
  await asAnonRole(`select public.update_guest_rsvp('${fam}', 'Santos family', true, 3, 'Fish', null, '{"song":"Dancing Queen"}')`);
  row = await one(db, `select rsvp_status, number_of_guests, answers from public.guests where id = '${fam}'`);
  check("personalized RSVP within the limit saves, with answers", row.rsvp_status === "confirmed" && row.number_of_guests === 3 && row.answers.song === "Dancing Queen", JSON.stringify(row));
  await asAnonRole(`select public.update_guest_rsvp('${fam}', 'Santos family', false, 9, null, null)`);
  check("declining isn't blocked by the party-size limit", (await one(db, `select rsvp_status from public.guests where id = '${fam}'`)).rsvp_status === "declined");
  await asUser(db, host);
  await db.exec(`update public.events set invitation = '${q(rsvpSection({ questions: [{ id: "song", label: "Song request?" }], deadline: phDate(-1) }))}' where id = '${qs}'`);
  await asAnon();
  await tryAnon("personalized RSVP rejected after the deadline", `select public.update_guest_rsvp('${fam}', 'Santos family', true, 2, null, null)`, "have closed");
  await asUser(db, host);
  await expectError(db, "party-size limit must be 1–20", `update public.guests set max_party_size = 21 where id = '${fam}'`, "max_party_size");
  await db.exec(`update public.guests set reminded_at = now() where id = '${fam}'`);
  check("host can record a reminder", (await one(db, `select reminded_at is not null as r from public.guests where id = '${fam}'`)).r);

  // ── background music (Pro) ──
  const mu = await newEvent("tools-music");
  const withMusic = q({ theme: {}, sections: [], music: { url: "https://example.com/song.mp3", title: "Our song" } });
  await expectError(db, "Free event can't add background music", `update public.events set invitation = '${withMusic}' where id = '${mu}'`, "Pro plan");
  await db.exec(`update public.events set invitation = '${q({ theme: {}, sections: [], music: { url: "  " } })}' where id = '${mu}'`);
  check("an empty music link can be saved", true);
  await setPlan(mu, "pro");
  await db.exec(`update public.events set invitation = '${withMusic}' where id = '${mu}'`);
  check("Pro event can add background music", true);
  await setPlan(mu, "free");
  await db.exec(`update public.events set invitation = jsonb_set(invitation, '{music,title}', '"Renamed"') where id = '${mu}'`);
  check("an event already playing music stays editable after its plan drops", true);
  const bucket = await one(db, `select public, file_size_limit from storage.buckets where id = 'invitation-audio'`);
  check("invitation-audio bucket is public with a 10 MB limit", bucket?.public === true && bucket?.file_size_limit === 10485760, JSON.stringify(bucket));

  // ── priority support ──
  const support = (email) => `insert into public.support_requests (name, email, category, subject, message) values ('A', '${email}', 'question', 'Hi', 'Help')`;
  await asUser(db, host); // owns Pro events (qs)
  await db.exec(`set role authenticated; ${support("pro@example.com")}; reset role;`);
  const { id: freeUser } = await one(db, `insert into auth.users (email) values ('free@example.com') returning id`);
  await asUser(db, freeUser);
  await db.exec(`set role authenticated; ${support("free@example.com")}; reset role;`);
  await asAnon();
  await asAnonRole(support("anon@example.com"));
  await asServer(db);
  const pr = await one(db, `select bool_or(priority) filter (where email = 'pro@example.com') as pro, bool_or(priority) filter (where email = 'free@example.com') as free, bool_or(priority) filter (where email = 'anon@example.com') as anon from public.support_requests`);
  check("support request from a Pro organizer is priority", pr.pro === true, JSON.stringify(pr));
  check("requests from Free organizers and anonymous visitors aren't", pr.free === false && pr.anon === false, JSON.stringify(pr));
}
