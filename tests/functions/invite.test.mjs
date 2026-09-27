// Link previews (api/invite.ts): the Vercel function that gives shared
// invitation links their Messenger/Viber/Facebook card. Supabase and the
// app shell are faked with fetch stubs, so no network or build is needed.
// Run: pnpm test:functions
process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = "anon";

// Shaped like the real built index.html: the Figma site configuration
// injects a title, description, robots and OG tags that must be replaced.
const SHELL = `<!doctype html><html lang="en"><head>
<meta charset="UTF-8" />
<title>Invyta</title>
<meta name="description" content="Site default description">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="Invyta">
<meta property="og:description" content="Site default description">
</head><body><div id="root"></div></body></html>`;

const events = {
  "elena-and-marco": {
    name: 'Elena & Marco "<script>"',
    date: "2026-12-12",
    time: "16:00:00",
    venue_name: "The Garden Pavilion",
    venue_address: "Tagaytay, Cavite",
    image_url: "photo-1519741497674-611481863552",
    invitation: { sections: [{ type: "cover", content: { title: "" } }] },
  },
  "no-photo": {
    name: "Mia's 7th",
    date: "2026-11-07",
    time: null,
    venue_name: null,
    venue_address: null,
    image_url: null,
    invitation: { sections: [] },
  },
};
const aliases = { "elena-marco-7f3a": "elena-and-marco" };

globalThis.fetch = async (input, init) => {
  const u = String(input);
  if (u.endsWith("/index.html")) return new Response(SHELL);
  if (u.includes("/rest/v1/rpc/resolve_event_slug")) {
    const { p_slug } = JSON.parse(init.body);
    return new Response(JSON.stringify(events[p_slug] ? p_slug : aliases[p_slug] ?? null));
  }
  if (u.includes("/rest/v1/events")) {
    const slug = decodeURIComponent(u.match(/slug=eq\.([^&]+)/)[1]);
    return new Response(JSON.stringify(events[slug] ? [events[slug]] : []));
  }
  throw new Error(`unexpected fetch ${u}`);
};

const { GET } = await import("../../api/invite.ts");

let failures = 0;
let passes = 0;
const check = (label, ok, extra = "") => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${extra ? "  — " + extra : ""}`);
};
const page = async (slug) => (await GET(new Request(`https://invyta.app/api/invite?slug=${slug}`))).text();
const count = (html, re) => (html.match(re) ?? []).length;
const tag = (html, prop) => (html.match(new RegExp(`property="${prop}" content="([^"]*)"`)) ?? [])[1];

console.log("=== Published event ===");
let html = await page("elena-and-marco");
check("event title in the card", tag(html, "og:title") === "You're invited: Elena &amp; Marco &quot;&lt;script&gt;&quot;", tag(html, "og:title"));
check("HTML in event data is escaped", !html.includes("<script>"));
check("date, time and venue in the description", tag(html, "og:description") === "Saturday, December 12, 2026 at 4:00 PM · The Garden Pavilion, Tagaytay, Cavite", tag(html, "og:description"));
check("cover photo cropped for cards", tag(html, "og:image")?.includes("w=1200&amp;h=630"));
check("site defaults replaced, not duplicated", count(html, /<title>/g) === 1 && count(html, /property="og:title"/g) === 1 && count(html, /name="description"/g) === 1 && count(html, /name="robots"/g) === 1);
check("invitations are noindex", html.includes('name="robots" content="noindex, nofollow"'));

console.log("\n=== Old link (changed to a custom one) ===");
html = await page("elena-marco-7f3a");
check("old link still gets the event's card", tag(html, "og:title")?.startsWith("You're invited: Elena &amp; Marco"));
check("canonical og:url is the new link", tag(html, "og:url") === "https://invyta.app/i/elena-and-marco", tag(html, "og:url"));

console.log("\n=== No photo ===");
html = await page("no-photo");
check("falls back to the branded card", tag(html, "og:image") === "https://invyta.app/og-image.jpg", tag(html, "og:image"));
check("one image tag, large card", count(html, /property="og:image"/g) === 1 && html.includes('name="twitter:card" content="summary_large_image"'));

console.log("\n=== Unknown or unpublished ===");
html = await page("no-such-event");
check("site defaults kept, no event card", !html.includes("You're invited") && html.includes("<title>Invyta</title>"));

console.log(failures === 0 ? `\nALL ${passes} LINK PREVIEW CHECKS PASS` : `\n${failures} FAILURE(S), ${passes} passed`);
process.exitCode = failures === 0 ? 0 : 1;
