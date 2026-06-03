import { Platform } from "react-native";

const ANDROID_PACKAGE = "com.homeai.aihomedesign";

export function revenueCatApiKeyForPlatform(): string | null {
  if (Platform.OS === "ios") {
    return process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY?.trim() || null;
  }
  if (Platform.OS === "android") {
    return process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY?.trim() || null;
  }
  return null;
}

export function isTestStoreRevenueCatKey(apiKey: string): boolean {
  return apiKey.startsWith("test_");
}

export function validateRevenueCatApiKey(apiKey: string): string[] {
  const issues: string[] = [];
  if (!apiKey) {
    issues.push("API key is missing from .env");
    return issues;
  }
  if (Platform.OS === "android") {
    if (apiKey.startsWith("appl_")) {
      issues.push(
        "EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY is an iOS key (appl_). Use your Test Store test_… key or Android goog_… key from the RevenueCat dashboard."
      );
    }
    if (apiKey.startsWith("goog_") && __DEV__) {
      issues.push(
        "Using production Google key (goog_) in dev — ensure Play Console + service credentials are linked, or use a Test Store test_ key for local builds."
      );
    }
  }
  if (Platform.OS === "ios" && apiKey.startsWith("goog_")) {
    issues.push(
      "EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY is an Android key (goog_). Use appl_… or Test Store test_…"
    );
  }
  return issues;
}

/** One-line dev confirmation when Test Store is active (not an error). */
let testStoreReadyLogged = false;

export function logRevenueCatTestStoreReadyOnce(): void {
  if (!__DEV__ || testStoreReadyLogged) return;
  testStoreReadyLogged = true;
  console.log(
    `[HomeAI] RevenueCat Test Store active (${ANDROID_PACKAGE}, entitlement "pro").`
  );
}

export function isRevenueCat7117Error(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? `${error.message} ${String((error as { underlyingErrorMessage?: string }).underlyingErrorMessage ?? "")}`
      : String(error);
  return msg.includes("7117") || /page not found/i.test(msg);
}

export function logRevenueCatSetupFailure(
  error: unknown,
  context: { apiKey: string; appUserId: string }
): void {
  if (!__DEV__) return;
  const issues = validateRevenueCatApiKey(context.apiKey);
  const msg = error instanceof Error ? error.message : String(error);
  console.warn(
    "[HomeAI] RevenueCat setup failed:",
    msg,
    "\nApp User ID:",
    context.appUserId,
    "\nChecklist:",
    ...issues.map((i) => `\n  • ${i}`),
    isRevenueCat7117Error(error)
      ? "\n  • 7117 with a valid test_ key is usually a malformed subscriber URL — rebuild after the App User ID fix (no user: prefix). Also confirm Android package com.homeai.aihomedesign and a current Offering in the dashboard."
      : ""
  );
}
