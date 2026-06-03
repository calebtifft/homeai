import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSupabase } from "./supabase";
import { withTimeout } from "../utils/withTimeout";

const STORAGE_KEY_PREFIX = "homeai.staging_usage.v3";
const LEGACY_STORAGE_KEY = "homeai.staging_usage.v2";

/** Free runs per calendar day when the user has no active subscription. */
export const FREE_STAGING_DAILY_LIMIT = 3;

/**
 * When true, free-tier staging is allowed past the daily cap (usage counter still increments).
 * Set EXPO_PUBLIC_STAGING_UNLIMITED=1 in .env for local testing only — not for store builds.
 */
export function isStagingDailyLimitBypassed(): boolean {
  const flag = process.env.EXPO_PUBLIC_STAGING_UNLIMITED?.trim();
  return flag === "1" || flag === "true";
}

type UsageStore = {
  dayKey: string;
  count: number;
};

export function currentStagingDayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const SESSION_LOOKUP_MS = 2500;

async function resolveUsageUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await withTimeout(
      supabase.auth.getSession(),
      SESSION_LOOKUP_MS,
      "Auth session lookup timed out"
    );
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function storageKeyForUser(userId: string | null): Promise<string> {
  if (userId) return `${STORAGE_KEY_PREFIX}:${userId}`;
  return `${STORAGE_KEY_PREFIX}:device`;
}

async function readLocalStore(userId: string | null): Promise<UsageStore> {
  const dayKey = currentStagingDayKey();
  const key = await storageKeyForUser(userId);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy && !userId) {
        const parsed = JSON.parse(legacy) as Partial<UsageStore>;
        if (parsed.dayKey === dayKey) {
          return {
            dayKey,
            count:
              typeof parsed.count === "number" && parsed.count >= 0
                ? Math.floor(parsed.count)
                : 0,
          };
        }
      }
      return { dayKey, count: 0 };
    }
    const parsed = JSON.parse(raw) as Partial<UsageStore>;
    if (parsed.dayKey !== dayKey) return { dayKey, count: 0 };
    const count =
      typeof parsed.count === "number" && parsed.count >= 0
        ? Math.floor(parsed.count)
        : 0;
    return { dayKey, count };
  } catch {
    return { dayKey, count: 0 };
  }
}

async function writeLocalStore(userId: string | null, store: UsageStore): Promise<void> {
  const key = await storageKeyForUser(userId);
  await AsyncStorage.setItem(key, JSON.stringify(store));
}

async function fetchRemoteUsageCount(userId: string, dayKey: string): Promise<number | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("user_staging_daily")
      .select("count")
      .eq("user_id", userId)
      .eq("day_key", dayKey)
      .maybeSingle();
    if (error) {
      if (__DEV__) {
        console.warn("[HomeAI] user_staging_daily read failed:", error.message);
      }
      return null;
    }
    const count = data?.count;
    return typeof count === "number" && count >= 0 ? Math.floor(count) : 0;
  } catch {
    return null;
  }
}

async function upsertRemoteUsageCount(
  userId: string,
  dayKey: string,
  count: number
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const safeCount = Math.min(99, Math.max(0, Math.floor(count)));
  const { error } = await supabase.from("user_staging_daily").upsert(
    {
      user_id: userId,
      day_key: dayKey,
      count: safeCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,day_key" }
  );
  if (error && __DEV__) {
    console.warn("[HomeAI] user_staging_daily upsert failed:", error.message);
  }
}

/** Pull server quota into local cache (permanent accounts; cross-device). */
export async function refreshStagingUsageFromServer(
  userId?: string | null
): Promise<void> {
  const uid = userId ?? (await resolveUsageUserId());
  if (!uid) return;
  const dayKey = currentStagingDayKey();
  const remote = await fetchRemoteUsageCount(uid, dayKey);
  if (remote === null) return;
  const local = await readLocalStore(uid);
  const merged = Math.min(
    FREE_STAGING_DAILY_LIMIT,
    Math.max(local.dayKey === dayKey ? local.count : 0, remote)
  );
  await writeLocalStore(uid, { dayKey, count: merged });
  if (merged > remote) {
    await upsertRemoteUsageCount(uid, dayKey, merged);
  }
}

export async function getDailyStagingUsage(options?: {
  localOnly?: boolean;
  userId?: string | null;
}): Promise<{
  count: number;
  limit: number;
  remaining: number;
  dayKey: string;
}> {
  const userId = options?.localOnly
    ? (options.userId ?? null)
    : await resolveUsageUserId();
  const dayKey = currentStagingDayKey();
  let store = await readLocalStore(userId);

  if (userId && !options?.localOnly) {
    let remote: number | null = null;
    try {
      remote = await withTimeout(
        fetchRemoteUsageCount(userId, dayKey),
        3000,
        "Remote usage lookup timed out"
      );
    } catch {
      remote = null;
    }
    if (remote !== null) {
      const merged = Math.min(
        FREE_STAGING_DAILY_LIMIT,
        Math.max(store.dayKey === dayKey ? store.count : 0, remote)
      );
      if (merged !== store.count || store.dayKey !== dayKey) {
        store = { dayKey, count: merged };
        await writeLocalStore(userId, store);
      }
    }
  }

  const remaining = Math.max(0, FREE_STAGING_DAILY_LIMIT - store.count);
  return {
    count: store.count,
    limit: FREE_STAGING_DAILY_LIMIT,
    remaining,
    dayKey: store.dayKey,
  };
}

export async function recordStagingCompletion(): Promise<void> {
  const userId = await resolveUsageUserId();
  const dayKey = currentStagingDayKey();
  const store = await readLocalStore(userId);
  const nextCount =
    store.dayKey === dayKey ? store.count + 1 : 1;
  const capped = Math.min(FREE_STAGING_DAILY_LIMIT + 10, nextCount);
  await writeLocalStore(userId, { dayKey, count: capped });

  if (!userId) return;

  const supabase = getSupabase();
  if (!supabase) return;

  const { data, error } = await supabase.rpc("increment_user_staging_daily", {
    p_day_key: dayKey,
  });

  if (!error && typeof data === "number") {
    const serverCount = Math.min(99, Math.max(0, Math.floor(data)));
    await writeLocalStore(userId, { dayKey, count: serverCount });
    return;
  }

  if (error && __DEV__) {
    console.warn("[HomeAI] increment_user_staging_daily failed:", error.message);
  }
  await upsertRemoteUsageCount(userId, dayKey, capped);
}

export async function canRunStagingWithoutSubscription(options?: {
  localOnly?: boolean;
  userId?: string | null;
}): Promise<{
  allowed: boolean;
  remaining: number;
  count: number;
}> {
  const usage = await getDailyStagingUsage(options);
  if (isStagingDailyLimitBypassed()) {
    return {
      allowed: true,
      remaining: Number.POSITIVE_INFINITY,
      count: usage.count,
    };
  }
  return {
    allowed: usage.count < FREE_STAGING_DAILY_LIMIT,
    remaining: usage.remaining,
    count: usage.count,
  };
}
