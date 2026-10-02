import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePromoCredit } from "../../lib/promo-credit";
import { planLabel } from "../../data/plan-limits";
import type { PaidPlan } from "../../data/pricing";
import { T } from "../../lib/tokens";
import { useDialog } from "../../components/useDialog";

// "Do you have a promo code?" — shown once to new organizers on the
// dashboard (test launch), and from Billing. Redeeming gives the account
// one free upgraded invitation; they pick which event gets it.
export default function PromoCodeModal({ onClose }: { onClose: () => void }) {
  const dialog = useDialog(onClose);
  const navigate = useNavigate();
  const promo = usePromoCredit();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [redeemed, setRedeemed] = useState<PaidPlan | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      setRedeemed(await promo.redeem(code));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't apply the promo code.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" style={{ backgroundColor: "rgba(28, 41, 66,0.45)" }} onClick={onClose}>
      <div {...dialog.props} className="outline-none w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: T.white }} onClick={(e) => e.stopPropagation()}>
        {redeemed ? (
          <div className="text-center py-2">
            <div className="text-3xl mb-2">🎉</div>
            <h2 id={dialog.titleId} className="text-lg font-bold mb-1" style={{ color: T.charcoal }}>You've got a free {planLabel(redeemed)} invitation</h2>
            <p className="text-sm mb-6" style={{ color: T.muted }}>
              Create your invitation and keep "Make this a {planLabel(redeemed)} invitation" ticked — or use it later on any event from its Upgrade button.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => navigate("/dashboard/events/new")}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90"
                style={{ backgroundColor: T.accent, color: T.white }}
              >
                Create my {planLabel(redeemed)} invitation
              </button>
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-100" style={{ border: `1px solid ${T.border}`, color: T.charcoal }}>
                Later
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex items-start justify-between gap-4 mb-1">
              <h2 id={dialog.titleId} className="text-lg font-bold" style={{ color: T.charcoal }}>Do you have a promo code?</h2>
              <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-stone-100" style={{ color: T.muted }} aria-label="Close">✕</button>
            </div>
            <p className="text-sm mb-5" style={{ color: T.muted }}>Enter it to get a free upgraded invitation.</p>
            <label htmlFor="promo-code-input" className="sr-only">Promo code</label>
            <input
              id="promo-code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Promo code"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none tracking-wide mb-2"
              style={{ border: `1px solid ${error ? T.red : T.border}`, color: T.charcoal }}
            />
            {error && <p className="text-xs mb-2" style={{ color: T.red }}>{error}</p>}
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-100" style={{ border: `1px solid ${T.border}`, color: T.charcoal }}>
                I don't have one
              </button>
              <button
                type="submit"
                disabled={submitting || !code.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: T.accent, color: T.white }}
              >
                {submitting ? "Applying..." : "Apply"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
