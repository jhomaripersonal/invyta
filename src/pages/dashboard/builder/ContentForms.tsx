import { useRef, useState, type ChangeEvent, type ReactElement } from "react";
import type { InvitationSectionType } from "../../../types/models";
import { useAuth } from "../../../lib/auth-context";
import { useEventPlan } from "../../../lib/event-plan-context";
import { uploadInvitationImage } from "../../../lib/storage";
import { galleryPhotoLimit, planAllows, planLabel } from "../../../data/plan-limits";
import { GALLERY_FILTERS, GALLERY_LAYOUTS, galleryFilter, galleryFilterStyle, galleryLayout, type GalleryLayout } from "../../../data/gallery-styles";
import { COVER_STYLES, coverStyle, type CoverStyle } from "../../../data/page-layouts";
import { SECTION_STYLES, sectionStyle } from "../../../data/section-styles";
import { MAX_VIDEOS, parseVideoUrl, type VideoProvider } from "../../../lib/video-embed";
import { MAX_QUESTIONS, type RsvpQuestion } from "../../../lib/rsvp-settings";
import { T } from "../../../lib/tokens";

const inputStyle = { border: `1px solid ${T.border}`, backgroundColor: T.white, color: T.charcoal };
const inputClass = "w-full px-3 py-2 rounded-lg text-sm outline-none";
const labelClass = "block text-xs font-semibold mb-1.5";

type Content = Record<string, unknown>;
type OnChange = (content: Content) => void;

function TextField({ label, value, onChange, multiline = false, placeholder }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  return (
    <div className="mb-4">
      <label className={labelClass} style={{ color: T.muted }}>{label}</label>
      {multiline ? (
        <textarea rows={4} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputClass} resize-none`} style={inputStyle} />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} style={inputStyle} />
      )}
    </div>
  );
}

// Real file upload (Supabase Storage), with a manual URL field kept
// alongside it as a quick path for an image already hosted elsewhere.
function ImageUploadField({ label, value, onChange, eventId }: { label: string; value: string; onChange: (url: string) => void; eventId: string }) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    setError("");
    try {
      onChange(await uploadInvitationImage(user.id, eventId, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that image.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mb-4">
      <label className={labelClass} style={{ color: T.muted }}>{label}</label>
      {value && (
        <div className="mb-2 rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}`, aspectRatio: "16/9" }}>
          <img src={value} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Image URL, or upload below" className={inputClass} style={inputStyle} />
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-60"
          style={{ border: `1px dashed ${T.border}`, color: T.accent }}
        >
          {uploading ? "Uploading..." : "Upload image"}
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")} className="text-xs font-medium" style={{ color: T.muted }}>
            Remove
          </button>
        )}
      </div>
      {error && <p className="text-xs mt-1.5" style={{ color: T.red }}>{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}

// Tiny schematic of each gallery layout for the picker tiles — 36x28
// boxes standing in for photos, so the choice reads at a glance.
const LAYOUT_SKETCH: Record<GalleryLayout, ReactElement> = {
  masonry: <><rect x="1" y="1" width="16" height="15" rx="2" /><rect x="1" y="18" width="16" height="9" rx="2" /><rect x="19" y="1" width="16" height="8" rx="2" /><rect x="19" y="11" width="16" height="16" rx="2" /></>,
  grid: <><rect x="1" y="1" width="16" height="12" rx="2" /><rect x="19" y="1" width="16" height="12" rx="2" /><rect x="1" y="15" width="16" height="12" rx="2" /><rect x="19" y="15" width="16" height="12" rx="2" /></>,
  featured: <><rect x="1" y="1" width="34" height="17" rx="2" /><rect x="1" y="20" width="10.5" height="7" rx="1.5" /><rect x="12.75" y="20" width="10.5" height="7" rx="1.5" /><rect x="24.5" y="20" width="10.5" height="7" rx="1.5" /></>,
  slideshow: <><rect x="4" y="1" width="28" height="20" rx="2" /><circle cx="14" cy="25" r="1.5" /><circle cx="18" cy="25" r="1.5" /><circle cx="22" cy="25" r="1.5" /></>,
  polaroid: <><rect x="2" y="3" width="14" height="17" rx="1" transform="rotate(-6 9 11.5)" /><rect x="20" y="6" width="14" height="17" rx="1" transform="rotate(5 27 14.5)" /></>,
};

function PremiumTag() {
  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: T.accent, color: T.white }}>Premium</span>;
}

