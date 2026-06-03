import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CustomerInfo } from "react-native-purchases";
import type { SubscriptionPlanId } from "../constants/subscriptionPlans";
import {
  planIdFromCustomerInfo,
  getActiveSubscriptionSummary,
  parseActiveSubscriptionSummary,
  type ActiveSubscriptionSummary,
} from "./subscriptionBilling";
import {
  computeSubscriptionPeriodEnd,
  enrichActiveSummaryWithLocalPeriod,
} from "../utils/subscriptionPeriod";
import { getInstallationId } from "./identity";
import { getSupabase } from "./supabase";
import { ensureAnonymousSession } from "./supabaseAuth";
import { notifySubscriptionChange } from "./subscriptionEvents";

const LOCAL_SUBSCRIPTION_KEY_PREFIX = "homeai.subscription_profile.v1";
const SUPABASE_UPSERT_ATTEMPTS = 3;
let lastSubscriptionUpsertWarnAt = 0;

export type SubscriptionProfile = {
  installationId: string;
  planId: SubscriptionPlanId;
  status: "active";
  source: "local" | "supabase" | "revenuecat";
  updatedAt: string;
  /** When this plan period began (purchase / plan change). Used for renewal UI. */
  periodStartedAt?: string;
  /** Computed from plan + periodStartedAt — not RevenueCat. */
  expiresAt?: string | null;
  willRenew?: boolean;
};

