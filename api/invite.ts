// Link previews for shared invitations (/i/:slug and /i/:slug/g/:guestId).
//
// Messenger, Viber, Facebook and friends build a link's preview card from
// the page's raw HTML — they don't run JavaScript, so the SPA's shell alone
// would give every invitation the same blank card. vercel.json rewrites
// invitation URLs here; this fetches the published event (the same
// anonymous, published-only read the public page itself does), injects
// Open Graph tags for it into the normal app shell, and returns that. The
// browser then boots the SPA from it exactly as before.
//
// Guest-specific links get the event's generic card: a guest's name never
// goes into preview metadata, since whoever the link is forwarded to (or
// the chat app's own servers) would see it.

type EventRow = {
  name: string;
  date: string | null;
  time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  image_url: string | null;
  invitation: { sections?: { type: string; content?: Record<string, unknown> }[] } | null;
};

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// An old link (the hosts switched to a custom one) → the current slug.
async function resolveSlug(slug: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_event_slug`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!res.ok) return null;
    const current = await res.json();
    return typeof current === "string" ? current : null;
  } catch {
    return null;
  }
}

async function fetchPublishedEvent(slug: string): Promise<EventRow | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const url = `${SUPABASE_URL}/rest/v1/events?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=name,date,time,venue_name,venue_address,image_url,invitation&limit=1`;
  try {
    const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
    if (!res.ok) return null;
    const rows = (await res.json()) as EventRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

function coverContent(event: EventRow): Record<string, unknown> {
  return event.invitation?.sections?.find((s) => s.type === "cover")?.content ?? {};
}

function formatWhen(date: string | null, time: string | null): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (!time) return day;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return day;
  const clock = new Date(Date.UTC(2000, 0, 1, h, m || 0)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  return `${day} at ${clock}`;
}

// The organizer's uploaded cover photo if there is one, otherwise the
// event's template stock photo (stored as a bare Unsplash photo id),
// cropped to the 1.91:1 size preview cards expect — or, with neither, the
// site's branded card (public/og-image.jpg) rather than a blank preview.
function imageFor(event: EventRow, origin: string): string {
  const uploaded = coverContent(event).imageUrl;
  if (typeof uploaded === "string" && /^https:\/\//.test(uploaded)) return uploaded;
  if (event.image_url && /^https:\/\//.test(event.image_url)) return event.image_url;
  if (event.image_url) return `https://images.unsplash.com/${event.image_url}?w=1200&h=630&fit=crop&auto=format`;
  return `${origin}/og-image.jpg`;
}

function previewTags(event: EventRow, pageUrl: string): string {
  const cover = coverContent(event);
  const title = (typeof cover.title === "string" && cover.title.trim()) || event.name;
  const when = formatWhen(event.date, event.time);
  const where = [event.venue_name, event.venue_address].filter(Boolean).join(", ");
  const description = [when, where].filter(Boolean).join(" · ") || "You're invited! Open the invitation to RSVP.";
  const image = imageFor(event, new URL(pageUrl).origin);

  const tags = [
    `<title>${escapeHtml(title)} · Invyta</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    // Invitations are shared privately, not meant to be found through search.
    `<meta name="robots" content="noindex, nofollow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Invyta" />`,
    `<meta property="og:title" content="${escapeHtml(`You're invited: ${title}`)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(`You're invited: ${title}`)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ];
  return tags.join("\n    ");
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? "";

  // The built app shell — a real static file, so it's served directly
  // rather than hitting the SPA rewrite (or this function) again.
  const shellRes = await fetch(new URL("/index.html", url.origin));
  let html = await shellRes.text();

  let canonicalSlug = slug;
  let event = slug ? await fetchPublishedEvent(slug) : null;
  if (!event && slug) {
    const current = await resolveSlug(slug);
    if (current && current !== slug) {
      canonicalSlug = current;
      event = await fetchPublishedEvent(current);
    }
  }
  if (event) {
    // Replace the site-wide defaults (injected at build time from
    // .figma/make/site.json) rather than adding a second set — with
    // duplicates, which tag a crawler picks is up to the crawler.
    html = html
      .replace(/<title>[\s\S]*?<\/title>/i, "")
      .replace(/<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*"|name="description"|name="robots")[^>]*>\s*/gi, "")
      .replace("</head>", `    ${previewTags(event, `${url.origin}/i/${canonicalSlug}`)}\n  </head>`);
  }

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Short CDN cache so an organizer's edits (new cover photo, renamed
      // event) reach preview cards within minutes. Vercel purges this on
      // every deploy, so the shell's asset links never go stale.
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
