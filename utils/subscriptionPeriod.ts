import type { SubscriptionPlanId } from "../constants/subscriptionPlans";
import type { ActiveSubscriptionSummary } from "../services/subscriptionBilling";

/** End of the current billing period from plan + when access started (not RevenueCat). */
export function computeSubscriptionPeriodEnd(
  planId: SubscriptionPlanId,
  periodStartedAt: string | Date
): string | null {
  if (planId === "lifetime") return null;

  const start =
    typeof periodStartedAt === "string"
      ? new Date(periodStartedAt)
      : periodStartedAt;
  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(start.getTime());
  if (planId === "week") {
    end.setDate(end.getDate() + 7);
  } else if (planId === "year") {
    end.setFullYear(end.getFullYear() + 1);
  }
  return end.toISOString();
}

/** Prefer device period start; fall back to profile last update. */
export function resolvePeriodStartedAt(
  periodStartedAt?: string | null,
  updatedAt?: string | null
): string {
  const candidate = periodStartedAt ?? updatedAt;
  if (candidate) {
    const t = Date.parse(candidate);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

/**
 * UI dates for Settings / membership — derived from plan + period start.
 * RevenueCat is only used for entitlement active / plan id, not renewal display.
 */
export function enrichActiveSummaryWithLocalPeriod(
  summary: ActiveSubscriptionSummary,
  periodStartedAt?: string | null,
  updatedAtFallback?: string | null
): ActiveSubscriptionSummary {
  if (summary.isLifetime || summary.planId === "lifetime") {
    return {
      ...summary,
      planId: "lifetime",
      expiresAt: null,
      willRenew: false,
      isLifetime: true,
    };
  }

  const start = resolvePeriodStartedAt(periodStartedAt, updatedAtFallback);
  const expiresAt = computeSubscriptionPeriodEnd(summary.planId, start);

  return {
    ...summary,
    expiresAt,
    willRenew: true,
    isLifetime: false,
  };
}
