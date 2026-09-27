import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import webAppLogo from "../assets/webApp-logo-mark.png";
import { confirmPayment, type PaymentStatus } from "../lib/payments";
import { useEvents } from "../lib/events-store";

const T = { accent: "#1C2942", charcoal: "#1C2942", cream: "#FAF8F5", border: "#E7E1D8", muted: "#78716C", white: "#FFFFFF", green: "#4CAF7D" };

// PayMongo sends the organizer back here after checkout (?payment=<id>,
// plus &cancelled=1 from the cancel button). The URL alone proves
// nothing, so this asks the server to confirm with PayMongo, retrying for
// a little while since a GCash/Maya payment can take a few seconds to
// settle. The upgrade itself is applied server-side either way.
const MAX_ATTEMPTS = 15;
const RETRY_MS = 2000;

export default function PaymentReturnPage() {
  const [params] = useSearchParams();
  const paymentId = params.get("payment");
  const cancelled = params.get("cancelled") === "1";
  const { refresh } = useEvents();
  const [status, setStatus] = useState<PaymentStatus | "checking" | "error">("checking");
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!paymentId) {
      setStatus("error");
      return;
    }
    let cancelledLoop = false;
    (async () => {
      for (let attempt = 0; attempt < (cancelled ? 1 : MAX_ATTEMPTS); attempt++) {
        try {
          const result = await confirmPayment(paymentId);
          if (cancelledLoop) return;
          setEventId(result.eventId);
          if (result.status !== "pending") {
            setStatus(result.status);
            if (result.status === "paid") refresh();
            return;
          }
        } catch {
          // transient — keep trying until attempts run out
        }
        await new Promise((r) => setTimeout(r, RETRY_MS));
      }
      if (!cancelledLoop) setStatus(cancelled ? "expired" : "pending");
    })();
    return () => {
      cancelledLoop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  const view = {
    checking: { title: "Confirming your payment...", body: "This usually takes a few seconds." },
    paid: { title: "Payment received", body: "Your event is upgraded. All its new features are ready to use." },
    pending: { title: "Still confirming", body: "Your payment hasn't been confirmed yet. If you completed it, it will apply automatically within a few minutes — you can safely leave this page." },
    expired: { title: cancelled ? "Payment cancelled" : "Checkout expired", body: "No charge was made. You can upgrade again any time from your event." },
    failed: { title: "Payment failed", body: "No charge was made. Please try again, or use a different payment method." },
    error: { title: "Something went wrong", body: "We couldn't find this payment. If you were charged, contact support and we'll sort it out." },
  }[status];

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: T.cream }}>
      <div className="w-full max-w-md px-8 py-10 rounded-2xl shadow-lg text-center" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
        <img src={webAppLogo} alt="Invyta" className="h-10 w-auto mx-auto mb-6" />
        {status === "paid" && (
          <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center text-xl" style={{ backgroundColor: "rgba(76,175,125,0.12)", color: T.green }}>✓</div>
        )}
        {status === "checking" && <div className="w-8 h-8 rounded-full mx-auto mb-4 border-2 border-t-transparent animate-spin" style={{ borderColor: T.accent, borderTopColor: "transparent" }} />}
        <h1 className="text-xl font-bold mb-2" style={{ color: T.charcoal }}>{view.title}</h1>
        <p className="text-sm mb-7" style={{ color: T.muted }}>{view.body}</p>
        <div className="flex flex-col gap-2">
          {eventId && status !== "checking" && (
            <Link to={`/dashboard/events/${eventId}/builder`} className="w-full py-3 rounded-xl text-sm font-semibold" style={{ backgroundColor: T.accent, color: T.white }}>
              Back to my event
            </Link>
          )}
          <Link to="/dashboard" className="w-full py-3 rounded-xl text-sm font-semibold" style={{ border: `1px solid ${T.border}`, color: T.charcoal }}>
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
