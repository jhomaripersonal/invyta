// Video link parsing (src/lib/video-embed.ts): which pasted links become
// embeds, and that the embed URL is always rebuilt from the parsed id.
// Run: pnpm test:unit
import { parseVideoUrl } from "../../src/lib/video-embed.ts";

let failures = 0;
let passes = 0;
const check = (label, ok, extra = "") => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${extra ? "  — " + extra : ""}`);
};
const yt = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&playsinline=1";

console.log("=== YouTube ===");
for (const link of [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123",
  "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://youtu.be/dQw4w9WgXcQ?si=abc",
  "youtu.be/dQw4w9WgXcQ",
  "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "https://www.youtube.com/live/dQw4w9WgXcQ",
]) {
  const v = parseVideoUrl(link);
  check(link, v?.provider === "youtube" && v.embedUrl === yt && !v.vertical && v.thumbnailUrl === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", v?.embedUrl);
}
const short = parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ");
check("Shorts are vertical", short?.provider === "youtube" && short.vertical);
check("Shorts use the original-aspect thumbnail, with the 4:3 one as fallback", short.thumbnailUrl.endsWith("/oardefault.jpg") && short.thumbnailFallbackUrl.endsWith("/hqdefault.jpg"));
check("uses the privacy-enhanced (no-cookie) domain", parseVideoUrl("https://youtu.be/dQw4w9WgXcQ").embedUrl.startsWith("https://www.youtube-nocookie.com/"));

console.log("\n=== Vimeo ===");
let v = parseVideoUrl("https://vimeo.com/123456789");
check("vimeo.com/<id>", v?.provider === "vimeo" && v.embedUrl === "https://player.vimeo.com/video/123456789?autoplay=1&dnt=1", v?.embedUrl);
v = parseVideoUrl("https://vimeo.com/123456789/abc123def4");
check("unlisted Vimeo keeps its hash", v?.embedUrl === "https://player.vimeo.com/video/123456789?autoplay=1&dnt=1&h=abc123def4", v?.embedUrl);
v = parseVideoUrl("https://player.vimeo.com/video/123456789?h=abc123");
check("player.vimeo.com link", v?.id === "123456789" && v.embedUrl.includes("h=abc123"));
check("Vimeo embeds with do-not-track", v.embedUrl.includes("dnt=1"));

console.log("\n=== Facebook ===");
v = parseVideoUrl("https://www.facebook.com/elenamarco/videos/1234567890123/");
check("page video", v?.provider === "facebook" && v.embedUrl.startsWith("https://www.facebook.com/plugins/video.php?href=") && !v.vertical, v?.embedUrl);
v = parseVideoUrl("https://www.facebook.com/watch/?v=1234567890123");
check("facebook.com/watch?v=", v?.provider === "facebook" && /watch\/?\?v=1234567890123/.test(decodeURIComponent(v.embedUrl)), v && decodeURIComponent(v.embedUrl));
check("fb.watch short link", parseVideoUrl("https://fb.watch/abcDEF123/")?.provider === "facebook");
check("Reels are vertical", parseVideoUrl("https://www.facebook.com/reel/1234567890123")?.vertical === true);
check("a Facebook profile (not a video) is rejected", parseVideoUrl("https://www.facebook.com/elenamarco") === null);

console.log("\n=== Rejected / safe ===");
for (const bad of [
  "",
  "not a link",
  "https://example.com/video.mp4",
  "https://evil.example/watch?v=dQw4w9WgXcQ",
  "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
  "javascript:alert(1)",
  "https://www.youtube.com/watch?v=too-short",
  "https://www.youtube.com/@channelname",
  "https://vimeo.com/channels/staffpicks",
]) {
  check(`rejected: ${JSON.stringify(bad)}`, parseVideoUrl(bad) === null);
}
const injected = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>');
check("junk after a valid id can't reach the embed URL", injected === null || !/[<>"]/.test(injected.embedUrl), injected?.embedUrl);
const fbInjected = parseVideoUrl("https://www.facebook.com/x/videos/123456789/?next=https://evil.example");
check("Facebook embed ignores extra query params", fbInjected && !decodeURIComponent(fbInjected.embedUrl).includes("evil.example"), fbInjected && decodeURIComponent(fbInjected.embedUrl));

console.log(failures === 0 ? `\nALL ${passes} VIDEO LINK CHECKS PASS` : `\n${failures} FAILURE(S), ${passes} passed`);
process.exitCode = failures === 0 ? 0 : 1;
