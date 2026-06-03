import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";
import type { SubscriptionPlanId } from "../constants/subscriptionPlans";
import {
  highestSubscriptionPlanId,
  SUBSCRIPTION_PLAN_TIER,
} from "../constants/subscriptionPlans";
import { withTimeout } from "../utils/withTimeout";
import {
  buildRevenueCatAppUserId,
  isAnonymousRevenueCatAppUserId,
} from "./revenueCatAppUserId";
import {
  isTestStoreRevenueCatKey,
  logRevenueCatSetupFailure,
  logRevenueCatTestStoreReadyOnce,
  revenueCatApiKeyForPlatform,
  validateRevenueCatApiKey,
} from "./revenueCatDiagnostics";
import { openStoreSubscriptionUrl } from "./subscriptionManage";

const DEFAULT_ENTITLEMENT_ID = "pro";

const CUSTOMER_INFO_TIMEOUT_MS = 6000;
/** Reuse CustomerInfo in-process to avoid RC debug log spam on every access check. */
const CUSTOMER_INFO_CACHE_MS = 60_000;
const ENTITLEMENTS_REFRESH_MIN_MS = 45_000;
const OFFERINGS_TIMEOUT_MS = 12_000;
const OFFERING_CACHE_MS = 10 * 60_000;
const RC_LOGIN_TIMEOUT_MS = 15_000;
const INIT_SDK_TIMEOUT_MS = 20_000;
const PURCHASE_TIMEOUT_MS = 60_000;
const PROFILE_SAVE_TIMEOUT_MS = 12_000;

let configured = false;
let cachedCustomerInfo: CustomerInfo | null = null;
let customerInfoCachedAt = 0;
let cachedOffering: PurchasesOffering | null = null;
let cachedOfferingAt = 0;
let lastEntitlementsRefreshAt = 0;
let configuredAppUserId: string | null = null;
/** Serializes configure + logIn so anon→user login does not run twice in parallel. */
let initQueue: Promise<boolean> = Promise.resolve(true);

function apiKeyForPlatform(): string | null {
  return revenueCatApiKeyForPlatform();
}

function entitlementId(): string {
  return process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim() || DEFAULT_ENTITLEMENT_ID;
}

export function isRevenueCatAvailable(): boolean {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  // RevenueCat needs a dev client or store build — native module is missing in Expo Go.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return false;
  }
  return true;
}

function clearCustomerInfoCache(): void {
  cachedCustomerInfo = null;
  customerInfoCachedAt = 0;
}

function revenueCatLogLevel(): LOG_LEVEL {
  const verbose = process.env.EXPO_PUBLIC_REVENUECAT_DEBUG?.trim();
  if (verbose === "1" || verbose === "true") return LOG_LEVEL.DEBUG;
  return LOG_LEVEL.WARN;
}

async function fetchCustomerInfoCached(options?: {
  force?: boolean;
  maxAgeMs?: number;
}): Promise<CustomerInfo | null> {
  if (!configured) return null;
  const maxAge = options?.maxAgeMs ?? CUSTOMER_INFO_CACHE_MS;
  const now = Date.now();
  if (
    !options?.force &&
    cachedCustomerInfo &&
    now - customerInfoCachedAt < maxAge
  ) {
    return cachedCustomerInfo;
  }
  try {
    const info = await getCustomerInfoWithTimeout();
    cachedCustomerInfo = info;
    customerInfoCachedAt = now;
    return info;
  } catch {
    return cachedCustomerInfo;
  }
}