// Layout + filter pickers above the photo list. Premium options stay
// visible (so a Free organizer can see what they'd get) but can't be
// chosen; the database enforces the same rule on save.
function GalleryStylePicker({ content, onChange, previewUrl }: { content: Content; onChange: OnChange; previewUrl?: string }) {
  const canStyle = planAllows(useEventPlan(), "gallery_styles");
  const layout = galleryLayout(content);
  const filter = galleryFilter(content);

  return (
    <div className="mb-5">
      <label className={labelClass} style={{ color: T.muted }}>Layout</label>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {GALLERY_LAYOUTS.map((l) => {
          const locked = l.premium && !canStyle;
          const selected = layout === l.id;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => onChange({ ...content, layout: l.id })}
              disabled={locked}
              title={locked ? `${l.description} — included in Premium` : l.description}
              className="relative flex flex-col items-center gap-1.5 px-1 pt-2.5 pb-2 rounded-lg text-[11px] font-medium disabled:cursor-not-allowed"
              style={{
                border: `1.5px solid ${selected ? T.accent : T.border}`,
                backgroundColor: selected ? T.cream : T.white,
                color: locked ? T.muted : T.charcoal,
                opacity: locked ? 0.6 : 1,
              }}
            >
              <svg width="36" height="28" viewBox="0 0 36 28" fill="none" stroke={selected ? T.accent : T.muted} strokeWidth="1.4">
                {LAYOUT_SKETCH[l.id]}
              </svg>
              {l.label}
              {locked && <span className="absolute -top-2 -right-1"><PremiumTag /></span>}
            </button>
          );
        })}
      </div>

      <label className={labelClass} style={{ color: T.muted }}>Photo filter</label>
      <div className="grid grid-cols-4 gap-2">
        {GALLERY_FILTERS.map((f) => {
          const locked = f.premium && !canStyle;
          const selected = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange({ ...content, filter: f.id })}
              disabled={locked}
              className="relative flex flex-col items-center gap-1 disabled:cursor-not-allowed"
              style={{ opacity: locked ? 0.6 : 1 }}
            >
              <div
                className="w-full aspect-square rounded-lg overflow-hidden"
                style={{ border: `2px solid ${selected ? T.accent : T.border}` }}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="w-full h-full object-cover" style={galleryFilterStyle(f.id)} />
                ) : (
                  <div className="w-full h-full" style={{ background: "linear-gradient(135deg, #E8C5C1, #C9A66B 55%, #6B8F71)", ...galleryFilterStyle(f.id) }} />
                )}
              </div>
              <span className="text-[10px] font-medium leading-tight text-center" style={{ color: selected ? T.charcoal : T.muted }}>{f.label}</span>
              {locked && <span className="absolute -top-2 -right-1"><PremiumTag /></span>}
            </button>
          );
        })}
      </div>
      {!canStyle && (
        <p className="text-xs mt-3" style={{ color: T.muted }}>
          Featured, Slideshow and Polaroid layouts and photo filters are included in Premium.
        </p>
      )}
    </div>
  );
}

// Tiny schematic of each cover style (44x34): filled shapes are the
// photo, thin bars the title and date.
const COVER_SKETCH: Record<CoverStyle, ReactElement> = {
  full: <><rect x="1" y="1" width="42" height="32" rx="2" fill="currentColor" fillOpacity="0.35" /><rect x="12" y="22" width="20" height="2.5" rx="1" fill="currentColor" /><rect x="15" y="27" width="14" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.6" /></>,
  framed: <><path d="M15 20V11a7 7 0 0 1 14 0v9z" fill="currentColor" fillOpacity="0.35" /><path d="M13 21V11a9 9 0 0 1 18 0v10" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="0.75" /><rect x="13" y="25" width="18" height="2.5" rx="1" fill="currentColor" /><rect x="16" y="30" width="12" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.6" /></>,
  split: <><rect x="1" y="1" width="20" height="32" rx="2" fill="currentColor" fillOpacity="0.35" /><rect x="25" y="13" width="16" height="2.5" rx="1" fill="currentColor" /><rect x="27" y="18" width="12" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.6" /></>,
  monogram: <><circle cx="22" cy="12" r="9.5" fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="0.9" /><text x="22" y="15.5" textAnchor="middle" fontSize="9" fontFamily="Georgia, serif" fill="currentColor">E&amp;M</text><rect x="13" y="26" width="18" height="2.5" rx="1" fill="currentColor" /><rect x="16" y="31" width="12" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.6" /></>,
};

