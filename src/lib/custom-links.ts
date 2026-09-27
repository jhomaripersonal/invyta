import { supabase } from "./supabase-client";

// Custom invitation links (supabase/add-custom-links.sql). The rules here
// mirror slug_is_valid() so the builder can explain problems as the
// organizer types; the database has the final say.

export const SLUG_MIN = 3;
export const SLUG_MAX = 60;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Friendly typing: "Elena & Marco 2027" → "elena-marco-2027".
export function normalizeSlugInput(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, SLUG_MAX);
}

export function slugProblem(slug: string): string | null {
  if (slug.length < SLUG_MIN) return `Use at least ${SLUG_MIN} characters.`;
  if (slug.length > SLUG_MAX) return `Use at most ${SLUG_MAX} characters.`;
  if (!SLUG_RE.test(slug)) return "Use lowercase letters, numbers and single hyphens, without a hyphen at the start or end.";
  return null;
}

export async function isSlugAvailable(slug: string, eventId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("slug_available", { p_slug: slug, p_event_id: eventId });
  return !error && data === true;
}

export async function setEventSlug(eventId: string, slug: string): Promise<void> {
  const { error } = await supabase.from("events").update({ slug, updated_at: new Date().toISOString() }).eq("id", eventId);
  if (error) {
    const known = /already taken|Premium plan|lowercase letters/.test(error.message);
    throw new Error(known ? error.message : "Couldn't change the link. Please try again.");
  }
}

// The current link an address should go to — itself if live, or the new
// link an old one now points to. null if unknown or unpublished.
export async function resolveEventSlug(slug: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("resolve_event_slug", { p_slug: slug });
  return error || typeof data !== "string" ? null : data;
}

export function invitationUrl(slug: string): string {
  return `${window.location.origin}/i/${slug}`;
}