async function initRevenueCatSDKInner(userId?: string | null): Promise<boolean> {
  if (!isRevenueCatAvailable()) return false;
  const apiKey = apiKeyForPlatform();
  if (!apiKey) {
    if (__DEV__) {
      console.warn(
        "[HomeAI] RevenueCat: missing API key for",
        Platform.OS,
        "— set EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY or EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY in .env"
      );
    }
    return false;
  }

  if (__DEV__) {
    const issues = validateRevenueCatApiKey(apiKey);
    for (const issue of issues) {
      console.warn("[HomeAI] RevenueCat:", issue);
    }
  }

  const appUserID = await buildRevenueCatAppUserId(userId);
  if (!appUserID) {
    if (__DEV__) console.warn("[HomeAI] RevenueCat: empty App User ID");
    return false;
  }

  try {
    if (!configured) {
      Purchases.setLogLevel(revenueCatLogLevel());
      Purchases.configure({ apiKey, appUserID });
      configured = true;
      configuredAppUserId = appUserID;
      clearCustomerInfoCache();
      await fetchCustomerInfoCached({ force: true });
      if (isTestStoreRevenueCatKey(apiKey)) {
        logRevenueCatTestStoreReadyOnce();
      }
      if (__DEV__) {
        console.log("[HomeAI] RevenueCat ready — App User ID:", appUserID);
      }
      return true;
    }
    if (configuredAppUserId !== appUserID) {
      const linkedUser =
        configuredAppUserId != null &&
        !isAnonymousRevenueCatAppUserId(configuredAppUserId);
      const targetIsAnon = isAnonymousRevenueCatAppUserId(appUserID);
      if (linkedUser && targetIsAnon) {
        return true;
      }
      await withTimeout(
        Purchases.logIn(appUserID),
        RC_LOGIN_TIMEOUT_MS,
        "RevenueCat login timed out"
      );
      configuredAppUserId = appUserID;
      clearCustomerInfoCache();
      lastEntitlementsRefreshAt = 0;
      await fetchCustomerInfoCached({ force: true });
      if (__DEV__) {
        console.log("[HomeAI] RevenueCat logIn — App User ID:", appUserID);
      }
    }
    return true;
  } catch (e) {
    configured = false;
    configuredAppUserId = null;
    clearCustomerInfoCache();
    logRevenueCatSetupFailure(e, { apiKey, appUserId: appUserID });
    return false;
  }
}

/** Configure RevenueCat once; queue concurrent callers (anon boot → Supabase login). */
export async function initRevenueCatSDK(userId?: string | null): Promise<boolean> {
  const run = () => initRevenueCatSDKInner(userId);
  const next = initQueue.then(run, run);
  initQueue = next.catch(() => false);
  return next;
}

async function fetchCustomerInfoAfterInit(
  apiKey: string,
  force: boolean
): Promise<CustomerInfo | null> {
  if (!force && isTestStoreRevenueCatKey(apiKey)) {
    const cached = await fetchCustomerInfoCached();
    if (cached) return cached;
  }
  if (isTestStoreRevenueCatKey(apiKey)) {
    return fetchCustomerInfoCached({ force: true });
  }
  try {
    const synced = await withTimeout(
      Purchases.syncPurchasesForResult(),
      8_000,
      "RevenueCat sync timed out"
    );
    cachedCustomerInfo = synced.customerInfo;
    customerInfoCachedAt = Date.now();
    return synced.customerInfo;
  } catch {
    try {
      await Purchases.invalidateCustomerInfoCache();
    } catch {
      /* ignore */
    }
    clearCustomerInfoCache();
    return fetchCustomerInfoCached({ force: true });
  }
}

function rememberOffering(offering: PurchasesOffering | null): PurchasesOffering | null {
  if (offering) {
    cachedOffering = offering;
    cachedOfferingAt = Date.now();
  }
  return offering;
}

async function fetchOfferingsSafe(options?: {
  forceNetwork?: boolean;
}): Promise<PurchasesOffering | null> {
  const now = Date.now();
  if (
    !options?.forceNetwork &&
    cachedOffering &&
    now - cachedOfferingAt < OFFERING_CACHE_MS
  ) {
    return cachedOffering;
  }
  try {
    const offerings = await withTimeout(
      Purchases.getOfferings(),
      OFFERINGS_TIMEOUT_MS,
      "RevenueCat offerings timed out"
    );
    return rememberOffering(offerings.current ?? null);
  } catch (e) {
    if (cachedOffering) return cachedOffering;
    if (__DEV__) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        "[HomeAI] RevenueCat offerings failed (dashboard: current Offering, products, bundle ID):",
        msg
      );
    }
    return null;
  }
}

