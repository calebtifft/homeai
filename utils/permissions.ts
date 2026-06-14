import { Platform } from "react-native";

/** iOS 14+ "Select Photos…" — still usable for picking images. */
export function isMediaLibraryAccessGranted(status: string): boolean {
  return status === "granted" || status === "limited";
}

export function isCameraAccessGranted(status: string): boolean {
  return status === "granted";
}

export function isNotificationAccessGranted(status: string): boolean {
  return status === "granted" || status === "provisional";
}

/** Only offer Settings when the OS will not show the in-app prompt again. */
export function shouldOfferPermissionSettings(
  status: string,
  canAskAgain?: boolean
): boolean {
  if (isNotificationAccessGranted(status)) return false;
  if (status === "undetermined") return false;
  if (Platform.OS === "android") {
    return canAskAgain === false;
  }
  return status === "denied";
}
