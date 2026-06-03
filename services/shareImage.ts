import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

function isRemoteUri(uri: string): boolean {
  return uri.startsWith("http://") || uri.startsWith("https://");
}

async function ensureLocalShareUri(uri: string): Promise<string> {
  if (!isRemoteUri(uri)) return uri;
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error("Sharing remote images requires the mobile app.");
  const lower = uri.split("?")[0]?.toLowerCase() ?? "";
  const ext = lower.endsWith(".png") ? "png" : "jpg";
  const dest = `${cacheDir}homeai-share-${Date.now()}.${ext}`;
  const { uri: local } = await FileSystem.downloadAsync(uri, dest);
  return local;
}

/** Opens the system share sheet for a staged image (local or remote). */
export async function shareImageUri(
  imageUri: string,
  message?: string
): Promise<void> {
  const localUri = await ensureLocalShareUri(imageUri);
  if (Platform.OS === "ios") {
    await Share.share({ url: localUri, message });
    return;
  }
  await Share.share({
    message: message ?? "",
    url: localUri,
    title: message,
  });
}
