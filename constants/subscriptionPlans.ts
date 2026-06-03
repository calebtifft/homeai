export type SubscriptionPlanId = "lifetime" | "year" | "week";

/** week < year < lifetime — used to block in-app downgrades while subscribed. */
export const SUBSCRIPTION_PLAN_TIER: Record<SubscriptionPlanId, number> = {
  week: 0,
  year: 1,
  lifetime: 2,
};

export function compareSubscriptionPlanTier(
  a: SubscriptionPlanId,
  b: SubscriptionPlanId
): number {
  return SUBSCRIPTION_PLAN_TIER[a] - SUBSCRIPTION_PLAN_TIER[b];
}

/** True when user already has a higher tier (e.g. yearly → weekly is locked). */
export function isSubscriptionPlanDowngrade(
  target: SubscriptionPlanId,
  active: SubscriptionPlanId
): boolean {
  return compareSubscriptionPlanTier(target, active) < 0;
}

export function canPurchasePlanInApp(
  target: SubscriptionPlanId,
  active: SubscriptionPlanId | null
): boolean {
  if (!active) return true;
  if (target === active) return false;
  return compareSubscriptionPlanTier(target, active) > 0;
}

export function isSubscriptionPlanUpgrade(
  target: SubscriptionPlanId,
  active: SubscriptionPlanId
): boolean {
  return compareSubscriptionPlanTier(target, active) > 0;
}

/** Recurring subscribers can still upgrade to lifetime from year/week. */
export function hasInAppUpgradeOption(active: SubscriptionPlanId): boolean {
  return active !== "lifetime";
}

/** Highest tier among the given plans (defaults to year if empty). */
export function highestSubscriptionPlanId(
  planIds: Iterable<SubscriptionPlanId>
): SubscriptionPlanId {
  let best: SubscriptionPlanId = "year";
  let bestTier = -1;
  for (const id of planIds) {
    const tier = SUBSCRIPTION_PLAN_TIER[id];
    if (tier > bestTier) {
      bestTier = tier;
      best = id;
    }
  }
  return best;
}

/** First in-app upgrade target above the active plan (lifetime for week/year). */
export function preferredUpgradePlanId(
  active: SubscriptionPlanId
): SubscriptionPlanId | null {
  if (!hasInAppUpgradeOption(active)) return null;
  return "lifetime";
}

/** Default row selection on the plans screen when the user already has access. */
export function defaultMembershipSelection(
  activePlanId: SubscriptionPlanId | null
): SubscriptionPlanId {
  if (!activePlanId) return "year";
  const upgrade = preferredUpgradePlanId(activePlanId);
  return upgrade ?? activePlanId;
}

export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  title: string;
  periodLabel: string;
  priceLine: string;
  /** Short perks shown under the price — replace when billing is wired. */
  bullets: string[];
};

/**
 * Placeholder pricing — connect App Store / Play Billing or Stripe when ready.
 * Order: Lifetime → Year → Week (per product spec).
 */
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "lifetime",
    title: "Lifetime",
    periodLabel: "One-time purchase",
    priceLine: "$99.99",
    bullets: [
      "Unlimited virtual staging runs",
      "All room types & styles",
      "No renewal — yours forever",
    ],
  },
  {
    id: "year",
    title: "Year",
    periodLabel: "Billed annually",
    priceLine: "$29.99 / year",
    bullets: [
      "Unlimited staging for 12 months",
      "All room types & styles",
      "Best value vs. weekly",
    ],
  },
  {
    id: "week",
    title: "Week",
    periodLabel: "Renews every 7 days",
    priceLine: "$5.99 / week",
    bullets: [
      "Full access for one week",
      "All room types & styles",
      "Cancel anytime",
    ],
  },
];
