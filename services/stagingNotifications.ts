import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";
import type { LanguageId } from "../constants/languages";
import { translate } from "../locales/strings";
import { isNotificationAccessGranted } from "../utils/permissions";
import { STORAGE_NOTIFICATIONS } from "./settingsPreferences";

const ANDROID_CHANNEL_ID = "staging-complete";
export const STAGING_COMPLETE_NOTIFICATION_TYPE = "staging-complete";

let handlerRegistered = false;
let androidChannelReady = false;

async function notificationsPrefOn(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(STORAGE_NOTIFICATIONS);
  return raw === null || raw === "1";
}

/** Foreground: no banner (user sees in-app navigation). Background/inactive: show local alert. */
export function registerStagingNotificationHandler(): void {
  if (Platform.OS === "web" || handlerRegistered) return;
  handlerRegistered = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data;
      const isStagingComplete =
        typeof data === "object" &&
        data != null &&
        (data as { type?: string }).type === STAGING_COMPLETE_NOTIFICATION_TYPE;

      // Staging-complete: show even on Home after "Continue in background" (app still active).
      if (isStagingComplete) {
        return {
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        };
      }

      const inForeground = AppState.currentState === "active";
      const show = !inForeground;
      return {
        shouldShowAlert: show,
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      };
    },
  });
}

export async function ensureAndroidStagingNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android" || androidChannelReady) return;
  androidChannelReady = true;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Staging",
    description: "Alerts when virtual staging finishes in the background",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function getOsNotificationsGranted(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status } = await Notifications.getPermissionsAsync();
  return isNotificationAccessGranted(status);
}

export async function requestOsNotificationsPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const existing = await Notifications.getPermissionsAsync();
  if (isNotificationAccessGranted(existing.status)) return true;
  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
  if (isNotificationAccessGranted(status)) return true;
  // Re-read in case the request response lags behind the OS grant.
  const after = await Notifications.getPermissionsAsync();
  return isNotificationAccessGranted(after.status);
}

/**
 * Android channel + OS permission when the in-app notifications toggle is on.
 * Safe to call on every cold start.
 */
export async function ensureNotificationsReady(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!(await notificationsPrefOn())) return false;
  await ensureAndroidStagingNotificationChannel();
  if (await getOsNotificationsGranted()) return true;
  return requestOsNotificationsPermission();
}

/**
 * Alert when staging finished after the user left Processing or the app is backgrounded.
 * @param showWhileForeground — user tapped "Continue in background" (still on Home, not Processing).
 */
export async function notifyStagingCompleteIfBackgrounded(
  languageId: LanguageId,
  opts?: { showWhileForeground?: boolean }
): Promise<void> {
  if (Platform.OS === "web") return;
  if (!(await notificationsPrefOn())) {
    if (__DEV__) console.warn("[HomeAI] Staging notification skipped: pref off");
    return;
  }
  if (!(await getOsNotificationsGranted())) {
    if (__DEV__) console.warn("[HomeAI] Staging notification skipped: OS permission");
    return;
  }

  const inForeground = AppState.currentState === "active";
  if (inForeground && !opts?.showWhileForeground) {
    if (__DEV__) {
      console.log("[HomeAI] Staging notification skipped: still on Processing (foreground)");
    }
    return;
  }

  await ensureAndroidStagingNotificationChannel();
  const title = translate(languageId, "notification.stagingCompleteTitle");
  const body = translate(languageId, "notification.stagingCompleteBody");
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data: {
          route: "History",
          type: STAGING_COMPLETE_NOTIFICATION_TYPE,
        },
        ...(Platform.OS === "android"
          ? {
              channelId: ANDROID_CHANNEL_ID,
              priority: Notifications.AndroidNotificationPriority.HIGH,
            }
          : {}),
      },
      trigger: null,
    });
    if (__DEV__) console.log("[HomeAI] Staging complete notification scheduled");
  } catch (e) {
    if (__DEV__) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[HomeAI] Staging notification failed:", msg);
    }
    throw e;
  }
}
