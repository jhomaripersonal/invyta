import { supabase } from "./supabase-client";

// The support inbox (supabase/add-admin.sql): anyone — organizers and
// guests without an account — can submit; admins read and triage.

export type SupportCategory = "question" | "billing" | "bug" | "report" | "privacy";
export type SupportStatus = "open" | "in_progress" | "resolved";

export const SUPPORT_CATEGORIES: { id: SupportCategory; label: string; hint: string }[] = [
  { id: "question", label: "General question", hint: "How something works, or help getting started" },
  { id: "billing", label: "Billing & payments", hint: "Upgrades, receipts, refunds" },
  { id: "bug", label: "Something isn't working", hint: "An error, or a page not behaving as expected" },
  { id: "report", label: "Report an invitation", hint: "Fake event, scam, harassment or other misuse" },
  { id: "privacy", label: "Privacy request", hint: "Access, correct or delete your personal data (incl. an RSVP)" },
];

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

export interface SupportRequestInput {
  name: string;
  email: string;
  category: SupportCategory;
  subject: string;
  message: string;
  pageUrl?: string;
}

export interface SupportRequest extends SupportRequestInput {
  id: string;
  userId?: string;
  // From an organizer on Pro (set by the database) — listed first.
  priority: boolean;
  status: SupportStatus;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

type Row = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  category: SupportCategory;
  subject: string;
  message: string;
  page_url: string | null;
  status: SupportStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  priority: boolean | null;
};

// No .select() after the insert: an anonymous submitter can't read the row
// back (the read policy is submitter-or-admin), and asking for it would
// make PostgREST reject the whole insert.
export async function submitSupportRequest(input: SupportRequestInput): Promise<void> {
  const { error } = await supabase.from("support_requests").insert({
    name: input.name.trim(),
    email: input.email.trim(),
    category: input.category,
    subject: input.subject.trim(),
    message: input.message.trim(),
    page_url: input.pageUrl?.trim() || null,
  });
  if (error) throw new Error(error.message.includes("Too many requests") ? error.message : "Couldn't send your message. Please try again.");
}

// Admin inbox. RLS returns every request to an admin (is_admin()).
export async function listSupportRequests(status?: SupportStatus): Promise<SupportRequest[]> {
  let query = supabase
    .from("support_requests")
    .select("*")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as Row[]).map((r) => ({
    id: r.id,
    userId: r.user_id ?? undefined,
    priority: r.priority ?? false,
    name: r.name,
    email: r.email,
    category: r.category,
    subject: r.subject,
    message: r.message,
    pageUrl: r.page_url ?? undefined,
    status: r.status,
    adminNote: r.admin_note ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at ?? undefined,
  }));
}

// The signed-in organizer's own requests, for Settings. Filtered by user id
// explicitly: RLS would already scope a regular user to their own, but for
// an admin it returns every request.
export async function listMySupportRequests(userId: string): Promise<SupportRequest[]> {
  const { data, error } = await supabase
    .from("support_requests")
    .select("id, category, subject, status, priority, created_at, updated_at, resolved_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error || !data) return [];
  return (data as Row[]).map((r) => ({
    id: r.id,
    userId,
    priority: r.priority ?? false,
    name: "",
    email: "",
    category: r.category,
    subject: r.subject,
    message: "",
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at ?? undefined,
  }));
}

export async function updateSupportRequest(id: string, patch: { status?: SupportStatus; adminNote?: string }): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.status) dbPatch.status = patch.status;
  if (patch.adminNote !== undefined) dbPatch.admin_note = patch.adminNote.trim() || null;
  const { error } = await supabase.from("support_requests").update(dbPatch).eq("id", id);
  if (error) throw error;
}
