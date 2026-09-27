// Video section is Pro-only — run inside each scenario of tests/sql/run.mjs.
export async function videoChecks(db, { one, check, expectError, asUser, asServer }) {
  const withVideo = (enabled, url = "https://youtu.be/dQw4w9WgXcQ") =>
    JSON.stringify({ theme: {}, sections: [{ type: "video", enabled, order: 0, content: { heading: "Our Film", videos: [{ url, title: "Prenup" }] } }] }).replace(/'/g, "''");

  const { id: host } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('videohost@example.com', '{"name":"Video"}') returning id`);
  await asUser(db, host);
  const ev = await one(db, `insert into public.events (owner_id, name, category, slug) values ('${host}', 'Video test', 'wedding', 'vt') returning id`);

  // Free and Premium can't show videos.
  await expectError(db, "Free event can't add videos", `update public.events set invitation = '${withVideo(true)}' where id = '${ev.id}'`, "Pro plan");
  await asServer(db);
  await db.exec(`update public.events set plan = 'premium' where id = '${ev.id}'`);
  await asUser(db, host);
  await expectError(db, "Premium event can't add videos either", `update public.events set invitation = '${withVideo(true)}' where id = '${ev.id}'`, "Pro plan");

  // Drafting links in a switched-off section, or an empty link, is fine.
  await db.exec(`update public.events set invitation = '${withVideo(false)}' where id = '${ev.id}'`);
  check("a switched-off Video section with links can be saved", true);
  await db.exec(`update public.events set invitation = '${withVideo(true, "  ")}' where id = '${ev.id}'`);
  check("an enabled Video section with no real link can be saved", true);

  // Pro can.
  await asServer(db);
  await db.exec(`update public.events set plan = 'pro' where id = '${ev.id}'`);
  await asUser(db, host);
  await db.exec(`update public.events set invitation = '${withVideo(true)}' where id = '${ev.id}'`);
  check("Pro event can show videos", (await one(db, `select public.invitation_uses_video(invitation) as v from public.events where id = '${ev.id}'`)).v === true);

  // Already showing videos stays editable if the plan later drops.
  await asServer(db);
  await db.exec(`update public.events set plan = 'free' where id = '${ev.id}'`);
  await asUser(db, host);
  await db.exec(`update public.events set invitation = '${withVideo(true, "https://youtu.be/aaaaaaaaaaa")}' where id = '${ev.id}'`);
  check("an event that already shows videos stays editable after its plan drops", true);
}
