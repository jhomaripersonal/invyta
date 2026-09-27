import { supabase } from "./supabase-client";

// User testimonials (supabase/add-testimonials.sql): an organizer shares
// one, with consent; it's public on the landing page only after an admin
// approves it, and editing it sends it back for review.

export type TestimonialStatus = "pending" | "approved" | "rejected";

export interface TestimonialInput {
  displayName: string;
  eventLabel?: string;
  quote: string;
  rating?: number;
}

export interface Testimonial extends TestimonialInput {
  id: string;
  status: TestimonialStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
}

export interface PublicTestimonial {
  id: string;
  displayName: string;
  eventLabel?: string;
  quote: string;
  rating?: number;
}

export const QUOTE_MIN = 10;
export const QUOTE_MAX = 400;

type Row = {
  id: string;
  display_name: string;
  event_label: string | null;
  quote: string;
  rating: number | null;
  status: TestimonialStatus;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
};

const fromRow = (r: Row): Testimonial => ({
  id: r.id,
  displayName: r.display_name,
  eventLabel: r.event_label ?? undefined,
  quote: r.quote,
  rating: r.rating ?? undefined,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  approvedAt: r.approved_at ?? undefined,
});

const toRow = (t: TestimonialInput) => ({
  display_name: t.displayName.trim(),
  event_label: t.eventLabel?.trim() || null,
  quote: t.quote.trim(),
  rating: t.rating ?? null,
});

// The signed-in organizer's own testimonial (there's at most one).
export async function getMyTestimonial(userId: string): Promise<Testimonial | null> {
  const { data } = await supabase.from("testimonials").select("*").eq("user_id", userId).maybeSingle();
  return data ? fromRow(data as Row) : null;
}

// Consent is recorded by the database at the moment of saving (the caller
// must have the user tick the consent box first).
export async function saveMyTestimonial(existingId: string | null, input: TestimonialInput): Promise<void> {
  const { error } = existingId
    ? await supabase.from("testimonials").update(toRow(input)).eq("id", existingId)
    : await supabase.from("testimonials").insert({ ...toRow(input), consented_at: new Date().toISOString() });
  if (error) throw new Error(error.message.includes("Create an event") ? error.message : "Couldn't save your testimonial. Please try again.");
}

export async function deleteMyTestimonial(id: string): Promise<void> {
  const { error } = await supabase.from("testimonials").delete().eq("id", id);
  if (error) throw error;
}

// Public: approved testimonials, display fields only.
export async function listApprovedTestimonials(limit = 6): Promise<PublicTestimonial[]> {
  const { data, error } = await supabase.rpc("approved_testimonials", { p_limit: limit });
  if (error || !data) return [];
  return (data as Row[]).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    eventLabel: r.event_label ?? undefined,
    quote: r.quote,
    rating: r.rating ?? undefined,
  }));
}

// Admin moderation (RLS lets admins read and update every row).
export async function listTestimonials(status?: TestimonialStatus): Promise<Testimonial[]> {
  let query = supabase.from("testimonials").select("*").order("updated_at", { ascending: false }).limit(200);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as Row[]).map(fromRow);
}

export async function setTestimonialStatus(id: string, status: TestimonialStatus): Promise<void> {
  const { error } = await supabase.from("testimonials").update({ status }).eq("id", id);
  if (error) throw error;
}

// "Maria Santos" → "Maria S." — the default public name, so organizers
// don't publish their full name unless they choose to.
export function defaultDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}