function packagesByPlanFromOffering(
  offering: PurchasesOffering | null
): Partial<Record<SubscriptionPlanId, PurchasesPackage>> {
  if (!offering) return {};
  const out: Partial<Record<SubscriptionPlanId, PurchasesPackage>> = {};
  const week = pickPackageForPlan(offering, "week");
  const year = pickPackageForPlan(offering, "year");
  const life = pickPackageForPlan(offering, "lifetime");
  if (week) out.week = week;
  if (year) out.year = year;
  if (life) out.lifetime = life;
  return out;
}

function pickPackageForPlan(
  offering: PurchasesOffering | null | undefined,
  planId: SubscriptionPlanId
): PurchasesPackage | null {
  const all = offering?.availablePackages ?? [];
  const byAny = (needles: string[]): PurchasesPackage | null => {
    const lowerNeedles = needles.map((n) => n.toLowerCase());
    const found = all.find((p) => {
      const hay = `${p.identifier} ${p.product.identifier} ${String(p.packageType)}`.toLowerCase();
      return lowerNeedles.some((n) => hay.includes(n));
    });
    return found ?? null;
  };

  if (planId === "week") return byAny(["weekly", "week"]);
  if (planId === "year") return byAny(["annual", "year", "yearly"]);
  if (planId === "lifetime") return byAny(["lifetime", "life_time", "lifetime"]);
  return null;
}

export async function getSubscriptionOfferings(
  userId?: string | null
): Promise<{
  current: PurchasesOffering | null;
  pricesByPlan: Partial<Record<SubscriptionPlanId, string>>;
  packagesByPlan: Partial<Record<SubscriptionPlanId, PurchasesPackage>>;
}> {
  const ready = await initRevenueCatSDK(userId);
  if (!ready) {
    return { current: null, pricesByPlan: {}, packagesByPlan: {} };
  }

  const current = await fetchOfferingsSafe();
  const packagesByPlan = packagesByPlanFromOffering(current);
  const pricesByPlan: Partial<Record<SubscriptionPlanId, string>> = {};
  if (packagesByPlan.week) {
    pricesByPlan.week = packagesByPlan.week.product.priceString;
  }
  if (packagesByPlan.year) {
    pricesByPlan.year = packagesByPlan.year.product.priceString;
  }
  if (packagesByPlan.lifetime) {
    pricesByPlan.lifetime = packagesByPlan.lifetime.product.priceString;
  }
  return { current, pricesByPlan, packagesByPlan };
}

export function hasActiveEntitlement(customerInfo: CustomerInfo): boolean {
  const entId = entitlementId();
  if (customerInfo.entitlements.active[entId]) return true;
  return Object.keys(customerInfo.entitlements.active).length > 0;
}

function activeEntitlement(info: CustomerInfo) {
  const entId = entitlementId();
  return (
    info.entitlements.active[entId] ??
    Object.values(info.entitlements.active)[0] ??
    null
  );
}

function isLifetimeProductIdentifier(productId: string): boolean {
  const id = productId.toLowerCase();
  return (
    id.includes("lifetime") ||
    id.includes("life_time") ||
    id.includes("lifetime_access")
  );
}

export function planIdFromProductIdentifier(
  productId: string
): SubscriptionPlanId {
  const id = productId.toLowerCase();
  if (id.includes("week") || id.includes("weekly")) return "week";
  if (id.includes("year") || id.includes("annual") || id.includes("yearly")) {
    return "year";
  }
  if (isLifetimeProductIdentifier(id)) return "lifetime";
  return "year";
}

