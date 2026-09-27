import { createContext, useContext, type ReactNode } from "react";
import { supabase } from "./supabase-client";
import type { GuestGroup } from "../types/models";

export type GuestRsvpStatus = "confirmed" | "declined" | "pending";

export interface GuestRecord {
  id: string;
  eventId: string;
  name: string;
  email?: string;
  phone?: string;
  groupName?: GuestGroup;
  rsvpStatus: GuestRsvpStatus;
  numberOfGuests: number;
  mealPreference?: string;
  message?: string;
  notes?: string;
  checkedIn: boolean;
  checkedInAt?: string;
  submittedAt: string;
  // Replies to custom RSVP questions, keyed by question id (Pro).
  answers: Record<string, string>;
  // How many people this guest may RSVP for (Pro; null = up to 20).
  maxPartySize?: number;
  // When the host last sent this guest a reminder.
  remindedAt?: string;
}

export interface RsvpInput {
  eventId: string;
  name: string;
  email?: string;
  phone?: string;
  attending: boolean;
  numberOfGuests: number;
  mealPreference?: string;
  message?: string;
  answers?: Record<string, string>;
}

export interface NewGuestInput {
  eventId: string;
  name: string;
  email?: string;
  phone?: string;
  groupName?: GuestGroup;
  numberOfGuests: number;
  notes?: string;
  maxPartySize?: number | null;
}

export interface GuestPatch {
  name?: string;
  email?: string | null;
  phone?: string | null;
  groupName?: GuestGroup | null;
  rsvpStatus?: GuestRsvpStatus;
  numberOfGuests?: number;
  notes?: string | null;
  maxPartySize?: number | null;
  remindedAt?: string | null;
}

// Fetched via a guest's personalized invitation link (spec §21) — a narrow,
// id-scoped read, not a general guests query, so it never exposes email/
// phone/notes/group (organizer-only fields) to the anonymous visitor.
export interface PersonalGuestInfo {
  id: string;
  eventId: string;
  name: string;
  rsvpStatus: GuestRsvpStatus;
  numberOfGuests: number;
  mealPreference?: string;
  message?: string;
  checkedIn: boolean;
  maxPartySize?: number;
  answers: Record<string, string>;
}

export interface PersonalRsvpInput {
  name: string;
  attending: boolean;
  numberOfGuests: number;
  mealPreference?: string;
  message?: string;
  answers?: Record<string, string>;
}

// A guest's own RSVP response, for the dashboard's notification bell.
export interface RecentResponse {
  id: string;
  eventId: string;
  eventName: string;
  name: string;
  rsvpStatus: "confirmed" | "declined";
  numberOfGuests: number;
  submittedAt: string;
}

type GuestRow = {
  id: string;
  event_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  group_name: string | null;
  rsvp_status: GuestRsvpStatus;
  number_of_guests: number;
  meal_preference: string | null;
  message: string | null;
  notes: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  submitted_at: string;
  answers: Record<string, unknown> | null;
  max_party_size: number | null;
  reminded_at: string | null;
};

// Only string answers, whatever the column holds.
function answersFrom(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"));
}

function fromRow(row: GuestRow): GuestRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    groupName: (row.group_name as GuestGroup) ?? undefined,
    rsvpStatus: row.rsvp_status,
    numberOfGuests: row.number_of_guests,
    mealPreference: row.meal_preference ?? undefined,
    message: row.message ?? undefined,
    notes: row.notes ?? undefined,
    checkedIn: row.checked_in,
    checkedInAt: row.checked_in_at ?? undefined,
    submittedAt: row.submitted_at,
    answers: answersFrom(row.answers),
    maxPartySize: row.max_party_size ?? undefined,
    remindedAt: row.reminded_at ?? undefined,
  };
}

const patchKeyMap: Record<string, string> = {
  name: "name",
  email: "email",
  phone: "phone",
  groupName: "group_name",
  rsvpStatus: "rsvp_status",
  numberOfGuests: "number_of_guests",
  notes: "notes",
  maxPartySize: "max_party_size",
  remindedAt: "reminded_at",
};

