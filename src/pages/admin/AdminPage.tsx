import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import webAppLogo from "../../assets/webApp-logo-mark.png";
import ColumnChart from "./ColumnChart";
import { fetchAdminOverview, fetchAdminPayments, fetchAdminRecentUsers, type AdminOverview, type AdminPayment, type AdminUser } from "../../lib/admin";
import { SUPPORT_CATEGORIES, SUPPORT_STATUS_LABELS, listSupportRequests, updateSupportRequest, type SupportRequest, type SupportStatus } from "../../lib/support";
import { paymentMethodLabel } from "../../lib/payments";
import { listTestimonials, setTestimonialStatus, type Testimonial, type TestimonialStatus } from "../../lib/testimonials";
import { formatPeso } from "../../data/pricing";
import { planLabel } from "../../data/plan-limits";
import type { PlanTier } from "../../types/models";
import { T } from "../../lib/tokens";

type Tab = "overview" | "sales" | "support" | "testimonials" | "users";

// Admin portal: app-wide numbers, sales, the support inbox and recent
// sign-ups. Reachable only for profiles with is_admin (see App.tsx), and
// every query behind it is re-checked server-side by is_admin().
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAdminOverview().then(setOverview).catch(() => setError("Couldn't load admin data. Make sure you're signed in as an admin."));
  }, []);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "sales", label: "Sales" },
    { id: "support", label: "Support", badge: overview?.supportOpen },
    { id: "testimonials", label: "Testimonials" },
    { id: "users", label: "Users" },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.cream, color: T.charcoal, fontFamily: "var(--font-sans)" }}>
      <header className="h-16 px-5 md:px-8 flex items-center justify-between" style={{ backgroundColor: T.white, borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-3">
          <img src={webAppLogo} alt="Invyta" className="h-8 w-auto" />
          <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ backgroundColor: T.accent, color: T.white }}>Admin</span>
        </div>
        <Link to="/dashboard" className="text-sm" style={{ color: T.muted }}>← Dashboard</Link>
      </header>

      <div className="max-w-6xl mx-auto px-5 md:px-8 py-7">
        <div className="flex gap-1 p-1 rounded-xl mb-7 w-fit max-w-full overflow-x-auto" style={{ backgroundColor: T.surface }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
              style={{ backgroundColor: tab === t.id ? T.white : "transparent", color: tab === t.id ? T.charcoal : T.muted, boxShadow: tab === t.id ? "0 1px 3px rgba(0,0,0,0.08)" : undefined }}
            >
              {t.label}
              {!!t.badge && <span className="text-[10px] font-bold min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center" style={{ backgroundColor: T.accent, color: T.white }}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {error && <p className="text-sm mb-6" style={{ color: T.red }}>{error}</p>}
        {tab === "overview" && <OverviewTab overview={overview} />}
        {tab === "sales" && <SalesTab />}
        {tab === "support" && <SupportTab />}
        {tab === "testimonials" && <TestimonialsTab />}
        {tab === "users" && <UsersTab />}
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────
function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: T.muted }}>{label}</div>
      <div className="text-3xl font-bold" style={{ letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: T.muted }}>{sub}</div>}
    </div>
  );
}

const count = (n: number) => n.toLocaleString("en-PH");

