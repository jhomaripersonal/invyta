import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase-client";
import { useAuth } from "./auth-context";
import { useEvents } from "./events-store";
import { promoAction } from "./payments";
import type { PaidPlan } from "../data/pricing";

// The signed-in account's promo credit (test launch). Entering a promo code
// gives the account ONE credit for an upgraded invitation; the organizer
// spends it on the event of their choice — in the create-event wizard or
// from an event's upgrade dialog. Each account can redeem one code.
// Rows live in promo_redemptions (RLS: "read own promo redemptions").

export interface PromoCredit {
  plan: PaidPlan;
  // Set once spent; eventId is the invitation it went to (null if deleted).
  usedAt?: string;
  eventId?: string;
}

interface PromoCreditContextValue {
  // undefined while loading; null = this account never redeemed a code.
  credit: PromoCredit | null | undefined;
  // The plan of an unused credit, if there is one.
  available: PaidPlan | null;
  redeem: (code: string) => Promise<PaidPlan>;
  useOn: (eventId: string) => Promise<PaidPlan>;
}

const PromoCreditContext = createContext<PromoCreditContextValue | null>(null);

export function PromoCreditProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { refresh: refreshEvents } = useEvents();
  const [credit, setCredit] = useState<PromoCredit | null | undefined>(undefined);

  async function load() {
    if (!user) {
      setCredit(null);
      return;
    }
    const { data, error } = await supabase
      .from("promo_redemptions")
      .select("plan, used_at, event_id")
      .eq("user_id", user.id)
      .maybeSingle();
    // Before the promo patch is installed the table doesn't exist — treat
    // that as "no credit" rather than leaving the UI loading forever.
    if (error || !data) {
      setCredit(null);
      return;
    }
    setCredit({ plan: data.plan, usedAt: data.used_at ?? undefined, eventId: data.event_id ?? undefined });
  }

  useEffect(() => {
    setCredit(undefined);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function redeem(code: string) {
    const plan = await promoAction({ action: "redeem", code: code.trim() });
    await load();
    return plan;
  }

  async function useOn(eventId: string) {
    const plan = await promoAction({ action: "use", eventId });
    await Promise.all([load(), refreshEvents()]);
    return plan;
  }

  const available = credit && !credit.usedAt ? credit.plan : null;

  return <PromoCreditContext.Provider value={{ credit, available, redeem, useOn }}>{children}</PromoCreditContext.Provider>;
}

export function usePromoCredit(): PromoCreditContextValue {
  const ctx = useContext(PromoCreditContext);
  if (!ctx) throw new Error("usePromoCredit must be used inside PromoCreditProvider");
  return ctx;
}
