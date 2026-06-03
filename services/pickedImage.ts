import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "react-native";
import { withTimeout } from "../utils/withTimeout";

/** Keep uploads predictable; staging downscales again before Replicate. */
const MAX_PICK_EDGE = 4096;
const IMAGE_SIZE_LOOKUP_MS = 20_000;
const NORMALIZE_PHOTO_MS = 90_000;

function getImageDimensions(
  uri: string
): Promise<{ width: number; height: number }> {
  return withTimeout(
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(
        uri,
        (width, height) => resolve({ width, height }),
        (e) => reject(e ?? new Error("Could not read photo dimensions."))
      );
    }),
    IMAGE_SIZE_LOOKUP_MS,
    "Could not read photo dimensions."
  );
}

async function ensureFileUri(uri: string): Promise<{ uri: string; temp: boolean }> {
  if (uri.startsWith("file://")) {
    return { uri, temp: false };
  }
  const baseDir = FileSystem.cacheDirectory;
  if (!baseDir) {
    throw new Error(
      "Could not read this photo. Try taking the picture again inside HomeAI."
    );
  }
  const path = uri.split("?")[0] ?? uri;
  const extMatch = path.match(/\.(jpe?g|png|heic|heif|webp)$/i);
  const ext = extMatch ? extMatch[0].toLowerCase() : ".jpg";
  const dest = `${baseDir}homeai-pick-${Date.now()}${ext}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return { uri: dest, temp: true };
}

/**
 * iPhone camera / library picks are often HEIC with non-file URIs. Replicate and
 * FileSystem uploads need a stable JPEG file:// path.
 */
async function normalizePickedImageUriInner(sourceUri: string): Promise<string> {
  const trimmed = sourceUri?.trim();
  if (!trimmed) {
    throw new Error("No photo was selected.");
  }

  const { uri: fileUri, temp: copiedTemp } = await ensureFileUri(trimmed);

  let actions: ImageManipulator.Action[] = [];
  try {
    const dim = await getImageDimensions(fileUri);
    const longest = Math.max(dim.width, dim.height);
    if (longest > MAX_PICK_EDGE) {
      const scale = MAX_PICK_EDGE / longest;
      actions = [{ resize: { width: Math.max(1, Math.round(dim.width * scale)) } }];
    }
  } catch {
    actions = [{ resize: { width: 2048 } }];
  }

  const out = await ImageManipulator.manipulateAsync(fileUri, actions, {
    compress: 0.92,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  if (copiedTemp && fileUri !== out.uri) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
  }

  return out.uri;
}

export function normalizePickedImageUri(sourceUri: string): Promise<string> {
  return withTimeout(
    normalizePickedImageUriInner(sourceUri),
    NORMALIZE_PHOTO_MS,
    "Photo preparation timed out. Try choosing the photo again."
  );
}
