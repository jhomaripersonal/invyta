import { supabase } from "./supabase-client";

// Admin reporting RPCs (supabase/add-admin.sql). Each one checks
// is_admin() server-side and raises "Not authorized" otherwise.

export interface DayValue {
  day: string;
  value: number;
}

export interface AdminOverview {
  usersTotal: number;
  users7d: number;
  users30d: number;
  eventsTotal: number;
  eventsPublished: number;
  eventsPaid: number;
  guestsTotal: number;
  revenueTotalCentavos: number;
  revenue30dCentavos: number;
  paymentsPaid: number;
  paymentsPending: number;
  supportOpen: number;
  signupsByDay: DayValue[];
  revenueByDay: DayValue[];
  revenueByPlan: { plan: string; count: number; centavos: number }[];
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc("admin_overview");
  if (error || !data) throw error ?? new Error("No data");
  const d = data as Record<string, unknown>;
  const n = (k: string) => Number(d[k] ?? 0);
  return {
    usersTotal: n("users_total"),
    users7d: n("users_7d"),
    users30d: n("users_30d"),
    eventsTotal: n("events_total"),
    eventsPublished: n("events_published"),
    eventsPaid: n("events_paid"),
    guestsTotal: n("guests_total"),
    revenueTotalCentavos: n("revenue_total_centavos"),
    revenue30dCentavos: n("revenue_30d_centavos"),
    paymentsPaid: n("payments_paid"),
    paymentsPending: n("payments_pending"),
    supportOpen: n("support_open"),
    signupsByDay: ((d.signups_by_day as DayValue[]) ?? []).map((x) => ({ day: x.day, value: Number(x.value) })),
    revenueByDay: ((d.revenue_by_day as DayValue[]) ?? []).map((x) => ({ day: x.day, value: Number(x.value) })),
    revenueByPlan: ((d.revenue_by_plan as { plan: string; count: number; centavos: number }[]) ?? []).map((x) => ({
      plan: x.plan,
      count: Number(x.count),
      centavos: Number(x.centavos),
    })),
  };
}

export interface AdminPayment {
  id: string;
  createdAt: string;
  paidAt?: string;
  status: "pending" | "paid" | "expired" | "failed";
  plan: string;
  amountCentavos: number;
  paymentMethod?: string;
  description: string;
  userEmail?: string;
}

export async function fetchAdminPayments(status?: AdminPayment["status"]): Promise<AdminPayment[]> {
  const { data, error } = await supabase.rpc("admin_payments", { p_status: status ?? null, p_limit: 300 });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    createdAt: r.created_at as string,
    paidAt: (r.paid_at as string) ?? undefined,
    status: r.status as AdminPayment["status"],
    plan: r.plan as string,
    amountCentavos: Number(r.amount_centavos),
    paymentMethod: (r.payment_method as string) ?? undefined,
    description: r.description as string,
    userEmail: (r.user_email as string) ?? undefined,
  }));
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  events: number;
  paidCentavos: number;
}

export async function fetchAdminRecentUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc("admin_recent_users", { p_limit: 100 });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? "",
    email: r.email as string,
    createdAt: r.created_at as string,
    events: Number(r.events),
    paidCentavos: Number(r.paid_centavos),
  }));
}
