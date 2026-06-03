import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";

export const STORAGE_NOTIFICATIONS = "@homeai/settings/notifications_enabled";
export const STORAGE_DARK_MODE = "@homeai/settings/dark_mode";
const LEGACY_STORAGE_NOTIFICATIONS = "@stageai/settings/notifications_enabled";
const LEGACY_STORAGE_DARK_MODE = "@stageai/settings/dark_mode";

export async function loadSettingsToggles(): Promise<{
  notificationsOn: boolean;
  darkModeOn: boolean;
}> {
  let [n, d] = await Promise.all([
    AsyncStorage.getItem(STORAGE_NOTIFICATIONS),
    AsyncStorage.getItem(STORAGE_DARK_MODE),
  ]);
  if (n === null) {
    n = await AsyncStorage.getItem(LEGACY_STORAGE_NOTIFICATIONS);
    if (n !== null) await AsyncStorage.setItem(STORAGE_NOTIFICATIONS, n);
  }
  if (d === null) {
    d = await AsyncStorage.getItem(LEGACY_STORAGE_DARK_MODE);
    if (d !== null) await AsyncStorage.setItem(STORAGE_DARK_MODE, d);
  }
  return {
    notificationsOn: n === null ? true : n === "1",
    darkModeOn: d === "1",
  };
}

export async function setNotificationsEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_NOTIFICATIONS, value ? "1" : "0");
}

export async function setDarkModeEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_DARK_MODE, value ? "1" : "0");
  Appearance.setColorScheme(value ? "dark" : "light");
}