// Cover style picker at the top of the Cover tab. Like the gallery
// pickers, Premium styles stay visible but locked on lower plans; the
// database enforces the same rule on save.
function CoverStylePicker({ content, onChange }: { content: Content; onChange: OnChange }) {
  const canStyle = planAllows(useEventPlan(), "page_layouts");
  const current = coverStyle(content);
  return (
    <div className="mb-5">
      <label className={labelClass} style={{ color: T.muted }}>Cover style</label>
      <div className="grid grid-cols-2 gap-2">
        {COVER_STYLES.map((c) => {
          const locked = c.premium && !canStyle;
          const selected = current === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange({ ...content, style: c.id })}
              disabled={locked}
              title={locked ? `${c.description} — included in Premium` : c.description}
              className="relative flex flex-col items-center gap-1.5 px-1 pt-2.5 pb-2 rounded-lg text-[11px] font-medium disabled:cursor-not-allowed"
              style={{
                border: `1.5px solid ${selected ? T.accent : T.border}`,
                backgroundColor: selected ? T.cream : T.white,
                color: selected ? T.accent : T.muted,
                opacity: locked ? 0.6 : 1,
              }}
            >
              <svg width="44" height="34" viewBox="0 0 44 34" aria-hidden="true">{COVER_SKETCH[c.id]}</svg>
              <span style={{ color: locked ? T.muted : T.charcoal }}>{c.label}</span>
              {locked && <span className="absolute -top-2 -right-1"><PremiumTag /></span>}
            </button>
          );
        })}
      </div>
      {current === "monogram" && (
        <p className="text-[11px] mt-2" style={{ color: T.muted }}>The monogram uses the first letters of the title — e.g. "Elena & Marco" becomes E & M. No photo is shown.</p>
      )}
    </div>
  );
}

