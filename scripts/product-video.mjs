// Renders the product video (src/pages/ProductVideo.tsx) frame by frame,
// using the Chrome installed on this machine, in both of its formats, and
// lays a soundtrack under them: the voiceover over background music.
//
//   pnpm dev            (in another terminal, if it isn't running)
//   pnpm video          → product-video/invyta.mp4           (1920×1080)
//                          product-video/invyta-vertical.mp4  (1080×1920, TikTok/Reels)
//
// Each frame is set exactly (window.__setVideoTime) and screenshotted, so
// the result is smooth however slow the machine is. Encodes H.264 MP4 with
// the ffmpeg on PATH (or FFMPEG_PATH); without one it falls back to the
// ffmpeg Playwright downloads, which can only write silent VP8 WebM.
//
// The voiceover (VOICEOVER in ProductVideo.tsx) is spoken by Microsoft's
// neural voices through edge-tts (`pip install edge-tts`; on PATH or
// EDGE_TTS_PATH) — it needs an internet connection. The music is
// synthesized by scripts/video-music.mjs, and ducks under the voice.
//
// MOCKUP_BASE_URL   where the dev server is (default http://localhost:8443)
// VIDEO_FORMATS     which cuts to render (default landscape,vertical)
// VIDEO_FPS         frame rate (default 30)
// VIDEO_SECONDS     render only the first N seconds (for a quick check)
// VIDEO_VOICE       edge-tts voice (default en-US-AvaNeural; also e.g.
//                   en-US-AndrewNeural, en-PH-RosaNeural), or "none" for silent
// VIDEO_VOICE_RATE  speaking rate (default +5%)
// VIDEO_MUSIC       an audio file to use instead of the generated music
//                   (looped and faded to fit), or "none" for no music
// VIDEO_MUSIC_GAIN  music level under the voice, in dB (default -14)
// VIDEO_THUMBNAIL_AT  second to take each format's -thumbnail.jpg from
//                   (default 10.5, the hero scene)
// VIDEO_REUSE_FRAMES=1  keep the last silent renders and only redo the audio
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { renderMusic } from "./video-music.mjs";

const BASE = process.env.MOCKUP_BASE_URL ?? "http://localhost:8443";
const FORMATS = (process.env.VIDEO_FORMATS ?? "landscape,vertical").split(",").map((f) => f.trim());
const FPS = Number(process.env.VIDEO_FPS ?? 30);
const VOICE = process.env.VIDEO_VOICE ?? "en-US-AvaNeural";
const VOICE_RATE = process.env.VIDEO_VOICE_RATE ?? "+5%";
const MUSIC = process.env.VIDEO_MUSIC ?? "generated";
const MUSIC_GAIN = Number(process.env.VIDEO_MUSIC_GAIN ?? -14);
const THUMBNAIL_AT = Number(process.env.VIDEO_THUMBNAIL_AT ?? 10.5);
const OUT_DIR = "product-video";

const works = (bin, args) => spawnSync(bin, args, { stdio: "ignore" }).status === 0;

function findFfmpeg() {
  const explicit = process.env.FFMPEG_PATH ?? "ffmpeg";
  if (works(explicit, ["-version"])) return { bin: explicit, full: true };
  const root =
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    {
      win32: join(process.env.LOCALAPPDATA ?? "", "ms-playwright"),
      darwin: join(homedir(), "Library/Caches/ms-playwright"),
    }[platform()] ??
    join(homedir(), ".cache/ms-playwright");
  const dirs = existsSync(root)
    ? readdirSync(root)
        .filter((d) => d.startsWith("ffmpeg-"))
        .sort()
        .reverse()
    : [];
  for (const dir of dirs) {
    for (const name of ["ffmpeg-win64.exe", "ffmpeg-linux", "ffmpeg-mac"]) {
      const bin = join(root, dir, name);
      if (existsSync(bin)) return { bin, full: false };
    }
  }
  throw new Error("No ffmpeg found. Install ffmpeg (or set FFMPEG_PATH), or run `npx playwright-core install ffmpeg`.");
}

function findEdgeTts() {
  const bin = process.env.EDGE_TTS_PATH ?? "edge-tts";
  return works(bin, ["--version"]) ? bin : null;
}

// Seconds of audio in a file, from ffmpeg's own report.
function mediaDuration(file) {
  const { stderr } = spawnSync(ffmpeg.bin, ["-hide_banner", "-i", file], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
  });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

