import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_LANGUAGE_ID,
  type LanguageId,
  isLanguageId,
} from "../constants/languages";

export const STORAGE_LANGUAGE_ID = "@homeai/settings/language_id";
const LEGACY_STORAGE_LANGUAGE_ID = "@stageai/settings/language_id";

export async function loadLanguageId(): Promise<LanguageId> {
  let raw = await AsyncStorage.getItem(STORAGE_LANGUAGE_ID);
  if (!raw) {
    raw = await AsyncStorage.getItem(LEGACY_STORAGE_LANGUAGE_ID);
    if (raw) {
      await AsyncStorage.setItem(STORAGE_LANGUAGE_ID, raw);
    }
  }
  if (raw && isLanguageId(raw)) return raw;
  return DEFAULT_LANGUAGE_ID;
}

export async function setLanguageId(value: LanguageId): Promise<void> {
  await AsyncStorage.setItem(STORAGE_LANGUAGE_ID, value);
}
