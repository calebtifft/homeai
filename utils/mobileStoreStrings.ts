import { Platform } from "react-native";
import type { LanguageId } from "../constants/languages";

/** Injected into `translate()` so copy mentions only the current platform store. */
export type MobileStoreTranslationVars = {
  store: string;
  storeAccount: string;
  nativeBuild: string;
};

type StoreVarPair = {
  ios: MobileStoreTranslationVars;
  android: MobileStoreTranslationVars;
};

const EN: StoreVarPair = {
  ios: {
    store: "App Store",
    storeAccount: "App Store account",
    nativeBuild: "iOS",
  },
  android: {
    store: "Google Play",
    storeAccount: "Google Play account",
    nativeBuild: "Android",
  },
};

const ES: StoreVarPair = {
  ios: {
    store: "App Store",
    storeAccount: "cuenta de App Store",
    nativeBuild: "iOS",
  },
  android: {
    store: "Google Play",
    storeAccount: "cuenta de Google Play",
    nativeBuild: "Android",
  },
};

const KO: StoreVarPair = {
  ios: {
    store: "App Store",
    storeAccount: "App Store 계정",
    nativeBuild: "iOS",
  },
  android: {
    store: "Google Play",
    storeAccount: "Google Play 계정",
    nativeBuild: "Android",
  },
};

const JA: StoreVarPair = {
  ios: {
    store: "App Store",
    storeAccount: "App Store アカウント",
    nativeBuild: "iOS",
  },
  android: {
    store: "Google Play",
    storeAccount: "Google Play アカウント",
    nativeBuild: "Android",
  },
};

const ZH_CN: StoreVarPair = {
  ios: {
    store: "App Store",
    storeAccount: "App Store 账户",
    nativeBuild: "iOS",
  },
  android: {
    store: "Google Play",
    storeAccount: "Google Play 账户",
    nativeBuild: "Android",
  },
};

const ZH_TW: StoreVarPair = {
  ios: {
    store: "App Store",
    storeAccount: "App Store 帳戶",
    nativeBuild: "iOS",
  },
  android: {
    store: "Google Play",
    storeAccount: "Google Play 帳戶",
    nativeBuild: "Android",
  },
};

function localeStoreVars(languageId: LanguageId): StoreVarPair {
  if (languageId.startsWith("es")) return ES;
  if (languageId === "ko") return KO;
  if (languageId === "ja") return JA;
  if (languageId === "zh-CN") return ZH_CN;
  if (languageId === "zh-TW") return ZH_TW;
  return EN;
}

export function mobileStoreTranslationVars(
  languageId: LanguageId
): MobileStoreTranslationVars {
  const pair = localeStoreVars(languageId);
  if (Platform.OS === "android") return pair.android;
  return pair.ios;
}
