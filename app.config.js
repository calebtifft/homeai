const path = require("path");
const appJson = require("./app.json");

// Loaded when Metro / Xcode "Bundle React Native code" runs export:embed.
require("dotenv").config({ path: path.join(__dirname, ".env") });

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      replicateApiToken: process.env.EXPO_PUBLIC_REPLICATE_API_TOKEN ?? "",
      replicateModelVersion: process.env.EXPO_PUBLIC_REPLICATE_MODEL_VERSION ?? "",
      replicateSeed: process.env.EXPO_PUBLIC_REPLICATE_SEED ?? "",
      stagingMock: process.env.EXPO_PUBLIC_STAGING_MOCK ?? "",
      geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "",
      geminiModel: process.env.EXPO_PUBLIC_GEMINI_MODEL ?? "",
      geminiPromptAugment: process.env.EXPO_PUBLIC_GEMINI_PROMPT_AUGMENT ?? "",
      geminiUseVision: process.env.EXPO_PUBLIC_GEMINI_USE_VISION ?? "",
    },
  },
};
