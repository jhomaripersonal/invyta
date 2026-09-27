// Custom invitation links — run inside each scenario of test-sql.mjs.
export async function customLinkChecks(db, { one, check, asUser, asServer }) {
  const expectErr = async (label, sql, match) => {
    try {
      await db.exec(sql);
      check(label, false, "expected an error, got none");
    } catch (e) {
      check(label, !match || e.message.includes(match), e.message);
    }
  };
  const resolve = async (slug) => (await one(db, `select public.resolve_event_slug('${slug}') as s`)).s;

  const { id: free } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('freehost@example.com', '{"name":"Free"}') returning id`);
  const { id: prem } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('premhost@example.com', '{"name":"Prem"}') returning id`);

  // Free: a chosen slug at creation is replaced by a generated one.
  await asUser(db, free);
  const fe = await one(db, `insert into public.events (owner_id, name, category, slug, status) values ('${free}', 'Mia & Leo', 'wedding', 'mia-and-leo', 'published') returning id, slug`);
  check("Free event can't claim a chosen link at creation (server generates it)", fe.slug !== "mia-and-leo" && /^mia-leo-[0-9a-f]{4}$/.test(fe.slug), fe.slug);
  await expectErr("Free event can't change its link", `update public.events set slug = 'mia-and-leo' where id = '${fe.id}'`, "Premium");

  // Premium event (via a paid upgrade).
  await asUser(db, prem);
  const pe = await one(db, `insert into public.events (owner_id, name, category, slug, status) values ('${prem}', 'Elena & Marco', 'wedding', 'whatever', 'published') returning id, slug`);
  const original = pe.slug;
  await asServer(db);
  await db.exec(`update public.events set plan = 'premium' where id = '${pe.id}'`);
  await asUser(db, prem);

  await expectErr("invalid link format rejected", `update public.events set slug = 'Elena Marco!' where id = '${pe.id}'`, "lowercase");
  await expectErr("too-short link rejected", `update public.events set slug = 'em' where id = '${pe.id}'`, "lowercase");
  await expectErr("another event's current link can't be taken", `update public.events set slug = '${fe.slug}' where id = '${pe.id}'`, "already taken");
  check("availability check agrees", (await one(db, `select public.slug_available('${fe.slug}', '${pe.id}') as a`)).a === false && (await one(db, `select public.slug_available('elena-and-marco', '${pe.id}') as a`)).a === true);

  await db.exec(`update public.events set slug = 'elena-and-marco' where id = '${pe.id}'`);
  check("Premium event can set a custom link", (await one(db, `select slug from public.events where id = '${pe.id}'`)).slug === "elena-and-marco");
  check("new link resolves to itself", (await resolve("elena-and-marco")) === "elena-and-marco");
  check("old link still resolves — redirects to the new one", (await resolve(original)) === "elena-and-marco", `${original} → ${await resolve(original)}`);

  await db.exec(`update public.events set slug = 'elena-marco-2027' where id = '${pe.id}'`);
  check("links changed twice: both old links redirect to the latest", (await resolve(original)) === "elena-marco-2027" && (await resolve("elena-and-marco")) === "elena-marco-2027");

  // Nobody else can take an old link.
  await asServer(db);
  await db.exec(`update public.events set plan = 'premium' where id = '${fe.id}'`);
  await asUser(db, free);
  await expectErr("another event can't take someone's old link", `update public.events set slug = 'elena-and-marco' where id = '${fe.id}'`, "already taken");

  // Taking back one's own old link.
  await asUser(db, prem);
  await db.exec(`update public.events set slug = 'elena-and-marco' where id = '${pe.id}'`);
  const aliases = (await db.query(`select slug from public.event_slug_aliases where event_id = '${pe.id}' order by slug`)).rows.map((r) => r.slug);
  check("reclaiming your own old link works (and it's no longer an alias)", !aliases.includes("elena-and-marco") && aliases.includes("elena-marco-2027"), JSON.stringify(aliases));

  // Unpublished events don't resolve.
  await db.exec(`update public.events set status = 'unpublished' where id = '${pe.id}'`);
  check("unpublished event's links don't resolve publicly", (await resolve("elena-and-marco")) === null && (await resolve(original)) === null);
  check("unknown link resolves to nothing", (await resolve("no-such-link")) === null);
}