// Seconds until the speech in a clip ends (edge-tts pads its clips with
// silence; that tail may overlap the next line).
function speechEnd(file) {
  const { stderr } = spawnSync(ffmpeg.bin, ["-hide_banner", "-i", file, "-af", "silencedetect=n=-45dB:d=0.3", "-f", "null", "-"], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
  });
  const total = mediaDuration(file);
  const lastStart = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].at(-1);
  if (!lastStart) return total;
  // The last silent stretch is the tail if it never ends, or ends with the file.
  const end = /silence_end: ([\d.]+)/.exec(stderr.slice(lastStart.index));
  return !end || Number(end[1]) >= total - 0.05 ? Number(lastStart[1]) : total;
}

function run(bin, args) {
  const r = spawnSync(bin, args, { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`${bin} exited with ${r.status}`);
}

const ffmpeg = findFfmpeg();
const codec = ffmpeg.full
  ? ["-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
  : ["-c:v", "libvpx", "-b:v", "12M", "-crf", "4", "-qmin", "0", "-qmax", "24", "-deadline", "good", "-cpu-used", "1", "-pix_fmt", "yuv420p"];
const name = (format) => (format === "landscape" ? "invyta" : `invyta-${format}`);
const silentPath = (format) => join(OUT_DIR, ffmpeg.full ? `${name(format)}-silent.mp4` : `${name(format)}.webm`);

// ─── Frames ───────────────────────────────────────────────────────────────
await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
let duration;
let voiceover;
try {
  for (const format of FORMATS) {
    const silent = silentPath(format);
    // Reduced motion stills the landing page's self-scrolling device scene;
    // everything else in the video is driven by the clock below.
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.goto(`${BASE}/product-video?capture&format=${format}`, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(() => typeof window.__setVideoTime === "function");
    const size = await page.evaluate(() => window.__videoSize);
    await page.setViewportSize({ width: size.w, height: size.h });
    duration = Math.min(Number(process.env.VIDEO_SECONDS ?? Infinity), await page.evaluate(() => window.__videoDuration));
    voiceover = (await page.evaluate(() => window.__voiceover ?? [])).filter((line) => line.start < duration);

    if (process.env.VIDEO_REUSE_FRAMES && existsSync(silent)) {
      console.log(`  reusing ${silent}`);
      await page.close();
      continue;
    }

    // Every scene is mounted from the start; load all of their images now.
    const settle = () =>
      page.evaluate(async () => {
        document.querySelectorAll("img[loading=lazy]").forEach((img) => (img.loading = "eager"));
        await document.fonts.ready;
        const pending = [...document.images].filter((img) => !img.complete);
        await Promise.race([Promise.all(pending.map((img) => new Promise((r) => (img.onload = img.onerror = r)))), new Promise((r) => setTimeout(r, 8000))]);
      });
    await settle();

    const ff = spawn(ffmpeg.bin, ["-y", "-loglevel", "error", "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", String(FPS), "-i", "-", ...codec, silent], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    const done = new Promise((resolve, reject) => ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)))));

    const frames = Math.round(duration * FPS);
    const started = Date.now();
    for (let i = 0; i < frames; i++) {
      await page.evaluate((t) => window.__setVideoTime(t), i / FPS);
      // Palette changes swap images in; wait for any that are still loading.
      if (i % FPS === 0) await settle();
      const jpeg = await page.screenshot({ type: "jpeg", quality: 95 });
      if (!ff.stdin.write(jpeg)) await new Promise((r) => ff.stdin.once("drain", r));
      if (i % FPS === 0) process.stdout.write(`\r  ${format}: frame ${i}/${frames}  (${Math.round((Date.now() - started) / 1000)}s)`);
    }
    ff.stdin.end();
    await done;
    await page.close();
    console.log(`\n  ${silent}  (${duration}s, ${FPS} fps, ${size.w}×${size.h}, no audio)`);
  }
} finally {
  await browser.close();
}

if (!ffmpeg.full) {
  console.warn("  no soundtrack: Playwright's ffmpeg can't encode audio. Install ffmpeg (or set FFMPEG_PATH).");
  process.exit(0);
}

// ─── Soundtrack ───────────────────────────────────────────────────────────
// One mix for every format: the voiceover lines placed at their times, over
// music that dips while someone is speaking.
const audioDir = join(OUT_DIR, "audio");
await rm(audioDir, { recursive: true, force: true });
await mkdir(audioDir, { recursive: true });