function toDbPatch(patch: GuestPatch): Record<string, unknown> {
  const dbPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const dbKey = patchKeyMap[key];
    if (dbKey) dbPatch[dbKey] = value;
  }
  return dbPatch;
}

interface GuestsContextValue {
  guestsForEvent: (eventId: string) => Promise<GuestRecord[]>;
  submitRsvp: (input: RsvpInput) => Promise<{ id: string }>;
  addGuest: (input: NewGuestInput) => Promise<GuestRecord>;
  addGuests: (inputs: NewGuestInput[]) => Promise<void>;
  recentResponses: (limit?: number) => Promise<RecentResponse[]>;
  updateGuest: (id: string, patch: GuestPatch) => Promise<void>;
  updateGuests: (ids: string[], patch: GuestPatch) => Promise<void>;
  deleteGuest: (id: string) => Promise<void>;
  deleteGuests: (ids: string[]) => Promise<void>;
  checkInGuest: (id: string) => Promise<void>;
  undoCheckIn: (id: string) => Promise<void>;
  getGuestPublic: (guestId: string) => Promise<PersonalGuestInfo | null>;
  updateGuestRsvp: (guestId: string, input: PersonalRsvpInput) => Promise<void>;
}

const GuestsContext = createContext<GuestsContextValue | null>(null);