/** Collect every plan signal from RevenueCat and return the highest tier. */
export function highestPlanIdFromCustomerInfo(info: CustomerInfo): SubscriptionPlanId {
  const candidates: SubscriptionPlanId[] = [];

  for (const tx of info.nonSubscriptionTransactions ?? []) {
    if (tx.productIdentifier) {
      candidates.push(planIdFromProductIdentifier(tx.productIdentifier));
    }
  }

  for (const sku of info.allPurchasedProductIdentifiers ?? []) {
    candidates.push(planIdFromProductIdentifier(sku));
  }

  for (const sku of info.activeSubscriptions ?? []) {
    candidates.push(planIdFromProductIdentifier(sku));
  }

  for (const ent of Object.values(info.entitlements.active)) {
    if (ent?.productIdentifier) {
      candidates.push(planIdFromProductIdentifier(ent.productIdentifier));
    }
  }

  if (candidates.length > 0) {
    return highestSubscriptionPlanId(candidates);
  }
  const ent = activeEntitlement(info);
  if (ent?.productIdentifier) {
    return planIdFromProductIdentifier(ent.productIdentifier);
  }
  return "year";
}

export function planIdFromCustomerInfo(info: CustomerInfo): SubscriptionPlanId {
  return highestPlanIdFromCustomerInfo(info);
}

function productIsActiveSubscription(
  info: CustomerInfo,
  productIdentifier: string
): boolean {
  const pid = productIdentifier.toLowerCase();
  if (
    info.activeSubscriptions.some((sku) => {
      const skuLower = sku.toLowerCase();
      return skuLower === pid || pid.includes(skuLower) || skuLower.includes(pid);
    })
  ) {
    return true;
  }
  const sub = info.subscriptionsByProductIdentifier?.[productIdentifier];
  return sub?.isActive === true;
}

/** Non-consumable / lifetime SKU present in purchase history (survives RC entitlement quirks). */
export function customerInfoHasLifetimeOwnership(info: CustomerInfo): boolean {
  for (const tx of info.nonSubscriptionTransactions ?? []) {
    if (
      tx.productIdentifier &&
      isLifetimeProductIdentifier(tx.productIdentifier)
    ) {
      return true;
    }
  }
  for (const sku of info.allPurchasedProductIdentifiers ?? []) {
    if (isLifetimeProductIdentifier(sku)) return true;
  }
  return false;
}

function inferIsLifetime(
  ent: NonNullable<ReturnType<typeof activeEntitlement>>,
  planId: SubscriptionPlanId,
  info: CustomerInfo
): boolean {
  if (info.activeSubscriptions.length > 0) return false;
  if (planId === "week" || planId === "year") return false;
  const pid = ent.productIdentifier ?? "";
  if (productIsActiveSubscription(info, pid)) return false;
  if (planId === "lifetime" && isLifetimeProductIdentifier(pid)) return true;
  const pidLower = pid.toLowerCase();
  if (
    pidLower.includes("year") ||
    pidLower.includes("annual") ||
    pidLower.includes("yearly") ||
    pidLower.includes("week") ||
    pidLower.includes("weekly")
  ) {
    return false;
  }
  if (isLifetimeProductIdentifier(pidLower)) return true;
  if (ent.willRenew === true || ent.expirationDate != null) return false;
  // Test Store often omits expiry on subscriptions — do not treat that as lifetime.
  return false;
}

export type ActiveSubscriptionSummary = {
  planId: SubscriptionPlanId;
  /** ISO date from RevenueCat, null for lifetime / non-expiring. */
  expiresAt: string | null;
  willRenew: boolean;
  isLifetime: boolean;
};

/** Map device cache / profile plan id to UI entitlement state (no network). */
export function activeSummaryFromPlanId(
  planId: SubscriptionPlanId
): ActiveSubscriptionSummary {
  return {
    planId,
    expiresAt: null,
    willRenew: planId !== "lifetime",
    isLifetime: planId === "lifetime",
  };
}

export function parseActiveSubscriptionSummary(
  info: CustomerInfo
): ActiveSubscriptionSummary | null {
  if (!hasActiveEntitlement(info)) return null;
  const ent = activeEntitlement(info);
  if (!ent) return null;

  const planId = highestPlanIdFromCustomerInfo(info);
  const ownsLifetime = customerInfoHasLifetimeOwnership(info);
  const isLifetime =
    ownsLifetime ||
    (planId === "lifetime" && inferIsLifetime(ent, planId, info));
  const resolvedPlanId = isLifetime ? "lifetime" : planId;

  const expiresAt = isLifetime ? null : ent.expirationDate ?? null;
  const willRenew = isLifetime ? false : ent.willRenew === true;

  return {
    planId: resolvedPlanId,
    expiresAt,
    willRenew,
    isLifetime,
  };
}