function OverviewTab({ overview: o }: { overview: AdminOverview | null }) {
  if (!o) return <p className="text-sm py-10 text-center" style={{ color: T.muted }}>Loading...</p>;
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatTile label="Users" value={count(o.usersTotal)} sub={`+${count(o.users30d)} in 30 days · +${count(o.users7d)} in 7`} />
        <StatTile label="Events" value={count(o.eventsTotal)} sub={`${count(o.eventsPublished)} published`} />
        <StatTile label="Paid events" value={count(o.eventsPaid)} sub={o.eventsTotal ? `${Math.round((o.eventsPaid / o.eventsTotal) * 100)}% of events` : undefined} />
        <StatTile label="Revenue" value={formatPeso(o.revenueTotalCentavos)} sub={`${formatPeso(o.revenue30dCentavos)} in 30 days`} />
        <StatTile label="Open support" value={count(o.supportOpen)} sub={`${count(o.guestsTotal)} guests across all events`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <ColumnChart title="Sign-ups" subtitle="New accounts per day, last 30 days" data={o.signupsByDay} format={(v) => count(Math.round(v))} />
        <ColumnChart title="Revenue" subtitle="Paid upgrades per day, last 30 days" data={o.revenueByDay} format={(v) => formatPeso(v)} />
      </div>

      <div className="rounded-2xl p-5" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
        <h3 className="text-sm font-semibold mb-3">Sales by plan (all time)</h3>
        {o.revenueByPlan.length === 0 ? (
          <p className="text-sm" style={{ color: T.muted }}>No paid upgrades yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs" style={{ color: T.muted }}>
                <th className="text-left font-medium pb-2">Plan</th>
                <th className="text-right font-medium pb-2">Upgrades</th>
                <th className="text-right font-medium pb-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {o.revenueByPlan.map((r) => (
                <tr key={r.plan} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td className="py-2">{planLabel(r.plan as PlanTier)}</td>
                  <td className="py-2 text-right tabular-nums">{count(r.count)}</td>
                  <td className="py-2 text-right tabular-nums">{formatPeso(r.centavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] mt-3" style={{ color: T.muted }}>
          {count(o.paymentsPaid)} paid · {count(o.paymentsPending)} pending checkouts. Days are in Philippine time.
        </p>
      </div>
    </div>
  );
}

// ─── Sales ────────────────────────────────────────────────────────────────
const PAYMENT_FILTERS: { id: AdminPayment["status"] | undefined; label: string }[] = [
  { id: undefined, label: "All" },
  { id: "paid", label: "Paid" },
  { id: "pending", label: "Pending" },
  { id: "expired", label: "Not completed" },
  { id: "failed", label: "Failed" },
];

const PAYMENT_STATUS_STYLE: Record<AdminPayment["status"], { label: string; color: string }> = {
  paid: { label: "Paid", color: T.green },
  pending: { label: "Pending", color: T.amber },
  expired: { label: "Not completed", color: T.muted },
  failed: { label: "Failed", color: T.red },
};

function StatusText({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function FilterChips<V>({ options, value, onChange }: { options: { id: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {options.map((o) => (
        <button
          key={o.label}
          onClick={() => onChange(o.id)}
          className="text-xs font-medium px-3 py-1.5 rounded-full"
          style={{ backgroundColor: value === o.id ? T.accent : T.white, color: value === o.id ? T.white : T.charcoal, border: `1px solid ${value === o.id ? T.accent : T.border}` }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SalesTab() {
  const [status, setStatus] = useState<AdminPayment["status"] | undefined>("paid");
  const [rows, setRows] = useState<AdminPayment[] | null>(null);

  useEffect(() => {
    setRows(null);
    fetchAdminPayments(status).then(setRows);
  }, [status]);

  const total = (rows ?? []).filter((r) => r.status === "paid").reduce((s, r) => s + r.amountCentavos, 0);

  return (
    <div>
      <FilterChips options={PAYMENT_FILTERS} value={status} onChange={setStatus} />
      {rows === null ? (
        <p className="text-sm py-10 text-center" style={{ color: T.muted }}>Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm py-10 text-center rounded-2xl" style={{ color: T.muted, backgroundColor: T.white, border: `1px dashed ${T.border}` }}>No payments here yet.</p>
      ) : (
        <div className="rounded-2xl overflow-x-auto" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-xs text-left" style={{ color: T.muted, borderBottom: `1px solid ${T.border}` }}>
                <th className="font-medium px-4 py-3">Date</th>
                <th className="font-medium px-4 py-3">Customer</th>
                <th className="font-medium px-4 py-3">Item</th>
                <th className="font-medium px-4 py-3">Method</th>
                <th className="font-medium px-4 py-3 text-right">Amount</th>
                <th className="font-medium px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td className="px-4 py-2.5 whitespace-nowrap">{new Date(r.paidAt ?? r.createdAt).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  <td className="px-4 py-2.5">{r.userEmail ?? <span style={{ color: T.muted }}>Deleted account</span>}</td>
                  <td className="px-4 py-2.5">{r.description}</td>
                  <td className="px-4 py-2.5">{paymentMethodLabel(r.paymentMethod)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatPeso(r.amountCentavos)}</td>
                  <td className="px-4 py-2.5"><StatusText {...PAYMENT_STATUS_STYLE[r.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && rows.some((r) => r.status === "paid") && (
        <p className="text-xs mt-3" style={{ color: T.muted }}>Paid total in this list: <span className="font-semibold" style={{ color: T.charcoal }}>{formatPeso(total)}</span> (latest 300 payments).</p>
      )}
    </div>
  );
}

// ─── Support inbox ────────────────────────────────────────────────────────
const SUPPORT_FILTERS: { id: SupportStatus | undefined; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "resolved", label: "Resolved" },
  { id: undefined, label: "All" },
];

const SUPPORT_STATUS_STYLE: Record<SupportStatus, string> = { open: T.red, in_progress: T.amber, resolved: T.green };

const categoryLabel = (id: string) => SUPPORT_CATEGORIES.find((c) => c.id === id)?.label ?? id;

function SupportTab() {
  const [status, setStatus] = useState<SupportStatus | undefined>("open");
  const [rows, setRows] = useState<SupportRequest[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setRows(await listSupportRequests(status));
  }

  useEffect(() => {
    setRows(null);
    setSelectedId(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const selected = rows?.find((r) => r.id === selectedId) ?? null;
  useEffect(() => {
    setNote(selected?.adminNote ?? "");
  }, [selected?.id, selected?.adminNote]);

  async function save(patch: { status?: SupportStatus; adminNote?: string }) {
    if (!selected) return;
    setSaving(true);
    try {
      await updateSupportRequest(selected.id, patch);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <FilterChips options={SUPPORT_FILTERS} value={status} onChange={setStatus} />
      {rows === null ? (
        <p className="text-sm py-10 text-center" style={{ color: T.muted }}>Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm py-10 text-center rounded-2xl" style={{ color: T.muted, backgroundColor: T.white, border: `1px dashed ${T.border}` }}>Nothing here — inbox zero.</p>
      ) : (
        <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-start">
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
            {rows.map((r, i) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className="w-full text-left px-4 py-3 block"
                style={{ borderTop: i ? `1px solid ${T.border}` : undefined, backgroundColor: r.id === selectedId ? T.surface : T.white }}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-sm font-medium truncate">
                    {r.priority && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: T.accent, color: T.white }}>Pro</span>}
                    {r.subject}
                  </span>
                  <StatusText label={SUPPORT_STATUS_LABELS[r.status]} color={SUPPORT_STATUS_STYLE[r.status]} />
                </div>
                <div className="text-xs truncate" style={{ color: T.muted }}>
                  {categoryLabel(r.category)} · {r.name} · {new Date(r.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                </div>
              </button>
            ))}
          </div>

          {selected ? (
            <div className="rounded-2xl p-5" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
              <div className="flex items-start justify-between gap-3 mb-1">
                <h3 className="font-semibold">{selected.subject}</h3>
                <StatusText label={SUPPORT_STATUS_LABELS[selected.status]} color={SUPPORT_STATUS_STYLE[selected.status]} />
              </div>
              <p className="text-xs mb-4" style={{ color: T.muted }}>
                {categoryLabel(selected.category)} · {selected.name} &lt;{selected.email}&gt;{selected.userId ? " · has an account" : " · no account"} ·{" "}
                {new Date(selected.createdAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed mb-4 p-3.5 rounded-xl" style={{ backgroundColor: T.cream }}>{selected.message}</p>
              {selected.pageUrl && (
                <p className="text-xs mb-4 break-all">
                  Link: <a href={selected.pageUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: T.accent }}>{selected.pageUrl}</a>
                </p>
              )}

              <div className="flex flex-wrap gap-2 mb-5">
                <a
                  href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.subject}`)}`}
                  className="text-xs font-semibold px-3.5 py-2 rounded-lg"
                  style={{ backgroundColor: T.accent, color: T.white }}
                >
                  Reply by email
                </a>
                {(["open", "in_progress", "resolved"] as SupportStatus[]).filter((s) => s !== selected.status).map((s) => (
                  <button key={s} onClick={() => save({ status: s })} disabled={saving} className="text-xs font-semibold px-3.5 py-2 rounded-lg disabled:opacity-60" style={{ border: `1px solid ${T.border}` }}>
                    Mark {SUPPORT_STATUS_LABELS[s].toLowerCase()}
                  </button>
                ))}
              </div>

              <label className="block text-xs font-semibold mb-1.5" style={{ color: T.muted }}>Internal note (admins only)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={5000} className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none mb-2" style={{ border: `1px solid ${T.border}`, backgroundColor: T.cream }} />
              <button onClick={() => save({ adminNote: note })} disabled={saving || note === (selected.adminNote ?? "")} className="text-xs font-semibold px-3.5 py-2 rounded-lg disabled:opacity-40" style={{ border: `1px solid ${T.border}` }}>
                {saving ? "Saving..." : "Save note"}
              </button>
              {selected.resolvedAt && <p className="text-[11px] mt-3" style={{ color: T.muted }}>Resolved {new Date(selected.resolvedAt).toLocaleString("en-PH")}</p>}
            </div>
          ) : (
            <p className="text-sm py-10 text-center rounded-2xl hidden md:block" style={{ color: T.muted, backgroundColor: T.white, border: `1px dashed ${T.border}` }}>Select a message to read it.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────
// Approve before anything reaches the landing page. Approving publishes it
// with the name and event line the organizer chose (and consented to);
// "Unpublish" takes an approved one down again.
const TESTIMONIAL_FILTERS: { id: TestimonialStatus | undefined; label: string }[] = [
  { id: "pending", label: "To review" },
  { id: "approved", label: "Published" },
  { id: "rejected", label: "Not published" },
  { id: undefined, label: "All" },
];

const TESTIMONIAL_STATUS_STYLE: Record<TestimonialStatus, { label: string; color: string }> = {
  pending: { label: "To review", color: T.amber },
  approved: { label: "Published", color: T.green },
  rejected: { label: "Not published", color: T.muted },
};

function TestimonialsTab() {
  const [status, setStatus] = useState<TestimonialStatus | undefined>("pending");
  const [rows, setRows] = useState<Testimonial[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setRows(await listTestimonials(status));
  }

  useEffect(() => {
    setRows(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function change(id: string, next: TestimonialStatus) {
    setBusyId(id);
    try {
      await setTestimonialStatus(id, next);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <FilterChips options={TESTIMONIAL_FILTERS} value={status} onChange={setStatus} />
      {rows === null ? (
        <p className="text-sm py-10 text-center" style={{ color: T.muted }}>Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm py-10 text-center rounded-2xl" style={{ color: T.muted, backgroundColor: T.white, border: `1px dashed ${T.border}` }}>Nothing here.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.map((t) => (
            <div key={t.id} className="rounded-2xl p-5 flex flex-col" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <StatusText {...TESTIMONIAL_STATUS_STYLE[t.status]} />
                <span className="text-[11px]" style={{ color: T.muted }}>
                  {new Date(t.updatedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              {t.rating && <div className="text-sm mb-1.5" style={{ color: "#C9A66B" }} aria-label={`${t.rating} of 5 stars`}>{"★".repeat(t.rating)}<span style={{ color: T.border }}>{"★".repeat(5 - t.rating)}</span></div>}
              <p className="text-sm leading-relaxed flex-1 mb-3">"{t.quote}"</p>
              <p className="text-xs mb-4" style={{ color: T.muted }}>— {t.displayName}{t.eventLabel ? `, ${t.eventLabel}` : ""}</p>
              <div className="flex flex-wrap gap-2">
                {t.status !== "approved" && (
                  <button onClick={() => change(t.id, "approved")} disabled={busyId === t.id} className="text-xs font-semibold px-3.5 py-2 rounded-lg disabled:opacity-60" style={{ backgroundColor: T.accent, color: T.white }}>
                    Approve & publish
                  </button>
                )}
                {t.status === "pending" && (
                  <button onClick={() => change(t.id, "rejected")} disabled={busyId === t.id} className="text-xs font-semibold px-3.5 py-2 rounded-lg disabled:opacity-60" style={{ border: `1px solid ${T.border}` }}>
                    Don't publish
                  </button>
                )}
                {t.status === "approved" && (
                  <button onClick={() => change(t.id, "rejected")} disabled={busyId === t.id} className="text-xs font-semibold px-3.5 py-2 rounded-lg disabled:opacity-60" style={{ border: `1px solid ${T.border}` }}>
                    Unpublish
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] mt-4" style={{ color: T.muted }}>
        Publish only genuine testimonials as written. Organizers consented to showing them with the name and event shown here; if they edit one it comes back for review.
      </p>
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────────
function UsersTab() {
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  useEffect(() => {
    fetchAdminRecentUsers().then(setRows);
  }, []);

  if (rows === null) return <p className="text-sm py-10 text-center" style={{ color: T.muted }}>Loading...</p>;
  return (
    <div>
      <p className="text-xs mb-3" style={{ color: T.muted }}>The 100 most recent sign-ups.</p>
      <div className="rounded-2xl overflow-x-auto" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="text-xs text-left" style={{ color: T.muted, borderBottom: `1px solid ${T.border}` }}>
              <th className="font-medium px-4 py-3">Name</th>
              <th className="font-medium px-4 py-3">Email</th>
              <th className="font-medium px-4 py-3">Joined</th>
              <th className="font-medium px-4 py-3 text-right">Events</th>
              <th className="font-medium px-4 py-3 text-right">Paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} style={{ borderTop: `1px solid ${T.border}` }}>
                <td className="px-4 py-2.5">{u.name || <span style={{ color: T.muted }}>—</span>}</td>
                <td className="px-4 py-2.5">{u.email}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{u.events}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{u.paidCentavos ? formatPeso(u.paidCentavos) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
