import Constants from "expo-constants";

type ExtraRecord = Record<string, unknown>;

function extraBag(): ExtraRecord | undefined {
  return Constants.expoConfig?.extra as ExtraRecord | undefined;
}

/** Runtime fallback when `process.env.EXPO_PUBLIC_*` is not inlined in Xcode embed builds. */
export function expoExtraString(key: string): string | undefined {
  const extra = extraBag();
  const raw = extra?.[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const ENV_TO_EXTRA: Record<string, string> = {
  EXPO_PUBLIC_REPLICATE_API_TOKEN: "replicateApiToken",
  EXPO_PUBLIC_REPLICATE_MODEL_VERSION: "replicateModelVersion",
  EXPO_PUBLIC_REPLICATE_SEED: "replicateSeed",
  EXPO_PUBLIC_STAGING_MOCK: "stagingMock",
  EXPO_PUBLIC_GEMINI_API_KEY: "geminiApiKey",
  EXPO_PUBLIC_GEMINI_MODEL: "geminiModel",
  EXPO_PUBLIC_GEMINI_PROMPT_AUGMENT: "geminiPromptAugment",
  EXPO_PUBLIC_GEMINI_USE_VISION: "geminiUseVision",
};

export function envFromProcessOrExtra(envKey: string): string | undefined {
  switch (envKey) {
    case "EXPO_PUBLIC_REPLICATE_API_TOKEN":
      return (
        process.env.EXPO_PUBLIC_REPLICATE_API_TOKEN ??
        expoExtraString("replicateApiToken")
      );
    case "EXPO_PUBLIC_REPLICATE_MODEL_VERSION":
      return (
        process.env.EXPO_PUBLIC_REPLICATE_MODEL_VERSION ??
        expoExtraString("replicateModelVersion")
      );
    case "EXPO_PUBLIC_REPLICATE_SEED":
      return (
        process.env.EXPO_PUBLIC_REPLICATE_SEED ?? expoExtraString("replicateSeed")
      );
    case "EXPO_PUBLIC_STAGING_MOCK":
      return process.env.EXPO_PUBLIC_STAGING_MOCK ?? expoExtraString("stagingMock");
    case "EXPO_PUBLIC_GEMINI_API_KEY":
      return process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? expoExtraString("geminiApiKey");
    case "EXPO_PUBLIC_GEMINI_MODEL":
      return process.env.EXPO_PUBLIC_GEMINI_MODEL ?? expoExtraString("geminiModel");
    case "EXPO_PUBLIC_GEMINI_PROMPT_AUGMENT":
      return (
        process.env.EXPO_PUBLIC_GEMINI_PROMPT_AUGMENT ??
        expoExtraString("geminiPromptAugment")
      );
    case "EXPO_PUBLIC_GEMINI_USE_VISION":
      return (
        process.env.EXPO_PUBLIC_GEMINI_USE_VISION ??
        expoExtraString("geminiUseVision")
      );
    default: {
      const extraKey = ENV_TO_EXTRA[envKey];
      return extraKey ? expoExtraString(extraKey) : undefined;
    }
  }
}