export function GuestsProvider({ children }: { children: ReactNode }) {
  async function guestsForEvent(eventId: string): Promise<GuestRecord[]> {
    const { data, error } = await supabase.from("guests").select("*").eq("event_id", eventId);
    if (error || !data) return [];
    return (data as GuestRow[]).map(fromRow);
  }

  async function submitRsvp(input: RsvpInput): Promise<{ id: string }> {
    // Deliberately no .select() here: an anonymous RSVP submitter can insert
    // but can't read the row back (guests' SELECT policy is owner-only, for
    // real guest-to-guest privacy) — asking for one via .select() makes
    // Postgres reject the whole insert, since PostgREST's return=representation
    // needs that same SELECT visibility. Instead, we choose the row's id
    // ourselves so the caller (the confirmation screen, to show a QR code)
    // knows it immediately without needing to read anything back.
    const id = crypto.randomUUID();
    const { error } = await supabase.from("guests").insert({
      id,
      event_id: input.eventId,
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      rsvp_status: input.attending ? "confirmed" : "declined",
      number_of_guests: input.attending ? Math.max(1, input.numberOfGuests) : 0,
      meal_preference: input.mealPreference || null,
      message: input.message || null,
      answers: input.answers ?? {},
    });
    if (error) throw error;
    return { id };
  }

  async function addGuest(input: NewGuestInput): Promise<GuestRecord> {
    // Organizer-initiated, unlike submitRsvp — the owner CAN read back what
    // they just inserted (owner-only SELECT policy), so .select() is safe here.
    const { data, error } = await supabase
      .from("guests")
      .insert({
        event_id: input.eventId,
        name: input.name,
        email: input.email || null,
        phone: input.phone || null,
        group_name: input.groupName || null,
        rsvp_status: "pending",
        number_of_guests: input.numberOfGuests,
        notes: input.notes || null,
        max_party_size: input.maxPartySize ?? null,
      })
      .select()
      .single();
    if (error || !data) throw error ?? new Error("Failed to add guest.");
    return fromRow(data as GuestRow);
  }

  // CSV import: one insert statement for the whole batch, so it either all
  // lands or none of it does — a batch that would push a Free event past
  // its guest cap is rejected by the database as a unit, never half-added.
  async function addGuests(inputs: NewGuestInput[]): Promise<void> {
    if (inputs.length === 0) return;
    const { error } = await supabase.from("guests").insert(
      inputs.map((input) => ({
        event_id: input.eventId,
        name: input.name,
        email: input.email || null,
        phone: input.phone || null,
        group_name: input.groupName || null,
        rsvp_status: "pending",
        number_of_guests: input.numberOfGuests,
        notes: input.notes || null,
      })),
    );
    if (error) throw error;
  }

  // Latest confirmed/declined responses across all of the organizer's
  // events — RLS already scopes `guests` to the events they own, so no
  // owner filter is needed here. Pending rows are organizer-added guests
  // who haven't answered yet, not activity worth notifying about.
  async function recentResponses(limit = 10): Promise<RecentResponse[]> {
    const { data, error } = await supabase
      .from("guests")
      .select("id, event_id, name, rsvp_status, number_of_guests, submitted_at, events!inner(name)")
      .in("rsvp_status", ["confirmed", "declined"])
      .order("submitted_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((row) => {
      const events = row.events as { name: string } | { name: string }[] | null;
      const eventName = Array.isArray(events) ? events[0]?.name : events?.name;
      return {
        id: row.id,
        eventId: row.event_id,
        eventName: eventName ?? "",
        name: row.name,
        rsvpStatus: row.rsvp_status as "confirmed" | "declined",
        numberOfGuests: row.number_of_guests,
        submittedAt: row.submitted_at,
      };
    });
  }

  async function updateGuest(id: string, patch: GuestPatch): Promise<void> {
    const { error } = await supabase.from("guests").update(toDbPatch(patch)).eq("id", id);
    if (error) throw error;
  }

  // Bulk actions: one statement per batch, so a selection is changed
  // all-or-nothing. Batches keep the id list inside URL length limits.
  async function updateGuests(ids: string[], patch: GuestPatch): Promise<void> {
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from("guests").update(toDbPatch(patch)).in("id", ids.slice(i, i + 100));
      if (error) throw error;
    }
  }

  async function deleteGuest(id: string): Promise<void> {
    const { error } = await supabase.from("guests").delete().eq("id", id);
    if (error) throw error;
  }

  async function deleteGuests(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from("guests").delete().in("id", ids.slice(i, i + 100));
      if (error) throw error;
    }
  }

  async function checkInGuest(id: string): Promise<void> {
    const { error } = await supabase.from("guests").update({ checked_in: true, checked_in_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }

  async function undoCheckIn(id: string): Promise<void> {
    const { error } = await supabase.from("guests").update({ checked_in: false, checked_in_at: null }).eq("id", id);
    if (error) throw error;
  }

  // Anonymous-safe: routed through a SECURITY DEFINER RPC (see
  // supabase/schema.sql) rather than a table SELECT, since the guests
  // table's SELECT policy is owner-only. Knowing the exact guest id — the
  // personal link's token — is what authorizes this read.
  async function getGuestPublic(guestId: string): Promise<PersonalGuestInfo | null> {
    const { data, error } = await supabase.rpc("get_guest_public", { p_guest_id: guestId });
    if (error || !data || data.length === 0) return null;
    const row = data[0];
    return {
      id: row.id,
      eventId: row.event_id,
      name: row.name,
      rsvpStatus: row.rsvp_status,
      numberOfGuests: row.number_of_guests,
      mealPreference: row.meal_preference ?? undefined,
      message: row.message ?? undefined,
      checkedIn: row.checked_in,
      maxPartySize: row.max_party_size ?? undefined,
      answers: answersFrom(row.answers),
    };
  }

  // Updates the guest's existing row in place instead of inserting a new
  // one, so a personal link always maps back to the same id — keeping any
  // QR code already generated/printed for this guest (Phase 7) valid, and
  // avoiding a duplicate row for a guest the organizer already added.
  async function updateGuestRsvp(guestId: string, input: PersonalRsvpInput): Promise<void> {
    const { error } = await supabase.rpc("update_guest_rsvp", {
      p_guest_id: guestId,
      p_name: input.name,
      p_attending: input.attending,
      p_number_of_guests: input.numberOfGuests,
      p_meal_preference: input.mealPreference || null,
      p_message: input.message || null,
      p_answers: input.answers ?? {},
    });
    if (error) throw error;
  }

  return (
    <GuestsContext.Provider
      value={{ guestsForEvent, submitRsvp, addGuest, addGuests, recentResponses, updateGuest, updateGuests, deleteGuest, deleteGuests, checkInGuest, undoCheckIn, getGuestPublic, updateGuestRsvp }}
    >
      {children}
    </GuestsContext.Provider>
  );
}

export function useGuests(): GuestsContextValue {
  const ctx = useContext(GuestsContext);
  if (!ctx) throw new Error("useGuests must be used within GuestsProvider");
  return ctx;
}