let clips = [];
const edgeTts = findEdgeTts();
if (VOICE === "none" || voiceover.length === 0) {
  console.log("  no voiceover (VIDEO_VOICE=none)");
} else if (!edgeTts) {
  console.warn("  no voiceover: edge-tts not found. `pip install edge-tts` (or set EDGE_TTS_PATH).");
} else {
  clips = voiceover.map((line, i) => {
    const file = join(audioDir, `voice-${String(i + 1).padStart(2, "0")}.mp3`);
    run(edgeTts, ["--voice", VOICE, `--rate=${VOICE_RATE}`, "--text", line.text, "--write-media", file]);
    return { ...line, file, end: line.start + speechEnd(file) };
  });
  // A line that's still being spoken when the next starts (or the video
  // ends) needs a longer scene in SCENE_LENGTHS, or fewer words.
  clips.forEach((clip, i) => {
    const next = clips[i + 1]?.start ?? duration;
    const flag = clip.end > next - 0.15 ? "  ← runs into the next line; lengthen its scene" : "";
    console.log(`  ${clip.start.toFixed(1).padStart(5)}–${clip.end.toFixed(1).padEnd(5)} ${clip.text}${flag}`);
  });
}

let music = null;
if (MUSIC === "generated") {
  music = join(audioDir, "music.wav");
  await writeFile(music, renderMusic(duration));
} else if (MUSIC !== "none") {
  if (!existsSync(MUSIC)) throw new Error(`VIDEO_MUSIC: no such file ${MUSIC}`);
  music = MUSIC;
}

const soundtrack = join(audioDir, "soundtrack.wav");
if (clips.length || music) {
  const inputs = [...clips.flatMap((clip) => ["-i", clip.file]), ...(music ? ["-stream_loop", "-1", "-i", music] : [])];
  const fmt = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
  const graph = [];
  if (clips.length) {
    clips.forEach((clip, i) => graph.push(`[${i}:a]${fmt},adelay=${Math.round(clip.start * 1000)}:all=1[v${i}]`));
    graph.push(`${clips.map((_, i) => `[v${i}]`).join("")}amix=inputs=${clips.length}:normalize=0,apad=whole_dur=${duration}[voice]`);
  }
  if (music) {
    // A supplied track is looped to length; both kinds fade at the edges.
    graph.push(`[${clips.length}:a]${fmt},atrim=0:${duration},afade=t=in:d=0.5,afade=t=out:st=${Math.max(0, duration - 2.5)}:d=2.5,volume=${MUSIC_GAIN}dB[bed]`);
  }
  if (clips.length && music) {
    graph.push("[voice]asplit=2[vo][key]");
    // Duck the music ~6 dB while the voice is speaking.
    graph.push("[bed][key]sidechaincompress=threshold=0.02:ratio=4:attack=60:release=700:makeup=1[ducked]");
    graph.push("[vo][ducked]amix=inputs=2:normalize=0:duration=first[mix]");
  } else {
    graph.push(`[${clips.length ? "voice" : "bed"}]anull[mix]`);
  }
  // -14 LUFS: the level TikTok, Instagram and YouTube play everything at.
  graph.push(`[mix]atrim=0:${duration},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[out]`);
  run(ffmpeg.bin, ["-y", "-loglevel", "error", ...inputs, "-filter_complex", graph.join(";"), "-map", "[out]", "-c:a", "pcm_s16le", soundtrack]);
}

// ─── Thumbnails ───────────────────────────────────────────────────────────
// The hero scene once the laptop and phone have settled: the landing
// page's poster, and a custom thumbnail for Facebook/YouTube uploads.
for (const format of FORMATS) {
  const thumb = join(OUT_DIR, `${name(format)}-thumbnail.jpg`);
  const at = Math.min(THUMBNAIL_AT, Math.max(0, duration - 0.5));
  run(ffmpeg.bin, ["-y", "-loglevel", "error", "-ss", String(at), "-i", silentPath(format), "-frames:v", "1", "-q:v", "2", thumb]);
  console.log(`  ${thumb}`);
}

// ─── Final videos ─────────────────────────────────────────────────────────
for (const format of FORMATS) {
  const out = join(OUT_DIR, `${name(format)}.mp4`);
  if (existsSync(soundtrack)) {
    run(ffmpeg.bin, [
      "-y",
      "-loglevel",
      "error",
      "-i",
      silentPath(format),
      "-i",
      soundtrack,
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      out,
    ]);
  } else {
    run(ffmpeg.bin, ["-y", "-loglevel", "error", "-i", silentPath(format), "-c", "copy", out]);
  }
  const parts = [clips.length && `voice: ${VOICE}`, music && `music: ${MUSIC === "generated" ? "generated" : MUSIC}`].filter(Boolean);
  console.log(`  ${out}  (${parts.join(", ") || "no audio"})`);
}
