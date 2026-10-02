import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase-client";
import { useAuth } from "./auth-context";
import type { EventCategory, EventStatus, InvitationConfig, PlanTier } from "../types/models";
import { createDefaultInvitation, SECTION_ORDER } from "../data/default-invitation";
import { TEMPLATE_DESIGNS } from "../data/landing-template-previews";
import { TEMPLATES } from "../data/templates";

// UI-facing record: the spec's EventEntity (models.ts) plus display-only
// aggregates that the `guests_after_change` trigger (supabase/schema.sql)
// keeps up to date server-side.
export interface EventRecord {
  id: string;
  ownerId: string;
  name: string;
  category: EventCategory;
  host: string;
  date: string;
  time: string;
  venueName: string;
  venueAddress: string;
  description?: string;
  dressCode?: string;
  contactDetails?: string;
  status: EventStatus;
  templateId?: string;
  slug: string;
  imageUrl: string;
  guestCount: number;
  confirmedGuestCount: number;
  pendingGuestCount: number;
  invitation: InvitationConfig;
  // The plan purchased for this event (billing is per event).
  plan: PlanTier;
  // The event's *effective* plan — the higher of `plan` and the organizer's
  // account plan (see events.owner_plan in schema.sql). Every feature gate
  // and limit for this event reads this, as does the public page's
  // Free watermark.
  ownerPlan: PlanTier;
  createdAt: string;
  updatedAt: string;
}

export interface NewEventInput {
  name: string;
  category: EventCategory;
  host: string;
  date: string;
  time: string;
  venueName: string;
  venueAddress: string;
  description?: string;
  dressCode?: string;
  contactDetails?: string;
  templateId?: string;
}

const CATEGORY_IMAGE: Partial<Record<EventCategory, string>> = {
  wedding: "photo-1519741497674-611481863552",
  debut: "photo-1566633806327-68e152aaf26d",
  birthday: "photo-1464349153735-7db50ed83c84",
  baptism: "photo-1515488042361-ee00e0ddd4e4",
  company_party: "photo-1454165804606-c3d57bc86b40",
};
const DEFAULT_IMAGE = "photo-1511285560929-80b456fea0bc";

// snake_case DB row <-> camelCase EventRecord.
type EventRow = {
  id: string;
  owner_id: string;
  name: string;
  category: EventCategory;
  host: string | null;
  date: string | null;
  time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  description: string | null;
  dress_code: string | null;
  contact_details: string | null;
  status: EventStatus;
  template_id: string | null;
  slug: string;
  image_url: string | null;
  guest_count: number;
  confirmed_guest_count: number;
  pending_guest_count: number;
  invitation: InvitationConfig | Record<string, never> | null;
  plan: PlanTier;
  owner_plan: PlanTier;
  created_at: string;
  updated_at: string;
};

function isInvitationConfig(value: unknown): value is InvitationConfig {
  return !!value && typeof value === "object" && Array.isArray((value as InvitationConfig).sections);
}

// Invitations saved before a section type existed (e.g. Video) get it added,
// switched off and placed last, so the builder lists it and the invitation
// itself looks exactly as before. A section type the app no longer knows
// (e.g. one removed after being saved) is dropped — there's no renderer or
// editor for it, and rendering it would crash the whole invitation.
function withAllSections(config: InvitationConfig): InvitationConfig {
  const known = new Set<string>(SECTION_ORDER);
  const sections = config.sections.filter((s) => known.has(s.type));
  const present = new Set(sections.map((s) => s.type));
  const missing = SECTION_ORDER.filter((t) => !present.has(t));
  if (missing.length === 0 && sections.length === config.sections.length) return config;
  const nextOrder = Math.max(-1, ...sections.map((s) => s.order)) + 1;
  return {
    ...config,
    sections: [...sections, ...missing.map((type, i) => ({ type, enabled: false, order: nextOrder + i, content: {} }))],
  };
}

function fromRow(row: EventRow): EventRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    category: row.category,
    host: row.host ?? "",
    date: row.date ?? "",
    time: row.time ? row.time.slice(0, 5) : "",
    venueName: row.venue_name ?? "",
    venueAddress: row.venue_address ?? "",
    description: row.description ?? undefined,
    dressCode: row.dress_code ?? undefined,
    contactDetails: row.contact_details ?? undefined,
    status: row.status,
    templateId: row.template_id ?? undefined,
    slug: row.slug,
    imageUrl: row.image_url ?? DEFAULT_IMAGE,
    guestCount: row.guest_count,
    confirmedGuestCount: row.confirmed_guest_count,
    pendingGuestCount: row.pending_guest_count,
    // Defensive fallback — new events always get a real config seeded at
    // creation (see createEvent below), but the column's own DB default is
    // an empty object, so any row that somehow slipped through gets one
    // materialized on read instead of crashing the builder/public page.
    invitation: isInvitationConfig(row.invitation)
      ? withAllSections(row.invitation)
      : createDefaultInvitation({
          name: row.name,
          category: row.category,
          host: row.host ?? undefined,
          description: row.description ?? undefined,
          venueName: row.venue_name ?? undefined,
          venueAddress: row.venue_address ?? undefined,
          dressCode: row.dress_code ?? undefined,
          contactDetails: row.contact_details ?? undefined,
        }),
    plan: row.plan ?? "free",
    ownerPlan: row.owner_plan ?? "free",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