function summaryForPlanId(
  planId: SubscriptionPlanId,
  base: ActiveSubscriptionSummary
): ActiveSubscriptionSummary {
  const isLifetime = planId === "lifetime";
  return {
    planId,
    expiresAt: isLifetime ? null : base.expiresAt,
    willRenew: isLifetime ? false : base.willRenew !== false,
    isLifetime,
  };
}

/** Merge RC summary with device cache — never drop a higher tier the user already owns. */
export function reconcileSummaryWithLocalProfile(
  summary: ActiveSubscriptionSummary,
  local:
    | {
        planId: SubscriptionPlanId;
        status: string;
        updatedAt?: string;
      }
    | null
    | undefined
): ActiveSubscriptionSummary {
  if (!local || local.status !== "active") return summary;

  const localTier = SUBSCRIPTION_PLAN_TIER[local.planId];
  const rcTier = SUBSCRIPTION_PLAN_TIER[summary.planId];

  if (localTier > rcTier) {
    return summaryForPlanId(local.planId, summary);
  }

  const localRecurring = local.planId === "year" || local.planId === "week";
  const rcLooksLifetime = summary.isLifetime || summary.planId === "lifetime";
  if (localRecurring && rcLooksLifetime) {
    return summaryForPlanId(local.planId, summary);
  }

  return summary;
}

/** Sync store receipts with RevenueCat and persist the latest plan to local + Supabase. */
export async function refreshSubscriptionEntitlements(
  userId?: string | null,
  options?: { force?: boolean }
): Promise<ActiveSubscriptionSummary | null> {
  if (!isRevenueCatAvailable()) return null;
  const ready = await initRevenueCatSDK(userId);
  if (!ready) return null;
  const apiKey = apiKeyForPlatform();
  if (!apiKey) return null;

  const now = Date.now();
  if (
    !options?.force &&
    now - lastEntitlementsRefreshAt < ENTITLEMENTS_REFRESH_MIN_MS
  ) {
    const { getCachedSubscriptionProfile, activeSummaryFromProfile } =
      await import("./subscriptionProfile");
    const local = await getCachedSubscriptionProfile();
    if (local?.status === "active") {
      return activeSummaryFromProfile(local);
    }
    const info = await fetchCustomerInfoCached();
    if (!info) return null;
    let summary = parseActiveSubscriptionSummary(info);
    if (!summary) return null;
    return reconcileSummaryWithLocalProfile(summary, local);
  }

  try {
    const info = await fetchCustomerInfoAfterInit(apiKey, options?.force === true);
    if (!info) return null;
    lastEntitlementsRefreshAt = now;

    if (!hasActiveEntitlement(info)) {
      const { clearLocalSubscriptionProfile } = await import(
        "./subscriptionProfile"
      );
      await clearLocalSubscriptionProfile(userId);
      return null;
    }

    let summary = parseActiveSubscriptionSummary(info);
    if (summary) {
      const {
        getCachedSubscriptionProfile,
        saveSubscriptionProfileFromSummary,
        activeSummaryFromProfile,
      } = await import("./subscriptionProfile");
      const local = await getCachedSubscriptionProfile();
      summary = reconcileSummaryWithLocalProfile(summary, local);
      const profile = await saveSubscriptionProfileFromSummary(summary, userId);
      return activeSummaryFromProfile(profile);
    }
    return null;
  } catch (e) {
    if (__DEV__) {
      logRevenueCatSetupFailure(e, {
        apiKey,
        appUserId: (await buildRevenueCatAppUserId(userId)) || "(empty)",
      });
    }
    return null;
  }
}

