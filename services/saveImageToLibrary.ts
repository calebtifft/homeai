import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

function isRemoteUri(uri: string): boolean {
  return uri.startsWith("http://") || uri.startsWith("https://");
}

/**
 * Saves an image to the device photo library (remote URLs are downloaded first).
 */
export async function saveImageToPhotoLibrary(imageUri: string): Promise<void> {
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) {
    throw new Error("Allow photo library access to save this image.");
  }

  let localUri = imageUri;
  if (isRemoteUri(imageUri)) {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) {
      throw new Error("Saving remote images needs the iOS or Android app (not web).");
    }
    const lower = imageUri.split("?")[0]?.toLowerCase() ?? "";
    const ext = lower.endsWith(".png") ? "png" : "jpg";
    const dest = `${cacheDir}homeai-${Date.now()}.${ext}`;
    const { uri } = await FileSystem.downloadAsync(imageUri, dest);
    localUri = uri;
  }

  await MediaLibrary.saveToLibraryAsync(localUri);
}
