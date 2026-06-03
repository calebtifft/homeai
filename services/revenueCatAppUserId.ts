import { getInstallationId } from "./identity";

/**
 * RevenueCat App User IDs must be URL-safe. Characters like `/` break API paths
 * (backend 7117 "Page not found"). Avoid `user:uuid` — the colon can be parsed
 * like a URL scheme and truncate the subscriber path on some clients.
 */
const INVALID_APP_USER_ID = /[/\\?#\s]/g;

export function sanitizeRevenueCatAppUserId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.replace(INVALID_APP_USER_ID, "_").slice(0, 120);
}

/** Stable ID for RevenueCat — Supabase user id when signed in, else install id. */
export async function buildRevenueCatAppUserId(
  userId?: string | null
): Promise<string> {
  if (userId) {
    const id = sanitizeRevenueCatAppUserId(userId);
    if (id) return id;
  }
  const installId = await getInstallationId();
  const anon = sanitizeRevenueCatAppUserId(installId);
  if (anon) return `anon_${anon}`;
  return `anon_${Date.now().toString(36)}`;
}

export function isAnonymousRevenueCatAppUserId(appUserId: string): boolean {
  return appUserId.startsWith("anon_");
}