// Tiny schematics (44x34) for each section style, keyed "type:style".
const R = (x: number, y: number, w: number, h: number, o = 1, rx = 1) => <rect x={x} y={y} width={w} height={h} rx={rx} fill="currentColor" fillOpacity={o} />;
const SECTION_SKETCH: Record<string, ReactElement> = {
  "countdown:classic": <>{[4, 14, 24, 34].map((x) => <g key={x}>{R(x, 12, 7, 6)}{R(x, 21, 7, 1.5, 0.5)}</g>)}<path d="M12.5 11v11M22.5 11v11M32.5 11v11" stroke="currentColor" strokeOpacity="0.3" strokeWidth="0.6" /></>,
  "countdown:boxes": <>{[2, 12.5, 23, 33.5].map((x) => <g key={x}><rect x={x} y="8" width="9" height="16" rx="1.5" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.6" />{R(x + 2, 12, 5, 5)}{R(x + 2, 19.5, 5, 1.2, 0.5)}</g>)}</>,
  "countdown:minimal": <>{R(15, 4, 14, 14, 1, 2)}{R(12, 22, 20, 2.5, 0.8)}{R(14, 27, 16, 1.5, 0.5)}</>,
  "schedule:timeline": <>{[5, 15, 25].map((y) => <g key={y}><circle cx="7" cy={y} r="2.6" fill="none" stroke="currentColor" strokeWidth="0.8" />{R(13, y - 2.5, 14, 2)}{R(13, y + 1, 22, 1.2, 0.5)}</g>)}<path d="M7 8v4M7 18v4" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.6" /></>,
  "schedule:list": <>{[5, 15, 25].map((y) => <g key={y}>{R(3, y - 1.5, 9, 2.5, 0.8)}{R(16, y - 1.5, 16, 2)}{R(16, y + 1.8, 24, 1.2, 0.5)}</g>)}<path d="M3 10.5h38M3 20.5h38" stroke="currentColor" strokeOpacity="0.3" strokeWidth="0.5" /></>,
  "schedule:cards": <>{[[2, 3], [23, 3], [2, 18], [23, 18]].map(([x, y]) => <g key={`${x}-${y}`}><rect x={x} y={y} width="19" height="13" rx="1.5" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.35" strokeWidth="0.6" />{R(x + 2, y + 2, 7, 2.5, 0.9, 1.2)}{R(x + 2, y + 7, 13, 1.8, 0.7)}</g>)}</>,
  "venue:centered": <>{R(12, 7, 20, 2.5)}{R(9, 13, 26, 2, 0.8)}{R(13, 18, 18, 1.5, 0.5)}{R(15, 24, 14, 5, 0.8, 2)}</>,
  "venue:card": <><rect x="4" y="5" width="36" height="24" rx="2" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.6" /><circle cx="11" cy="13" r="3.2" fill="none" stroke="currentColor" strokeWidth="0.8" />{R(17, 10, 16, 2.2)}{R(17, 15, 19, 1.5, 0.5)}{R(17, 20, 11, 4, 0.8, 1.5)}</>,
  "venue:photo": <>{R(2, 3, 40, 28, 0.35, 2)}{R(6, 19, 18, 2.5)}{R(6, 24, 24, 1.5, 0.7)}</>,
  "venue:map": <><rect x="4" y="9" width="36" height="22" rx="1.5" fill="currentColor" fillOpacity="0.12" /><path d="M4 22l10-6 8 5 18-9" stroke="currentColor" strokeOpacity="0.5" strokeWidth="0.8" fill="none" /><path d="M26 14c0-2.2 1.8-4 4-4s4 1.8 4 4c0 3-4 6-4 6s-4-3-4-6z" fill="currentColor" />{R(13, 3, 18, 2.2)}</>,
  "story:centered": <>{R(14, 5, 16, 2.5)}{R(7, 11, 30, 1.5, 0.5)}{R(7, 15, 30, 1.5, 0.5)}{R(7, 19, 30, 1.5, 0.5)}{R(7, 23, 20, 1.5, 0.5)}</>,
  "story:quote": <><text x="5" y="16" fontSize="16" fontFamily="Georgia, serif" fill="currentColor" fillOpacity="0.5">&ldquo;</text>{R(8, 13, 30, 2.5, 0.9)}{R(8, 18, 26, 2.5, 0.9)}{R(8, 26, 12, 1.5, 0.6)}</>,
  "story:photo": <>{R(2, 3, 17, 28, 0.35, 1.5)}{R(23, 8, 14, 2.5)}{R(23, 14, 18, 1.3, 0.5)}{R(23, 18, 18, 1.3, 0.5)}{R(23, 22, 12, 1.3, 0.5)}</>,
};

// Style picker at the top of a section's tab (Countdown, Schedule, Venue,
// Story — see SECTION_STYLES). Premium styles stay visible but locked on
// lower plans; the database enforces the same rule on save.
function SectionStylePicker({ type, content, onChange }: { type: InvitationSectionType; content: Content; onChange: OnChange }) {
  const plan = useEventPlan();
  const options = SECTION_STYLES[type];
  if (!options) return null;
  const canStyle = planAllows(plan, "page_layouts");
  const current = sectionStyle(type, content);
  return (
    <div className="mb-5">
      <label className={labelClass} style={{ color: T.muted }}>Style</label>
      <div className={`grid gap-2 ${options.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
        {options.map((o) => {
          const locked = o.premium && !canStyle;
          const selected = current === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange({ ...content, style: o.id })}
              disabled={locked}
              title={locked ? `${o.description} — included in Premium` : o.description}
              className="relative flex flex-col items-center gap-1.5 px-1 pt-2.5 pb-2 rounded-lg text-[11px] font-medium disabled:cursor-not-allowed"
              style={{
                border: `1.5px solid ${selected ? T.accent : T.border}`,
                backgroundColor: selected ? T.cream : T.white,
                color: selected ? T.accent : T.muted,
                opacity: locked ? 0.6 : 1,
              }}
            >
              <svg width="44" height="34" viewBox="0 0 44 34" aria-hidden="true">{SECTION_SKETCH[`${type}:${o.id}`]}</svg>
              <span style={{ color: locked ? T.muted : T.charcoal }}>{o.label}</span>
              {locked && <span className="absolute -top-2 -right-1"><PremiumTag /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const PROVIDER_LABEL: Record<VideoProvider, string> = { youtube: "YouTube", vimeo: "Vimeo", facebook: "Facebook" };

// Video (Pro): up to MAX_VIDEOS links, each recognized as it's pasted so
// the organizer knows straight away whether it will play.
function VideoField({ content, onChange }: { content: Content; onChange: OnChange }) {
  const canUse = planAllows(useEventPlan(), "video");
  const videos = arr<{ url: string; title: string }>(content, "videos");

  if (!canUse) {
    return (
      <div className="rounded-xl p-4" style={{ border: `1px dashed ${T.border}`, backgroundColor: T.cream }}>
        <div className="mb-2"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: T.accent, color: T.white }}>Pro</span></div>
        <p className="text-sm font-semibold mb-1" style={{ color: T.charcoal }}>Add your prenup film or a video message</p>
        <p className="text-xs" style={{ color: T.muted }}>
          Show up to {MAX_VIDEOS} videos from YouTube, Vimeo or Facebook on your invitation. Video is included in Pro — use Upgrade in the toolbar.
        </p>
      </div>
    );
  }

  const set = (next: { url: string; title: string }[]) => onChange({ ...content, videos: next });
  const update = (i: number, patch: Partial<{ url: string; title: string }>) => set(videos.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));

  return (
    <div>
      <TextField label="Heading" value={str(content, "heading") || "Our Film"} onChange={(v) => onChange({ ...content, heading: v })} />
      {videos.map((v, i) => {
        const embed = v.url.trim() ? parseVideoUrl(v.url) : null;
        return (
          <div key={i} className="rounded-lg p-3 mb-3 relative" style={{ border: `1px solid ${T.border}` }}>
            <button
              onClick={() => set(videos.filter((_, idx) => idx !== i))}
              className="absolute top-2 right-2 text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-stone-100"
              style={{ color: T.muted }}
              aria-label="Remove video"
            >
              ✕
            </button>
            <label className="block text-[11px] font-medium mb-1 pr-6" style={{ color: T.muted }}>Video link {i + 1}</label>
            <input value={v.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="https://youtu.be/..." className={`${inputClass} mb-1.5`} style={inputStyle} />
            {v.url.trim() && (
              embed ? (
                <div className="flex items-center gap-2 mb-2">
                  {embed.thumbnailUrl && <img src={embed.thumbnailUrl} alt="" className="w-16 h-9 rounded object-cover" />}
                  <span className="text-[11px] font-semibold" style={{ color: "#2E7D55" }}>✓ {PROVIDER_LABEL[embed.provider]}{embed.vertical ? " · vertical" : ""}</span>
                </div>
              ) : (
                <p className="text-[11px] mb-2" style={{ color: T.red }}>Paste a YouTube, Vimeo or Facebook video link.</p>
              )
            )}
            <label className="block text-[11px] font-medium mb-1" style={{ color: T.muted }}>Title (optional)</label>
            <input value={v.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="e.g. Our prenup film" className={inputClass} style={inputStyle} />
          </div>
        );
      })}
      {videos.length < MAX_VIDEOS && (
        <button onClick={() => set([...videos, { url: "", title: "" }])} className="text-xs font-semibold px-3 py-2 rounded-lg w-full" style={{ border: `1px dashed ${T.border}`, color: T.accent }}>
          + Add video
        </button>
      )}
      <p className="text-[11px] mt-3" style={{ color: T.muted }}>
        Make sure the video is public or unlisted on YouTube/Vimeo, or public on Facebook. Guests see a thumbnail; the video loads when they press play.
      </p>
    </div>
  );
}

// Gallery's photo list, one upload field per photo — a bespoke layout
// rather than the generic RepeatableList below, since each row is a single
// image rather than a small set of text fields. Order matters (it's the
// Featured layout's hero and the Slideshow's first slide), so each row can
// be moved up or down.
function GalleryField({ imageUrls, onChange, eventId }: { imageUrls: string[]; onChange: (urls: string[]) => void; eventId: string }) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const plan = useEventPlan();
  const limit = galleryPhotoLimit(plan);
  const atLimit = limit !== null && imageUrls.length >= limit;
  const planName = planLabel(plan);

  function update(i: number, url: string) {
    const next = imageUrls.slice();
    next[i] = url;
    onChange(next);
  }
  function remove(i: number) {
    onChange(imageUrls.filter((_, idx) => idx !== i));
  }
  function move(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= imageUrls.length) return;
    const next = imageUrls.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  // Bulk path: pick several files at once and upload them one after another
  // (sequential, not parallel — keeps progress simple and doesn't hammer
  // Storage with a dozen simultaneous requests), appending each as it lands
  // rather than waiting for the whole batch, and reporting which — if any —
  // failed without losing the ones that succeeded.
  async function handleBulkFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0 || !user) return;
    // Trim the batch to the plan's remaining slots up front rather than
    // uploading everything and failing the save later — no point putting
    // files in Storage that can never be shown.
    const files = limit === null ? picked : picked.slice(0, Math.max(0, limit - imageUrls.length));
    const skipped = picked.length - files.length;
    setUploading(true);
    setError("");
    setProgress({ done: 0, total: files.length });
    const failed: string[] = [];
    // Accumulate locally rather than re-reading the `imageUrls` prop each
    // iteration — it's a closed-over value from the render that started
    // this run and won't reflect earlier onChange calls within this same
    // loop, so appending against it would only ever keep the last upload.
    let current = imageUrls.slice();
    for (const file of files) {
      try {
        const url = await uploadInvitationImage(user.id, eventId, file);
        current = [...current, url];
        onChange(current);
      } catch {
        failed.push(file.name);
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    const messages: string[] = [];
    if (failed.length > 0) messages.push(`Couldn't upload: ${failed.join(", ")}`);
    if (skipped > 0) messages.push(`Skipped ${skipped} — the ${planName} plan allows up to ${limit} photos.`);
    if (messages.length > 0) setError(messages.join(" "));
    setUploading(false);
    if (bulkInputRef.current) bulkInputRef.current.value = "";
  }

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: atLimit ? T.red : T.muted }}>
        {limit === null ? `${imageUrls.length} photos` : `${imageUrls.length} / ${limit} photos`}
      </p>
      {imageUrls.map((url, i) => (
        <div key={i} className="rounded-lg p-3 mb-3 relative" style={{ border: `1px solid ${T.border}` }}>
          <div className="absolute top-2 right-2 flex items-center gap-0.5">
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"
              style={{ color: T.muted }}
              aria-label="Move photo up"
            >
              ↑
            </button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === imageUrls.length - 1}
              className="text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"
              style={{ color: T.muted }}
              aria-label="Move photo down"
            >
              ↓
            </button>
            <button
              onClick={() => remove(i)}
              className="text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-stone-100"
              style={{ color: T.muted }}
              aria-label="Remove photo"
            >
              ✕
            </button>
          </div>
          <ImageUploadField label={`Photo ${i + 1}`} value={url} onChange={(v) => update(i, v)} eventId={eventId} />
        </div>
      ))}

      <button
        type="button"
        onClick={() => bulkInputRef.current?.click()}
        disabled={uploading || atLimit}
        className="text-xs font-semibold px-3 py-2.5 rounded-lg w-full disabled:opacity-60"
        style={{ border: `1px dashed ${T.border}`, color: T.accent }}
      >
        {uploading ? `Uploading ${progress.done}/${progress.total}...` : "+ Upload photos"}
      </button>
      <button
        type="button"
        onClick={() => onChange([...imageUrls, ""])}
        disabled={atLimit}
        className="text-xs font-medium px-3 py-2 rounded-lg w-full mt-1.5 disabled:opacity-60"
        style={{ color: T.muted }}
      >
        or add one by URL
      </button>
      {atLimit && (
        <p className="text-xs mt-1" style={{ color: T.muted }}>
          You've reached the {planName} plan's {limit}-photo limit. Upgrade in Billing to add more.
        </p>
      )}
      {error && <p className="text-xs mt-1" style={{ color: T.red }}>{error}</p>}
      <input ref={bulkInputRef} type="file" accept="image/*" multiple onChange={handleBulkFiles} className="hidden" />
    </div>
  );
}

function str(content: Content, key: string): string {
  const v = content[key];
  return typeof v === "string" ? v : "";
}

function arr<T>(content: Content, key: string): T[] {
  const v = content[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// One entry per line; blank lines are kept while typing and ignored by
// the invitation (see rsvpSettings).
function LinesField({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <textarea
      rows={3}
      aria-label={label}
      value={value.join("\n")}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.split("\n"))}
      className={`${inputClass} resize-none`}
      style={inputStyle}
    />
  );
}

function RsvpForm({ content, onChange }: { content: Content; onChange: OnChange }) {
  return (
    <>
      <TextField label="Prompt" value={str(content, "prompt")} onChange={(v) => onChange({ ...content, prompt: v })} />
      <div className="mb-4">
        <label className={labelClass} style={{ color: T.muted }} htmlFor="rsvp-deadline">Reply by (optional)</label>
        <div className="flex items-center gap-2">
          <input id="rsvp-deadline" type="date" value={str(content, "deadline")} onChange={(e) => onChange({ ...content, deadline: e.target.value })} className={inputClass} style={inputStyle} />
          {str(content, "deadline") && (
            <button type="button" onClick={() => onChange({ ...content, deadline: "" })} className="text-xs font-medium flex-shrink-0" style={{ color: T.muted }}>
              Clear
            </button>
          )}
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: T.muted }}>Guests see "Kindly reply by…". RSVPs close after that day; you can still add guests yourself.</p>
      </div>
      <RsvpQuestionsField content={content} onChange={onChange} />
    </>
  );
}

