import type { SubscriptionPlanId } from "../constants/subscriptionPlans";
import {
  getActiveSubscriptionSummary,
  isRevenueCatAvailable,
  reconcileSummaryWithLocalProfile,
  refreshSubscriptionEntitlements,
  type ActiveSubscriptionSummary,
} from "./subscriptionBilling";
import {
  activeSummaryFromProfile,
  getCachedSubscriptionProfile,
  saveSubscriptionProfileFromSummary,
} from "./subscriptionProfile";
import {
  canRunStagingWithoutSubscription,
  getDailyStagingUsage,
  isStagingDailyLimitBypassed,
} from "./stagingUsage";
import { withTimeout } from "../utils/withTimeout";

const STAGING_ACCESS_TIMEOUT_MS = 4500;

export type StagingAccessResult = {
  allowed: boolean;
  isPro: boolean;
  remaining: number;
  dailyCount: number;
  dailyLimit: number;
  planId: SubscriptionPlanId | null;
  expiresAt: string | null;
  willRenew: boolean;
  isLifetime: boolean;
  /** EXPO_PUBLIC_STAGING_UNLIMITED — staging allowed despite 0 remaining in UI. */
  devUnlimitedFreeTier: boolean;
};

function proStagingAccess(
  summary: ActiveSubscriptionSummary
): StagingAccessResult {
  return {
    allowed: true,
    isPro: true,
    remaining: Number.POSITIVE_INFINITY,
    dailyCount: 0,
    dailyLimit: 0,
    planId: summary.planId,
    expiresAt: summary.expiresAt,
    willRenew: summary.willRenew,
    isLifetime: summary.isLifetime,
    devUnlimitedFreeTier: false,
  };
}

function freeStagingAccessFromUsage(
  gate: { allowed: boolean },
  usage: { remaining: number; count: number; limit: number }
): StagingAccessResult {
  const devUnlimitedFreeTier = isStagingDailyLimitBypassed();
  return {
    allowed: devUnlimitedFreeTier || gate.allowed,
    isPro: false,
    remaining: usage.remaining,
    dailyCount: usage.count,
    dailyLimit: usage.limit,
    planId: null,
    expiresAt: null,
    willRenew: false,
    isLifetime: false,
    devUnlimitedFreeTier,
  };
}

async function tryRevenueCatSummary(
  userId?: string | null
): Promise<ActiveSubscriptionSummary | null> {
  if (!isRevenueCatAvailable()) return null;
  try {
    return await getActiveSubscriptionSummary(userId);
  } catch {
    return null;
  }
}

async function resolveProAccessFromProfile(
  _userId?: string | null
): Promise<StagingAccessResult | null> {
  const cached = await getCachedSubscriptionProfile();
  if (!cached || cached.status !== "active") return null;
  return proStagingAccess(activeSummaryFromProfile(cached));
}

async function freeStagingAccessFallback(
  userId?: string | null
): Promise<StagingAccessResult> {
  const proAccess = await resolveProAccessFromProfile(userId);
  if (proAccess) return proAccess;

  const cached = await getCachedSubscriptionProfile();
  if (cached?.status === "active") {
    return proStagingAccess(activeSummaryFromProfile(cached));
  }

  const [gate, usage] = await Promise.all([
    canRunStagingWithoutSubscription({ localOnly: true, userId }),
    getDailyStagingUsage({ localOnly: true, userId }),
  ]);
  return freeStagingAccessFromUsage(gate, usage);
}

async function resolveStagingAccessInner(
  userId?: string | null
): Promise<StagingAccessResult> {
  const proAccess = await resolveProAccessFromProfile(userId);
  if (proAccess) return proAccess;

  const summary = await tryRevenueCatSummary(userId);
  if (summary) {
    const { enrichActiveSummaryWithLocalPeriod } = await import(
      "../utils/subscriptionPeriod"
    );
    const local = await getCachedSubscriptionProfile();
    const reconciled = reconcileSummaryWithLocalProfile(summary, local);
    const display = enrichActiveSummaryWithLocalPeriod(
      reconciled,
      local?.periodStartedAt,
      local?.updatedAt
    );
    const planChanged =
      !local ||
      local.status !== "active" ||
      local.planId !== reconciled.planId;
    if (planChanged) {
      await saveSubscriptionProfileFromSummary(reconciled, userId, {
        resetPeriod: planChanged,
      });
    }
    return proStagingAccess(display);
  }

  const cached = await getCachedSubscriptionProfile();
  if (cached?.status === "active") {
    return proStagingAccess(activeSummaryFromProfile(cached));
  }

  const [gate, usage] = await Promise.all([
    canRunStagingWithoutSubscription({ localOnly: true, userId }),
    getDailyStagingUsage({ localOnly: true, userId }),
  ]);
  return freeStagingAccessFromUsage(gate, usage);
}

async function runStagingAccessWithTimeout(
  userId?: string | null
): Promise<StagingAccessResult> {
  try {
    return await withTimeout(
      resolveStagingAccessInner(userId),
      STAGING_ACCESS_TIMEOUT_MS,
      "Staging access check timed out"
    );
  } catch {
    return freeStagingAccessFallback(userId);
  }
}

/** Gate staging runs. Uses local Pro cache first; caps total wait on network. */
export async function resolveStagingAccess(
  userId?: string | null
): Promise<StagingAccessResult> {
  return runStagingAccessWithTimeout(userId);
}

/** Homepage badge — local profile + throttled RC (no network on every focus). */
export async function resolveBadgeAccess(
  userId?: string | null
): Promise<StagingAccessResult> {
  return runStagingAccessWithTimeout(userId);
}

export async function resolveHasProAccess(
  userId?: string | null
): Promise<boolean> {
  const access = await runStagingAccessWithTimeout(userId);
  return access.isPro;
}
