import { createContext, useContext, type ReactNode } from "react";
import type { PlanTier } from "../types/models";
import { useAuth } from "./auth-context";

// Billing is per event, so the builder's pickers and limits must follow
// the effective plan of the event being edited, not the account's. The
// builder provides it; outside a provider this falls back to the
// account plan.
const EventPlanContext = createContext<PlanTier | null>(null);

export function EventPlanProvider({ plan, children }: { plan: PlanTier; children: ReactNode }) {
  return <EventPlanContext.Provider value={plan}>{children}</EventPlanContext.Provider>;
}

export function useEventPlan(): PlanTier {
  const eventPlan = useContext(EventPlanContext);
  const { user } = useAuth();
  return eventPlan ?? user?.plan ?? "free";
}