function reconcileSummaryWithPurchasedPlan(
  summary: ActiveSubscriptionSummary,
  purchasedPlanId: SubscriptionPlanId
): ActiveSubscriptionSummary {
  if (purchasedPlanId === "lifetime") {
    return { ...summary, planId: "lifetime", isLifetime: true, willRenew: false };
  }
  if (purchasedPlanId === "year" || purchasedPlanId === "week") {
    if (summary.planId === purchasedPlanId && !summary.isLifetime) return summary;
    return {
      ...summary,
      planId: purchasedPlanId,
      isLifetime: false,
      willRenew: summary.willRenew !== false,
    };
  }
  return summary;
}

export async function applyPurchaseCustomerInfo(
  customerInfo: CustomerInfo,
  userId?: string | null,
  purchasedPlanId?: SubscriptionPlanId
): Promise<ActiveSubscriptionSummary | null> {
  let summary = parseActiveSubscriptionSummary(customerInfo);
  if (!summary) return null;
  if (purchasedPlanId) {
    summary = reconcileSummaryWithPurchasedPlan(summary, purchasedPlanId);
  }
  cachedCustomerInfo = customerInfo;
  customerInfoCachedAt = Date.now();

  const { saveSubscriptionProfileFromSummary, activeSummaryFromProfile } =
    await import("./subscriptionProfile");
  let profile;
  try {
    profile = await withTimeout(
      saveSubscriptionProfileFromSummary(summary, userId, {
        resetPeriod: true,
      }),
      PROFILE_SAVE_TIMEOUT_MS,
      "Profile save timed out"
    );
  } catch {
    return summary;
  }

  const apiKey = apiKeyForPlatform();
  if (
    isRevenueCatAvailable() &&
    apiKey &&
    !isTestStoreRevenueCatKey(apiKey)
  ) {
    try {
      await Purchases.invalidateCustomerInfoCache();
    } catch {
      /* cache may already be current from purchase result */
    }
    clearCustomerInfoCache();
    lastEntitlementsRefreshAt = 0;
  }
  return activeSummaryFromProfile(profile);
}

async function getCustomerInfoWithTimeout(): Promise<CustomerInfo> {
  return Promise.race([
    Purchases.getCustomerInfo(),
    new Promise<CustomerInfo>((_, reject) => {
      setTimeout(
        () => reject(new Error("RevenueCat customer info timed out")),
        CUSTOMER_INFO_TIMEOUT_MS
      );
    }),
  ]);
}

export async function getActiveSubscriptionSummary(
  userId?: string | null,
  options?: { forceRefresh?: boolean }
): Promise<ActiveSubscriptionSummary | null> {
  if (options?.forceRefresh) {
    return refreshSubscriptionEntitlements(userId, { force: true });
  }
  if (!isRevenueCatAvailable()) return null;
  const ready = await initRevenueCatSDK(userId);
  if (!ready) return null;
  try {
    const info = await fetchCustomerInfoCached();
    if (!info) return null;
    let summary = parseActiveSubscriptionSummary(info);
    if (!summary) return null;
    const { getCachedSubscriptionProfile } = await import(
      "./subscriptionProfile"
    );
    const local = await getCachedSubscriptionProfile();
    return reconcileSummaryWithLocalProfile(summary, local);
  } catch {
    return null;
  }
}

export async function openSubscriptionManagement(): Promise<boolean> {
  if (isRevenueCatAvailable() && configured) {
    try {
      await Purchases.showManageSubscriptions();
      return true;
    } catch {
      /* fall through to store URL */
    }
  }
  return openStoreSubscriptionUrl();
}

export type PurchasePlanOptions = {
  /** Package from getSubscriptionOfferings — skips a second getOfferings() at checkout. */
  pkg?: PurchasesPackage | null;
};