/** Map cached profile to UI entitlement (Settings, plans screen). */
function inferPlanIdFromStoredPeriod(
  periodStartedAt: string,
  expiresAt: string
): SubscriptionPlanId {
  const start = Date.parse(periodStartedAt);
  const end = Date.parse(expiresAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return "year";
  const days = (end - start) / 86_400_000;
  return days <= 10 ? "week" : "year";
}

function repairStoredProfile(profile: SubscriptionProfile): SubscriptionProfile {
  if (profile.planId !== "lifetime") return profile;
  if (profile.expiresAt == null) return profile;
  const start = profile.periodStartedAt ?? profile.updatedAt;
  const inferred = inferPlanIdFromStoredPeriod(start, profile.expiresAt);
  // Only fix obvious mis-labels (week-length period). Do not map 1-year periods to year.
  if (inferred === "week") {
    return { ...profile, planId: "week", willRenew: true };
  }
  return profile;
}

export function activeSummaryFromProfile(
  profile: SubscriptionProfile
): ActiveSubscriptionSummary {
  const repaired = repairStoredProfile(profile);
  const isLifetime = repaired.planId === "lifetime";
  return enrichActiveSummaryWithLocalPeriod(
    {
      planId: repaired.planId,
      expiresAt: repaired.expiresAt ?? null,
      willRenew: repaired.willRenew ?? !isLifetime,
      isLifetime,
    },
    repaired.periodStartedAt,
    repaired.updatedAt
  );
}

function localKey(installationId: string): string {
  return `${LOCAL_SUBSCRIPTION_KEY_PREFIX}:${installationId}`;
}

function isValidPlanId(value: unknown): value is SubscriptionPlanId {
  return value === "week" || value === "year" || value === "lifetime";
}

function isSameActiveSubscriptionProfile(
  existing: SubscriptionProfile | null,
  next: Pick<
    SubscriptionProfile,
    "planId" | "status" | "expiresAt" | "willRenew" | "periodStartedAt"
  >
): boolean {
  if (!existing || existing.status !== "active" || next.status !== "active") {
    return false;
  }
  if (existing.planId !== next.planId) return false;
  if ((existing.expiresAt ?? null) !== (next.expiresAt ?? null)) return false;
  if ((existing.willRenew ?? false) !== (next.willRenew ?? false)) return false;
  if ((existing.periodStartedAt ?? null) !== (next.periodStartedAt ?? null)) {
    return false;
  }
  return true;
}

function warnSubscriptionUpsertOnce(message: string): void {
  if (!__DEV__) return;
  const now = Date.now();
  if (now - lastSubscriptionUpsertWarnAt < 30_000) return;
  lastSubscriptionUpsertWarnAt = now;
  console.warn("[HomeAI] subscription_profiles upsert failed:", message);
}

async function upsertSubscriptionProfileRow(
  uid: string,
  installationId: string,
  planId: SubscriptionPlanId,
  updatedAt: string
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const row = {
    user_id: uid,
    installation_id: installationId,
    plan_id: planId,
    status: "active" as const,
    updated_at: updatedAt,
  };

  for (let attempt = 0; attempt < SUPABASE_UPSERT_ATTEMPTS; attempt++) {
    const upsertRes = await supabase
      .from("subscription_profiles")
      .upsert(row, { onConflict: "user_id" });

    if (!upsertRes.error) return true;

    const fallback = await supabase
      .from("subscription_profiles")
      .upsert(row, { onConflict: "installation_id" });

    if (!fallback.error) return true;

    const msg = fallback.error.message || upsertRes.error.message;
    if (attempt < SUPABASE_UPSERT_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    warnSubscriptionUpsertOnce(msg);
  }
  return false;
}

async function resolveAuthUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Device cache only — no RevenueCat or network (fast path for staging gate). */
export async function getCachedSubscriptionProfile(): Promise<SubscriptionProfile | null> {
  return readLocalProfile();
}

async function readLocalProfile(): Promise<SubscriptionProfile | null> {
  const installationId = await getInstallationId();
  try {
    const raw = await AsyncStorage.getItem(localKey(installationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SubscriptionProfile>;
    if (
      parsed.installationId !== installationId ||
      parsed.status !== "active" ||
      !isValidPlanId(parsed.planId)
    ) {
      return null;
    }
    const profile = repairStoredProfile(parsed as SubscriptionProfile);
    if (profile.planId !== parsed.planId) {
      await writeLocalProfile(profile);
    }
    return profile;
  } catch {
    return null;
  }
}

async function writeLocalProfile(profile: SubscriptionProfile): Promise<void> {
  await AsyncStorage.setItem(
    localKey(profile.installationId),
    JSON.stringify(profile)
  );
}

/** Remove stale Pro cache when RevenueCat reports no active entitlement. */
export async function clearLocalSubscriptionProfile(
  userId?: string | null
): Promise<void> {
  const installationId = await getInstallationId();
  await AsyncStorage.removeItem(localKey(installationId));
  notifySubscriptionChange();

  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const uid = userId ?? (await resolveAuthUserId());
    if (!uid) return;
    await supabase
      .from("subscription_profiles")
      .update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("user_id", uid)
      .eq("status", "active");
  } catch {
    /* best-effort remote cleanup */
  }
}

async function fetchRemoteProfileByUserId(
  userId: string
): Promise<SubscriptionProfile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("subscription_profiles")
      .select("user_id, plan_id, status, installation_id, updated_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (error || !data) return null;
    if (!isValidPlanId(data.plan_id)) return null;
    const installationId =
      (typeof data.installation_id === "string" && data.installation_id) ||
      (await getInstallationId());
    return {
      installationId,
      planId: data.plan_id,
      status: "active",
      source: "supabase",
      updatedAt:
        typeof data.updated_at === "string"
          ? data.updated_at
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Infer plan from RevenueCat active products (best-effort). */
export { planIdFromCustomerInfo } from "./subscriptionBilling";

export async function saveSubscriptionProfileFromSummary(
  summary: ActiveSubscriptionSummary,
  userId?: string | null,
  options?: { resetPeriod?: boolean }
): Promise<SubscriptionProfile> {
  const existing = await readLocalProfile();
  const nowIso = new Date().toISOString();
  const planChanged =
    existing != null &&
    existing.planId !== summary.planId &&
    existing.status === "active";
  const periodStartedAt =
    options?.resetPeriod || planChanged || !existing?.periodStartedAt
      ? nowIso
      : existing.periodStartedAt;
  const expiresAt = computeSubscriptionPeriodEnd(
    summary.planId,
    periodStartedAt
  );
  const isLifetime = summary.planId === "lifetime";
  return saveSubscriptionProfile(summary.planId, userId, {
    periodStartedAt,
    expiresAt,
    willRenew: !isLifetime,
  });
}

export async function saveSubscriptionProfileFromCustomerInfo(
  customerInfo: CustomerInfo,
  userId?: string | null
): Promise<SubscriptionProfile | null> {
  const summary = parseActiveSubscriptionSummary(customerInfo);
  if (!summary) return null;
  return saveSubscriptionProfileFromSummary(summary, userId);
}

/**
 * Pro profile: RevenueCat entitlement → Supabase row (by user_id) → local device cache.
 * Read-only unless RC plan differs from cache and local was not just updated by a purchase.
 */
export async function getSubscriptionProfile(
  userId?: string | null,
  options?: { skipRevenueCat?: boolean }
): Promise<SubscriptionProfile | null> {
  const local = await readLocalProfile();
  const summary = options?.skipRevenueCat
    ? null
    : await getActiveSubscriptionSummary(userId);

  if (summary) {
    if (local?.status === "active" && local.planId !== summary.planId) {
      const localRecurring =
        local.planId === "year" || local.planId === "week";
      const rcLooksLifetime =
        summary.isLifetime || summary.planId === "lifetime";
      // Test Store / RC cache often mis-labels yearly as lifetime; trust local recurring.
      if (localRecurring && rcLooksLifetime) {
        return local;
      }
    }
    if (!local || local.planId !== summary.planId) {
      return saveSubscriptionProfileFromSummary(summary, userId, {
        resetPeriod: local?.planId !== summary.planId,
      });
    }
    return local;
  }

  if (local?.status === "active" && !options?.skipRevenueCat) {
    await clearLocalSubscriptionProfile(userId);
    return null;
  }

  const uid = userId ?? (await resolveAuthUserId());
  if (uid) {
    const remote = await fetchRemoteProfileByUserId(uid);
    if (remote) {
      await writeLocalProfile(remote);
      return remote;
    }
  }
  return local;
}

export async function refreshSubscriptionProfileFromServer(
  userId?: string | null
): Promise<SubscriptionProfile | null> {
  const uid = userId ?? (await resolveAuthUserId());
  if (!uid) return readLocalProfile();
  const remote = await fetchRemoteProfileByUserId(uid);
  if (remote) {
    await writeLocalProfile(remote);
    return remote;
  }
  return readLocalProfile();
}

/** Persist Pro to Supabase (user_id) + local cache after RevenueCat confirms entitlement. */
export async function syncSupabaseProFromRevenueCat(
  userId: string,
  customerInfo: CustomerInfo,
  entitled: boolean
): Promise<SubscriptionProfile | null> {
  if (!entitled) return null;
  const planId = planIdFromCustomerInfo(customerInfo);
  return saveSubscriptionProfile(planId, userId);
}

export async function saveSubscriptionProfile(
  planId: SubscriptionPlanId,
  userId?: string | null,
  billing?: {
    periodStartedAt?: string;
    expiresAt?: string | null;
    willRenew?: boolean;
  }
): Promise<SubscriptionProfile> {
  const installationId = await getInstallationId();
  const nowIso = new Date().toISOString();
  const existing = await readLocalProfile();
  const periodStartedAt =
    billing?.periodStartedAt ??
    (existing?.planId === planId && existing.periodStartedAt
      ? existing.periodStartedAt
      : nowIso);
  const expiresAt =
    billing?.expiresAt !== undefined
      ? billing.expiresAt
      : computeSubscriptionPeriodEnd(planId, periodStartedAt);
  const willRenew = billing?.willRenew ?? planId !== "lifetime";
  const localProfile: SubscriptionProfile = {
    installationId,
    planId,
    status: "active",
    source: "local",
    updatedAt: nowIso,
    periodStartedAt,
    expiresAt,
    willRenew,
  };

  if (existing && isSameActiveSubscriptionProfile(existing, localProfile)) {
    return existing;
  }

  await writeLocalProfile(localProfile);
  notifySubscriptionChange();

  try {
    const ensureRes = await ensureAnonymousSession();
    if (ensureRes.error) return localProfile;

    const uid = userId ?? (await resolveAuthUserId());
    if (!uid) return localProfile;

    const synced = await upsertSubscriptionProfileRow(
      uid,
      installationId,
      planId,
      nowIso
    );
    if (synced) {
      return { ...localProfile, source: "supabase" };
    }
    return localProfile;
  } catch {
    return localProfile;
  }
}
