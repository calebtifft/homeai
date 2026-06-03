import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const INSTALLATION_ID_KEY = "homeai.installation_id.v1";
const LEGACY_INSTALLATION_ID_KEY = "stageai.installation_id.v1";

function fallbackId(): string {
  return `homeai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Stable app-install identity (reset on reinstall/clear data).
 * Prefer this over hardware identifiers for privacy and policy compliance.
 */
export async function getInstallationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const legacy = await AsyncStorage.getItem(LEGACY_INSTALLATION_ID_KEY);
  if (legacy) {
    await AsyncStorage.setItem(INSTALLATION_ID_KEY, legacy);
    return legacy;
  }
  const id = typeof Crypto.randomUUID === "function" ? Crypto.randomUUID() : fallbackId();
  await AsyncStorage.setItem(INSTALLATION_ID_KEY, id);
  return id;
}