function RsvpQuestionsField({ content, onChange }: { content: Content; onChange: OnChange }) {
  const canUse = planAllows(useEventPlan(), "guest_tools");
  const questions = arr<RsvpQuestion>(content, "questions");

  if (!canUse) {
    return (
      <div className="rounded-xl p-4" style={{ border: `1px dashed ${T.border}`, backgroundColor: T.cream }}>
        <div className="mb-2"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: T.accent, color: T.white }}>Pro</span></div>
        <p className="text-sm font-semibold mb-1" style={{ color: T.charcoal }}>Ask your own RSVP questions</p>
        <p className="text-xs" style={{ color: T.muted }}>
          Song requests, parking, shirt sizes: add up to {MAX_QUESTIONS} questions, with answers in your guest list and export. Included in Pro — use Upgrade in the toolbar.
        </p>
      </div>
    );
  }

  const set = (next: RsvpQuestion[]) => onChange({ ...content, questions: next });
  const update = (i: number, patch: Partial<RsvpQuestion>) => set(questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  return (
    <div className="mb-2">
      <label className={labelClass} style={{ color: T.muted }}>Your questions</label>
      {questions.map((q, i) => (
        <div key={q.id} className="rounded-lg p-3 mb-3 relative" style={{ border: `1px solid ${T.border}` }}>
          <button
            onClick={() => set(questions.filter((_, idx) => idx !== i))}
            className="absolute top-2 right-2 text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-stone-100"
            style={{ color: T.muted }}
            aria-label="Remove question"
          >
            ✕
          </button>
          <label className="block text-[11px] font-medium mb-1 pr-6" style={{ color: T.muted }}>Question {i + 1}</label>
          <input value={q.label} onChange={(e) => update(i, { label: e.target.value })} maxLength={120} placeholder="e.g. Any song requests?" className={`${inputClass} mb-2`} style={inputStyle} />
          <div className="flex items-center gap-3 mb-2">
            <select value={q.type} onChange={(e) => update(i, { type: e.target.value === "choice" ? "choice" : "text" })} className="px-2 py-1.5 rounded-lg text-xs outline-none" style={inputStyle} aria-label="Answer type">
              <option value="text">Short answer</option>
              <option value="choice">Pick one</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs" style={{ color: T.charcoal }}>
              <input type="checkbox" checked={!!q.required} onChange={(e) => update(i, { required: e.target.checked })} />
              Required
            </label>
          </div>
          {q.type === "choice" && (
            <LinesField label="Choices" value={q.options ?? []} onChange={(options) => update(i, { options })} placeholder={"Choices, one per line\nYes\nNo"} />
          )}
        </div>
      ))}
      {questions.length < MAX_QUESTIONS && (
        <button
          onClick={() => set([...questions, { id: crypto.randomUUID().slice(0, 8), label: "", type: "text" }])}
          className="text-xs font-semibold px-3 py-2 rounded-lg w-full"
          style={{ border: `1px dashed ${T.border}`, color: T.accent }}
        >
          + Add question
        </button>
      )}
      <p className="text-[11px] mt-1.5" style={{ color: T.muted }}>Asked of guests who are attending.</p>
    </div>
  );
}

