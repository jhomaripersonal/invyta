import { useState } from "react";
import { useEvents, type EventRecord } from "../../lib/events-store";
import { redeemPromoCode, startEventUpgrade } from "../../lib/payments";
import { PLAN_FEATURES, formatPeso, upgradePriceCentavos, type PaidPlan } from "../../data/pricing";
import { planAllows, planLabel } from "../../data/plan-limits";
import { T } from "../../lib/tokens";
import { useDialog } from "../../components/useDialog";

const PLAN_RANK = { free: 0, premium: 1, pro: 2, event_planner: 3 } as const;

// Upgrade ONE event (billing is per event). Picks Premium or Pro, shows
// the price (only the difference if the event already has Premium), then
// hands off to PayMongo's hosted checkout. The refund terms are stated
// here, before paying, as the compliance addendum requires. A single-use
// promo code (test launch) upgrades the event for free instead.
export default function UpgradeEventModal({ event, onClose }: { event: EventRecord; onClose: () => void }) {
  const dialog = useDialog(onClose);
  const { refresh } = useEvents();
  const options = (["premium", "pro"] as PaidPlan[]).filter((p) => PLAN_RANK[event.ownerPlan] < PLAN_RANK[p]);
  const [choice, setChoice] = useState<PaidPlan>(options.includes("premium") ? "premium" : "pro");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  // Set once a code is applied; the success view stays even after the
  // refreshed event no longer has any upgrade options.
  const [redeemedPlan, setRedeemedPlan] = useState<PaidPlan | null>(null);

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setRedeeming(true);
    setPromoError("");
    try {
      const plan = await redeemPromoCode(event.id, promoCode);
      setRedeemedPlan(plan);
      await refresh();
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : "Couldn't apply the promo code.");
    } finally {
      setRedeeming(false);
    }
  }

  async function handlePay() {
    setSubmitting(true);
    setError("");
    try {
      await startEventUpgrade(event.id, choice);
      // Navigates away to PayMongo on success.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" style={{ backgroundColor: "rgba(28, 41, 66,0.45)" }} onClick={onClose}>
      <div {...dialog.props} className="outline-none w-full max-w-lg rounded-2xl p-6 max-h-[92vh] overflow-y-auto" style={{ backgroundColor: T.white }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 id={dialog.titleId} className="text-lg font-bold" style={{ color: T.charcoal }}>Upgrade this event</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-stone-100" style={{ color: T.muted }} aria-label="Close">✕</button>
        </div>

        {redeemedPlan ? (
          <div className="py-6 text-center">
            <div className="text-3xl mb-2">🎉</div>
            <p className="text-base font-semibold mb-1" style={{ color: T.charcoal }}>{planLabel(redeemedPlan)} unlocked</p>
            <p className="text-sm mb-5" style={{ color: T.muted }}>
              Promo code applied to <span className="font-semibold" style={{ color: T.charcoal }}>{event.name}</span>. All its {planLabel(redeemedPlan)} features are ready to use.
            </p>
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90" style={{ backgroundColor: T.accent, color: T.white }}>
              Done
            </button>
          </div>
        ) : (
        <>
        <p className="text-sm mb-5" style={{ color: T.muted }}>
          <span className="font-semibold" style={{ color: T.charcoal }}>{event.name}</span> is on {planLabel(event.ownerPlan)}. Upgrades apply to this event only — a one-time payment, no subscription.
        </p>

        {options.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: T.muted }}>This event already has every feature.</p>
        ) : (
          <>
            <div className={`grid gap-3 mb-5 ${options.length > 1 ? "sm:grid-cols-2" : ""}`}>
              {options.map((p) => {
                const price = upgradePriceCentavos(event.plan, p);
                const selected = choice === p;
                return (
                  <button
                    key={p}
                    onClick={() => setChoice(p)}
                    className="text-left rounded-xl p-4 transition-all"
                    style={{ border: `2px solid ${selected ? T.accent : T.border}`, backgroundColor: selected ? T.cream : T.white }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold" style={{ color: T.charcoal }}>{planLabel(p)}</span>
                      <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ border: `1.5px solid ${selected ? T.accent : T.border}` }}>
                        {selected && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: T.accent }} />}
                      </span>
                    </div>
                    <div className="text-2xl font-bold mb-0.5" style={{ color: T.charcoal, letterSpacing: "-0.02em" }}>{formatPeso(price)}</div>
                    <div className="text-[11px] mb-3" style={{ color: T.muted }}>
                      {planAllows(event.plan, "analytics") && p === "pro" ? "the difference from Premium" : "one time, for this event"}
                    </div>
                    <ul className="space-y-1.5">
                      {PLAN_FEATURES[p].map((f) => (
                        <li key={f} className="flex items-start gap-2 text-xs" style={{ color: T.muted }}>
                          <span style={{ color: T.accent }}>✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {error && <p className="text-xs mb-3" style={{ color: T.red }}>{error}</p>}

            <button
              onClick={handlePay}
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: T.accent, color: T.white }}
            >
              {submitting ? "Opening secure checkout..." : `Pay ${formatPeso(upgradePriceCentavos(event.plan, choice))} with QR Ph`}
            </button>
            <p className="text-[11px] leading-relaxed mt-3" style={{ color: T.muted }}>
              Secure checkout by PayMongo — scan the QR with GCash, Maya or any bank app. Refundable within 24 hours if this invitation hasn't been
              published or sent to guests; non-refundable after that, except where the law requires otherwise. See our{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms</a>.
            </p>

            <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${T.border}` }}>
              {promoOpen ? (
                <form onSubmit={handleRedeem}>
                  <label htmlFor="promo-code" className="block text-xs font-semibold mb-1.5" style={{ color: T.charcoal }}>Promo code</label>
                  <div className="flex gap-2">
                    <input
                      id="promo-code"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="e.g. BETA-XXXX"
                      autoFocus
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={64}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm outline-none tracking-wide"
                      style={{ border: `1px solid ${promoError ? T.red : T.border}`, color: T.charcoal }}
                    />
                    <button
                      type="submit"
                      disabled={redeeming || !promoCode.trim()}
                      className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: T.charcoal, color: T.white }}
                    >
                      {redeeming ? "Applying..." : "Apply"}
                    </button>
                  </div>
                  {promoError && <p className="text-xs mt-2" style={{ color: T.red }}>{promoError}</p>}
                  <p className="text-[11px] mt-2" style={{ color: T.muted }}>Each code works once, for one event only.</p>
                </form>
              ) : (
                <button onClick={() => setPromoOpen(true)} className="text-xs font-semibold underline" style={{ color: T.muted }}>
                  Have a promo code?
                </button>
              )}
            </div>
          </>
        )}
        </>
        )}
      </div>
    </div>
  );
}
