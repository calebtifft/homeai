import Constants, { ExecutionEnvironment } from "expo-constants";
import { Linking, Platform } from "react-native";

export function isExpoGoClient(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** Opens App Store / Play subscription settings in the browser or store app. */
export async function openStoreSubscriptionUrl(): Promise<boolean> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;

  const url =
    Platform.OS === "ios"
      ? "https://apps.apple.com/account/subscriptions"
      : "https://play.google.com/store/account/subscriptions";

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    try {
      await Linking.openSettings();
      return true;
    } catch {
      return false;
    }
  }
}