export async function purchasePlan(
  planId: SubscriptionPlanId,
  userId?: string | null,
  options?: PurchasePlanOptions
): Promise<{ customerInfo: CustomerInfo; active: boolean }> {
  let ready: boolean;
  try {
    ready = await withTimeout(
      initRevenueCatSDK(userId),
      INIT_SDK_TIMEOUT_MS,
      "Billing setup timed out"
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Billing setup timed out";
    throw new Error(msg);
  }
  if (!ready) throw new Error("Billing is not configured for this platform.");

  let pkg =
    options?.pkg ??
    pickPackageForPlan(cachedOffering, planId) ??
    null;
  if (!pkg) {
    const current = await fetchOfferingsSafe();
    pkg = pickPackageForPlan(current, planId);
  }
  if (!pkg) throw new Error(`No package configured for plan: ${planId}`);

  const apiKey = apiKeyForPlatform();
  const purchaseTimeoutMsg =
    "Purchase timed out waiting for the store. Check your connection and try Restore purchases.";

  const runPurchase = () =>
    withTimeout(
      Purchases.purchasePackage(pkg!),
      PURCHASE_TIMEOUT_MS,
      purchaseTimeoutMsg
    );

  let customerInfo: CustomerInfo;
  try {
    ({ customerInfo } = await runPurchase());
  } catch (first) {
    if (
      Platform.OS === "ios" &&
      apiKey &&
      isTestStoreRevenueCatKey(apiKey) &&
      pkg.product
    ) {
      ({ customerInfo } = await withTimeout(
        Purchases.purchaseStoreProduct(pkg.product),
        PURCHASE_TIMEOUT_MS,
        purchaseTimeoutMsg
      ));
    } else {
      throw first;
    }
  }

  cachedCustomerInfo = customerInfo;
  customerInfoCachedAt = Date.now();
  return { customerInfo, active: hasActiveEntitlement(customerInfo) };
}

export async function restorePurchases(
  userId?: string | null
): Promise<{ customerInfo: CustomerInfo; active: boolean }> {
  const ready = await initRevenueCatSDK(userId);
  if (!ready) throw new Error("Billing is not configured for this platform.");
  const customerInfo = await withTimeout(
    Purchases.restorePurchases(),
    PURCHASE_TIMEOUT_MS,
    "Restore timed out. Try again when you have a stable connection."
  );
  cachedCustomerInfo = customerInfo;
  customerInfoCachedAt = Date.now();
  return { customerInfo, active: hasActiveEntitlement(customerInfo) };
}

/** True when the user dismissed the store sheet (not an error to surface). */
export function isPurchaseCancelledError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const code = (error as { code?: string; userCancelled?: boolean }).code;
  const cancelled = (error as { userCancelled?: boolean }).userCancelled;
  if (cancelled === true) return true;
  return (
    code === "PURCHASE_CANCELLED" ||
    code === "1" ||
    String(code).toLowerCase().includes("cancel")
  );
}

export async function getRevenueCatEntitlementActive(
  userId?: string | null
): Promise<boolean> {
  const ready = await initRevenueCatSDK(userId);
  if (!ready) return false;
  try {
    const info = await fetchCustomerInfoCached();
    return info != null && hasActiveEntitlement(info);
  } catch {
    return false;
  }
}

/**
 * Align RevenueCat with Supabase user id (aliases prior anon purchases on logIn).
 * Restores only when no active entitlement yet — typical cross-device / post-guest flow.
 */
export async function syncRevenueCatForUser(
  userId: string,
  options?: { forceRestore?: boolean }
): Promise<{ active: boolean; customerInfo: CustomerInfo | null }> {
  if (!isRevenueCatAvailable()) {
    return { active: false, customerInfo: null };
  }
  const ready = await initRevenueCatSDK(userId);
  if (!ready) return { active: false, customerInfo: null };

  try {
    let info = await fetchCustomerInfoCached();
    let active = info != null && hasActiveEntitlement(info);

    if (!active && options?.forceRestore !== false) {
      try {
        info = await Purchases.restorePurchases();
        cachedCustomerInfo = info;
        customerInfoCachedAt = Date.now();
        active = hasActiveEntitlement(info);
      } catch (restoreErr) {
        if (__DEV__) {
          const msg =
            restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
          console.warn("[HomeAI] RevenueCat restore skipped:", msg);
        }
      }
    }

    return { active, customerInfo: info };
  } catch (e) {
    if (__DEV__) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[HomeAI] RevenueCat sync failed:", msg);
    }
    return { active: false, customerInfo: null };
  }
}
