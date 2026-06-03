import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_ONBOARDING_COMPLETE = "@homeai/onboarding_complete_v1";

export async function getOnboardingComplete(): Promise<boolean> {
  const v = await AsyncStorage.getItem(STORAGE_ONBOARDING_COMPLETE);
  return v === "1";
}

export async function setOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_ONBOARDING_COMPLETE, "1");
}