interface EventsContextValue {
  events: EventRecord[];
  isLoading: boolean;
  getEvent: (id: string) => EventRecord | undefined;
  getEventById: (id: string) => Promise<EventRecord | null>;
  getEventBySlug: (slug: string) => Promise<EventRecord | null>;
  createEvent: (input: NewEventInput, options?: CreateEventOptions) => Promise<EventRecord>;
  updateEvent: (id: string, patch: Partial<NewEventInput> & { status?: EventStatus }) => Promise<void>;
  updateInvitation: (id: string, invitation: InvitationConfig) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

// upgradeFirst: upgrades the new event (e.g. spends a promo credit) after
// it's inserted but before its template is applied — the database only
// accepts a premium template on an event that already has the plan.
export interface CreateEventOptions {
  upgradeFirst?: (eventId: string) => Promise<void>;
}

const EventsContext = createContext<EventsContextValue | null>(null);

const patchKeyMap: Record<string, string> = {
  name: "name",
  category: "category",
  host: "host",
  date: "date",
  time: "time",
  venueName: "venue_name",
  venueAddress: "venue_address",
  description: "description",
  dressCode: "dress_code",
  contactDetails: "contact_details",
  templateId: "template_id",
  status: "status",
};

export function EventsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    if (!user) {
      setEvents([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    // Explicit owner filter, not just RLS: the "anyone can read published
    // events" policy is intentionally permissive (it's what lets the public
    // /i/:slug page work for anonymous visitors), so an unfiltered select
    // here would return every organizer's published events, not just this
    // user's own — RLS alone can't distinguish those two read patterns.
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (!error && data) setEvents((data as EventRow[]).map(fromRow));
    setIsLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function getEvent(id: string) {
    return events.find((e) => e.id === id);
  }

  async function getEventBySlug(slug: string): Promise<EventRecord | null> {
    const { data, error } = await supabase.from("events").select("*").eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    return fromRow(data as EventRow);
  }

  async function getEventById(id: string): Promise<EventRecord | null> {
    const { data, error } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return fromRow(data as EventRow);
  }

  async function createEvent(input: NewEventInput, options: CreateEventOptions = {}): Promise<EventRecord> {
    if (!user) throw new Error("Must be signed in to create an event.");
    // The chosen template decides the invitation's starting design and its
    // cover photo, so the event looks like the preview the organizer picked.
    const template = TEMPLATES.find((t) => t.id === input.templateId);
    const design = template ? TEMPLATE_DESIGNS[template.name] : undefined;
    if (options.upgradeFirst && template) {
      const plain = await createEvent({ ...input, templateId: undefined });
      await options.upgradeFirst(plain.id);
      const { error } = await supabase
        .from("events")
        .update({ template_id: template.id, image_url: template.img, invitation: createDefaultInvitation(input, design), updated_at: new Date().toISOString() })
        .eq("id", plain.id);
      if (error) throw error;
      await refresh();
      return (await getEventById(plain.id)) ?? plain;
    }
    const { data, error } = await supabase
      .from("events")
      .insert({
        owner_id: user.id,
        name: input.name,
        category: input.category,
        host: input.host,
        date: input.date || null,
        time: input.time || null,
        venue_name: input.venueName,
        venue_address: input.venueAddress,
        description: input.description || null,
        dress_code: input.dressCode || null,
        contact_details: input.contactDetails || null,
        template_id: input.templateId || null,
        status: "draft",
        slug: slugify(input.name),
        image_url: template?.img ?? CATEGORY_IMAGE[input.category] ?? DEFAULT_IMAGE,
        invitation: createDefaultInvitation(input, design),
      })
      .select()
      .single();
    if (error || !data) throw error ?? new Error("Failed to create event.");
    const record = fromRow(data as EventRow);
    setEvents((prev) => [record, ...prev]);
    if (options.upgradeFirst) {
      await options.upgradeFirst(record.id);
      await refresh();
    }
    return record;
  }

  async function updateEvent(id: string, patch: Partial<NewEventInput> & { status?: EventStatus }) {
    const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(patch)) {
      const dbKey = patchKeyMap[key];
      if (dbKey) dbPatch[dbKey] = value;
    }
    const { error } = await supabase.from("events").update(dbPatch).eq("id", id);
    if (error) throw error;
    await refresh();
  }

  async function updateInvitation(id: string, invitation: InvitationConfig) {
    const { error } = await supabase
      .from("events")
      .update({ invitation, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, invitation } : e)));
  }

  async function deleteEvent(id: string) {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) throw error;
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <EventsContext.Provider
      value={{ events, isLoading, getEvent, getEventById, getEventBySlug, createEvent, updateEvent, updateInvitation, deleteEvent, refresh }}
    >
      {children}
    </EventsContext.Provider>
  );
}

export function useEvents(): EventsContextValue {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error("useEvents must be used within EventsProvider");
  return ctx;
}