// Generic add/remove/edit list of small objects (schedule rows, FAQ pairs, etc).
function RepeatableList<T extends Record<string, string>>({
  items,
  onChange,
  fields,
  emptyItem,
  addLabel,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  fields: { key: keyof T; label: string; multiline?: boolean }[];
  emptyItem: T;
  addLabel: string;
}) {
  function update(i: number, key: keyof T, value: string) {
    const next = items.slice();
    next[i] = { ...next[i], [key]: value };
    onChange(next);
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-3 mb-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg p-3 relative" style={{ border: `1px solid ${T.border}` }}>
          <button
            onClick={() => remove(i)}
            className="absolute top-2 right-2 text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-stone-100"
            style={{ color: T.muted }}
            aria-label="Remove"
          >
            ✕
          </button>
          {fields.map((f) => (
            <div key={String(f.key)} className="mb-2 pr-6">
              <label className="block text-[11px] font-medium mb-1" style={{ color: T.muted }}>{f.label}</label>
              {f.multiline ? (
                <textarea rows={2} value={item[f.key] ?? ""} onChange={(e) => update(i, f.key, e.target.value)} className={`${inputClass} resize-none`} style={inputStyle} />
              ) : (
                <input value={item[f.key] ?? ""} onChange={(e) => update(i, f.key, e.target.value)} className={inputClass} style={inputStyle} />
              )}
            </div>
          ))}
        </div>
      ))}
      <button
        onClick={() => onChange([...items, emptyItem])}
        className="text-xs font-semibold px-3 py-2 rounded-lg w-full"
        style={{ border: `1px dashed ${T.border}`, color: T.accent }}
      >
        + {addLabel}
      </button>
    </div>
  );
}

