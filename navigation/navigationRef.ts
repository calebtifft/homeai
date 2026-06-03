import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "../types";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateFromNotification(route: "History" | "Home"): boolean {
  if (!navigationRef.isReady()) return false;
  if (route === "History") {
    navigationRef.navigate("History");
    return true;
  }
  navigationRef.navigate("Home");
  return true;
}
