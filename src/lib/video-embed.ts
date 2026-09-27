// Turns a pasted YouTube / Vimeo / Facebook link into what the invitation
// needs to show it: a privacy-friendly embed URL (loaded only when the
// guest taps play), a thumbnail where the platform offers one without an
// API call, and whether the video is vertical (Shorts / Reels).
//
// Only these three hosts are accepted, and the embed URL is always built
// from the parsed id — never from the pasted text — so a link can't be
// used to embed an arbitrary page in the invitation.

export type VideoProvider = "youtube" | "vimeo" | "facebook";

export interface VideoEmbed {
  provider: VideoProvider;
  id: string;
  embedUrl: string;
  thumbnailUrl?: string;
  // Used if thumbnailUrl fails to load (see the Shorts note below).
  thumbnailFallbackUrl?: string;
  vertical: boolean;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function parseUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

function youtube(url: URL): VideoEmbed | null {
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  let vertical = false;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, first, second] = url.pathname.split("/");
    if (first === "watch") id = url.searchParams.get("v");
    else if (first === "shorts") {
      id = second;
      vertical = true;
    } else if (first === "embed" || first === "live" || first === "v") id = second;
  }
  if (!id || !YT_ID.test(id)) return null;
  return {
    provider: "youtube",
    id,
    // Privacy-enhanced mode: no YouTube cookies until the video is played.
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`,
    // The standard thumbnail is always 4:3, which letterboxes a vertical
    // Short; Shorts also have an original-aspect one (oardefault).
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/${vertical ? "oardefault" : "hqdefault"}.jpg`,
    thumbnailFallbackUrl: vertical ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined,
    vertical,
  };
}

function vimeo(url: URL): VideoEmbed | null {
  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | undefined;
  let hash: string | undefined;
  if (host === "vimeo.com") {
    // vimeo.com/123456789, vimeo.com/123456789/abcdef (unlisted hash),
    // vimeo.com/channels/x/123456789
    const idx = parts.findIndex((p) => /^\d+$/.test(p));
    if (idx >= 0) {
      id = parts[idx];
      hash = parts[idx + 1] && /^[a-f0-9]+$/i.test(parts[idx + 1]) ? parts[idx + 1] : undefined;
    }
  } else if (host === "player.vimeo.com" && parts[0] === "video" && /^\d+$/.test(parts[1] ?? "")) {
    id = parts[1];
    hash = url.searchParams.get("h") ?? undefined;
  }
  if (!id) return null;
  const params = new URLSearchParams({ autoplay: "1", dnt: "1" });
  if (hash && /^[a-f0-9]+$/i.test(hash)) params.set("h", hash);
  return { provider: "vimeo", id, embedUrl: `https://player.vimeo.com/video/${id}?${params}`, vertical: false };
}

function facebook(url: URL): VideoEmbed | null {
  const host = url.hostname.replace(/^(www\.|m\.|web\.)/, "");
  if (host !== "facebook.com" && host !== "fb.watch") return null;
  const path = url.pathname;
  const isVideo =
    host === "fb.watch" ||
    /\/videos\//.test(path) ||
    /^\/watch\/?$/.test(path) && !!url.searchParams.get("v") ||
    /^\/reel\//.test(path) ||
    /^\/share\/(v|r)\//.test(path);
  if (!isVideo) return null;
  // Facebook's video plugin takes the canonical page URL; rebuild it from
  // the parsed parts only (host, path, and the `v` param for /watch).
  const canonical = new URL(`https://${host === "fb.watch" ? "fb.watch" : "www.facebook.com"}${path}`);
  const v = url.searchParams.get("v");
  if (v && /^\d+$/.test(v)) canonical.searchParams.set("v", v);
  const id = (path.match(/(\d{6,})/)?.[1] ?? v ?? path.replace(/\W+/g, "")) || "video";
  return {
    provider: "facebook",
    id,
    embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(canonical.toString())}&show_text=false&autoplay=true`,
    vertical: /^\/(reel|share\/r)\//.test(path),
  };
}

export function parseVideoUrl(input: string): VideoEmbed | null {
  const url = parseUrl(input);
  if (!url || !/^https?:$/.test(url.protocol)) return null;
  return youtube(url) ?? vimeo(url) ?? facebook(url);
}

export const MAX_VIDEOS = 3;