export function ContentForm({ type, content, onChange, eventId }: { type: InvitationSectionType; content: Content; onChange: OnChange; eventId: string }) {
  switch (type) {
    case "cover":
      return (
        <>
          <CoverStylePicker content={content} onChange={onChange} />
          <ImageUploadField label="Cover photo" value={str(content, "imageUrl")} onChange={(v) => onChange({ ...content, imageUrl: v })} eventId={eventId} />
          <TextField label="Title" value={str(content, "title")} onChange={(v) => onChange({ ...content, title: v })} />
          <TextField label="Subtitle" value={str(content, "subtitle")} onChange={(v) => onChange({ ...content, subtitle: v })} />
          <TextField label="Host line" value={str(content, "hostLine")} onChange={(v) => onChange({ ...content, hostLine: v })} placeholder="Hosted by..." />
        </>
      );
    case "countdown":
      return (
        <>
          <SectionStylePicker type="countdown" content={content} onChange={onChange} />
          <p className="text-xs" style={{ color: T.muted }}>The countdown always counts down to the event's date and time.</p>
        </>
      );
    case "details":
      return <TextField label="Description" value={str(content, "description")} onChange={(v) => onChange({ ...content, description: v })} multiline />;
    case "story":
      return (
        <>
          <SectionStylePicker type="story" content={content} onChange={onChange} />
          {sectionStyle("story", content) === "photo" && (
            <ImageUploadField label="Story photo (defaults to the cover photo)" value={str(content, "imageUrl")} onChange={(v) => onChange({ ...content, imageUrl: v })} eventId={eventId} />
          )}
          <TextField label="Heading" value={str(content, "heading")} onChange={(v) => onChange({ ...content, heading: v })} />
          <TextField label="Story" value={str(content, "body")} onChange={(v) => onChange({ ...content, body: v })} multiline />
        </>
      );
    case "venue":
      return (
        <>
          <SectionStylePicker type="venue" content={content} onChange={onChange} />
          {sectionStyle("venue", content) === "photo" && (
            <ImageUploadField label="Venue photo (defaults to the cover photo)" value={str(content, "imageUrl")} onChange={(v) => onChange({ ...content, imageUrl: v })} eventId={eventId} />
          )}
          {sectionStyle("venue", content) === "map" && (
            <p className="text-[11px] mb-4" style={{ color: T.muted }}>The map is placed from the venue name and address below.</p>
          )}
          <TextField label="Venue name" value={str(content, "name")} onChange={(v) => onChange({ ...content, name: v })} />
          <TextField label="Address" value={str(content, "address")} onChange={(v) => onChange({ ...content, address: v })} />
          <TextField label="Map / directions link (optional)" value={str(content, "mapUrl")} onChange={(v) => onChange({ ...content, mapUrl: v })} placeholder="https://maps.google.com/..." />
        </>
      );
    case "schedule":
      return (
        <>
          <SectionStylePicker type="schedule" content={content} onChange={onChange} />
          <RepeatableList
            items={arr<{ time: string; title: string; description: string }>(content, "items")}
            onChange={(items) => onChange({ ...content, items })}
            fields={[{ key: "time", label: "Time" }, { key: "title", label: "Title" }, { key: "description", label: "Description", multiline: true }]}
            emptyItem={{ time: "", title: "", description: "" }}
            addLabel="Add schedule item"
          />
        </>
      );
    case "gallery": {
      const imageUrls = arr<string>(content, "imageUrls");
      return (
        <>
          <GalleryStylePicker content={content} onChange={onChange} previewUrl={imageUrls.find(Boolean)} />
          <GalleryField
            imageUrls={imageUrls}
            onChange={(next) => onChange({ ...content, imageUrls: next })}
            eventId={eventId}
          />
        </>
      );
    }
    case "video":
      return <VideoField content={content} onChange={onChange} />;
    case "dress_code":
      return <TextField label="Dress code" value={str(content, "description")} onChange={(v) => onChange({ ...content, description: v })} multiline />;
    case "entourage":
      return (
        <RepeatableList
          items={arr<{ role: string; names: string }>(content, "groups")}
          onChange={(groups) => onChange({ ...content, groups })}
          fields={[{ key: "role", label: "Role (e.g. Best Man)" }, { key: "names", label: "Name(s)" }]}
          emptyItem={{ role: "", names: "" }}
          addLabel="Add entourage role"
        />
      );
    case "gift_registry":
      return (
        <>
          <TextField label="Message" value={str(content, "message")} onChange={(v) => onChange({ ...content, message: v })} multiline />
          <RepeatableList
            items={arr<{ label: string; url: string }>(content, "links")}
            onChange={(links) => onChange({ ...content, links })}
            fields={[{ key: "label", label: "Link label" }, { key: "url", label: "URL" }]}
            emptyItem={{ label: "", url: "" }}
            addLabel="Add registry link"
          />
        </>
      );
    case "faq":
      return (
        <RepeatableList
          items={arr<{ question: string; answer: string }>(content, "items")}
          onChange={(items) => onChange({ ...content, items })}
          fields={[{ key: "question", label: "Question" }, { key: "answer", label: "Answer", multiline: true }]}
          emptyItem={{ question: "", answer: "" }}
          addLabel="Add question"
        />
      );
    case "rsvp":
      return <RsvpForm content={content} onChange={onChange} />;
    default:
      return null;
  }
}
